import type { AsyncDuckDB, AsyncDuckDBConnection, DuckDBBundles } from '@duckdb/duckdb-wasm'
import type { RecordBatch, Table } from 'apache-arrow'
import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url'
import ehWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url'
import mvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url'
import type {
  DensityIndex,
  DensityYear,
  DetailCells,
  DetailRaster,
  DetailTile,
  EstimateTotals,
  RawAggregate,
  RawBinCount,
  RawCellKey,
  RawDetectionRow,
  RawTablePage,
  SelectionCsvRow,
  TileDocument,
  TileIndex,
  TileRef,
} from '@/types/detections'
import type { ModelArtifact } from '@/types/model'
import type { GeoExtent, LonLat } from '@/types/map'
import {
  CALENDAR_MAP_LAT_MAX,
  CALENDAR_MAP_LAT_MIN,
  CALENDAR_MAP_LON_MAX,
  CALENDAR_MAP_LON_MIN,
} from './constants'
import { pointInPolygon, polygonBounds, rectanglePolygon } from './selection'
import type { Selection } from './selection'
import { selectionCsv, selectionCsvName } from './selectionCsv'

export const RAW_PAGE_REGION = 'CA'
export const RAW_MAP_HEIGHT_PX = 460
export const RAW_MAP_PADDING_DEG = 1
export const RAW_TABLE_LIMIT = 200
export const RAW_POINT_SEED = 424242

/** One tile of prefetch, so a small pan does not refetch. */
export const DETAIL_TILE_MARGIN = 1

export const RAW_MAP_EXTENT = {
  minLat: CALENDAR_MAP_LAT_MIN,
  maxLat: CALENDAR_MAP_LAT_MAX,
  minLon: CALENDAR_MAP_LON_MIN,
  maxLon: CALENDAR_MAP_LON_MAX,
}

export interface BinRule {
  label: string
  min: number
  max: number
  p: number
}

export interface SelectionLoad {
  aggregate: RawAggregate
  elapsedMs: number
}

export interface ScopedDensity {
  max: number
  cells: number
}

const BUNDLES: DuckDBBundles = {
  mvp: { mainModule: mvpWasm, mainWorker: mvpWorker },
  eh: { mainModule: ehWasm, mainWorker: ehWorker },
}

let database: AsyncDuckDB | null = null
let selectionConnection: AsyncDuckDBConnection | null = null
let tableConnection: AsyncDuckDBConnection | null = null
let opening: Promise<void> | null = null
let cellDaysYear: number | null = null
let cellDaysBuffer = ''
let detectionsYear: number | null = null
let detectionsBuffer = ''
let selectionInFlight = false
let tableInFlight = false
let selectionCounter = 0

// Parquet buffers are database-wide; registration and eviction must not race a query.
let bufferChain: Promise<unknown> = Promise.resolve()

function serialBuffer<T>(task: () => Promise<T>): Promise<T> {
  const next = bufferChain.then(task, task)
  bufferChain = next.catch(() => undefined)
  return next
}

function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL
  return `${base.endsWith('/') ? base : `${base}/`}${path.replace(/^\/+/, '')}`
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(assetUrl(path), { cache: 'no-cache' })
  if (!response.ok) throw new Error(`${path} unavailable (${response.status})`)
  return (await response.json()) as T
}

export async function fetchDensityIndex(): Promise<DensityIndex> {
  const payload = await fetchJson<DensityIndex>('density/index.json')
  if (!Array.isArray(payload.years) || payload.years.length === 0) {
    throw new Error('density/index.json has no years')
  }
  for (const item of payload.years) {
    if (!Number.isInteger(item.year) || !Number.isFinite(item.cell_days) || item.cell_days <= 0) {
      throw new Error('density/index.json has a malformed year entry')
    }
  }
  return payload
}

/** Display raster only; no DuckDB and no whole-year cell-day table. */
export async function fetchDensityYear(year: number): Promise<DensityYear> {
  const payload = await fetchJson<DensityYear>(`density/${RAW_PAGE_REGION}-${year}.json`)
  if (payload.schema !== 'fire-density/1' || payload.year !== year) {
    throw new Error(`density/${RAW_PAGE_REGION}-${year}.json is not a fire-density/1 document`)
  }
  if (payload.stepDeg !== undefined && payload.stepDeg !== 0.1) {
    throw new Error(`density/${RAW_PAGE_REGION}-${year}.json does not use 0.1° bins`)
  }
  if (!Array.isArray(payload.cells)) throw new Error(`density/${RAW_PAGE_REGION}-${year}.json has no cells`)

  const count = payload.cells.length
  const cells = {
    lat: new Float64Array(count),
    lon: new Float64Array(count),
    detections: new Int32Array(count),
    modis: new Int32Array(count),
    viirs: new Int32Array(count),
    frp: new Float64Array(count),
  }
  payload.cells.forEach((cell, index) => {
    cells.lat[index] = cell[0]
    cells.lon[index] = cell[1]
    cells.detections[index] = cell[2]
    cells.modis[index] = cell[3]
    cells.viirs[index] = cell[4]
    cells.frp[index] = cell[5]
  })
  return { ...payload, stepDeg: 0.1, cells, count }
}

export async function fetchModelArtifact(region: string): Promise<ModelArtifact> {
  const model = await fetchJson<ModelArtifact>(`artifacts/model/${region}.json`)
  if (!Array.isArray(model.multiplicity_bins) || model.multiplicity_bins.length !== 4) {
    throw new Error(`artifacts/model/${region}.json must publish exactly four multiplicity bins`)
  }
  binRules(model)
  return model
}

function parseBin(label: string): { min: number; max: number } {
  const match = /^(\d+)(?:[-–](\d+))?(\+)?$/.exec(label.trim())
  if (!match) throw new Error(`model/CA.json has an unknown multiplicity bin: ${label}`)
  const min = Number(match[1])
  if (match[3]) return { min, max: Number.POSITIVE_INFINITY }
  if (match[2]) return { min, max: Number(match[2]) }
  return { min, max: min }
}

/** Edges come from the published labels; only `p` is applied, never refitted. */
export function binRules(model: ModelArtifact): BinRule[] {
  const rules = model.multiplicity_bins.map((bin) => {
    const edges = parseBin(bin.label)
    if (!Number.isFinite(bin.p) || bin.p < 0 || bin.p > 1) {
      throw new Error(`model/CA.json bin ${bin.label} has an invalid p`)
    }
    return { label: bin.label, p: bin.p, ...edges }
  })
  for (const rule of rules) {
    if (rule.min > rule.max) throw new Error(`model/CA.json bin ${rule.label} is inverted`)
  }
  return rules
}

function binFor(count: number, rules: BinRule[]): BinRule {
  const rule = rules.find((candidate) => count >= candidate.min && count <= candidate.max)
  if (!rule) throw new Error(`No published multiplicity bin covers ${count} VIIRS detections`)
  return rule
}

export function displayBinLabel(label: string): string {
  return label.replace('-', '–')
}

export function satelliteLabel(satellite: string): string {
  if (satellite === 'N') return 'Suomi NPP'
  if (satellite === 'N20') return 'NOAA-20'
  return satellite
}

export interface ScopeOption {
  value: string
  label: string
}

/**
 * Published density years start in 2012; Terra, Aqua and Suomi NPP are present in
 * every one of them. The raw table filters the satellite column exactly.
 */
export function scopeOptions(year: number): ScopeOption[] {
  const options: ScopeOption[] = [
    { value: 'all', label: 'All' },
    { value: 'Terra', label: 'MODIS Terra' },
    { value: 'Aqua', label: 'MODIS Aqua' },
  ]
  if (year >= 2012) options.push({ value: 'N', label: 'Suomi NPP' })
  return options
}

export function densityValue(density: DensityYear, index: number, scope: string | null): number {
  if (scope === 'N') return density.cells.viirs[index]
  if (scope === 'Terra' || scope === 'Aqua') return density.cells.modis[index]
  return density.cells.detections[index]
}

export function scopedDensity(density: DensityYear, scope: string | null): ScopedDensity {
  let max = 0
  let cells = 0
  for (let i = 0; i < density.count; i += 1) {
    const value = densityValue(density, i, scope)
    if (value > 0) cells += 1
    if (value > max) max = value
  }
  return { max, cells }
}

export function densityViewExtent(density: DensityYear): GeoExtent {
  if (density.count === 0) return RAW_MAP_EXTENT
  const half = density.stepDeg / 2
  let minLat = Number.POSITIVE_INFINITY
  let maxLat = Number.NEGATIVE_INFINITY
  let minLon = Number.POSITIVE_INFINITY
  let maxLon = Number.NEGATIVE_INFINITY
  for (let i = 0; i < density.count; i += 1) {
    const lat = density.cells.lat[i]
    const lon = density.cells.lon[i]
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
    if (lon < minLon) minLon = lon
    if (lon > maxLon) maxLon = lon
  }
  return {
    minLat: Math.max(CALENDAR_MAP_LAT_MIN, minLat - half - RAW_MAP_PADDING_DEG),
    maxLat: Math.min(CALENDAR_MAP_LAT_MAX, maxLat + half + RAW_MAP_PADDING_DEG),
    minLon: Math.max(CALENDAR_MAP_LON_MIN, minLon - half - RAW_MAP_PADDING_DEG),
    maxLon: Math.min(CALENDAR_MAP_LON_MAX, maxLon + half + RAW_MAP_PADDING_DEG),
  }
}

/** Every density cell, not the clipped viewport: the full-extent selection must count all cell-days. */
export function densityExtentPolygon(density: DensityYear): LonLat[] {
  const half = density.stepDeg / 2
  let minLat = Number.POSITIVE_INFINITY
  let maxLat = Number.NEGATIVE_INFINITY
  let minLon = Number.POSITIVE_INFINITY
  let maxLon = Number.NEGATIVE_INFINITY
  for (let i = 0; i < density.count; i += 1) {
    const lat = density.cells.lat[i]
    const lon = density.cells.lon[i]
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
    if (lon < minLon) minLon = lon
    if (lon > maxLon) maxLon = lon
  }
  const pad = 0.05
  return rectanglePolygon(
    { lon: minLon - half - pad, lat: minLat - half - pad },
    { lon: maxLon + half + pad, lat: maxLat + half + pad },
  )
}

/** Country totals from the density artifact. Cell-day bins need a selection. */
export function densityTotals(
  density: DensityYear,
  scope: string | null,
  cellDays: number | null,
): RawAggregate {
  let detections = 0
  let modisDetections = 0
  let viirsDetections = 0
  let frp = 0
  for (let i = 0; i < density.count; i += 1) {
    const modis = density.cells.modis[i]
    const viirs = density.cells.viirs[i]
    if (scope === 'N') {
      detections += viirs
      viirsDetections += viirs
    } else if (scope === 'Terra' || scope === 'Aqua') {
      detections += modis
      modisDetections += modis
    } else {
      detections += density.cells.detections[i]
      modisDetections += modis
      viirsDetections += viirs
    }
    frp += density.cells.frp[i]
  }
  return {
    source: 'density',
    detections,
    cellDays: scope ? null : cellDays,
    modisCellDays: null,
    viirsCellDays: null,
    viirsOnlyCellDays: 0,
    modisDetections,
    viirsDetections,
    frp: scope ? null : frp,
    bins: [],
    cells: null,
  }
}

/* -------------------------------------------------------------------------- */
/* 0.01° detail tiles, loaded only for the visible viewport                    */
/* -------------------------------------------------------------------------- */

export function tileKey(i: number, j: number): string {
  return `${i}_${j}`
}

export function tileRefsForExtent(extent: GeoExtent, tileDeg: number, marginTiles: number): TileRef[] {
  const refs: TileRef[] = []
  if (!(tileDeg > 0)) return refs
  const firstI = Math.floor(extent.minLat / tileDeg) - marginTiles
  const lastI = Math.floor(extent.maxLat / tileDeg) + marginTiles
  const firstJ = Math.floor(extent.minLon / tileDeg) - marginTiles
  const lastJ = Math.floor(extent.maxLon / tileDeg) + marginTiles
  for (let i = firstI; i <= lastI; i += 1) {
    for (let j = firstJ; j <= lastJ; j += 1) refs.push({ i, j })
  }
  return refs
}

export async function fetchTileIndex(): Promise<TileIndex> {
  const path = `tiles/${RAW_PAGE_REGION}/index.json`
  const payload = await fetchJson<TileIndex>(path)
  if (!Array.isArray(payload.years) || payload.years.length === 0) {
    throw new Error(`${path} has no years`)
  }
  if (!(payload.step_deg > 0) || !(payload.tile_deg > 0)) {
    throw new Error(`${path} has no step or tile size`)
  }
  for (const item of payload.years) {
    if (!Number.isInteger(item.year) || !Array.isArray(item.tiles)) {
      throw new Error(`${path} has a malformed year entry`)
    }
  }
  return payload
}

let detailYear: number | null = null
const detailCache = new Map<string, DetailTile>()
const detailPending = new Map<string, Promise<DetailTile>>()

/** Year change drops the decoded tiles; the fetches that are in flight land in dead keys. */
export function resetDetailTiles(): void {
  detailYear = null
  detailCache.clear()
  detailPending.clear()
}

function cacheKey(year: number, i: number, j: number): string {
  return `${year}:${i}_${j}`
}

function missingTile(i: number, j: number): DetailTile {
  return { key: tileKey(i, j), tile: [i, j], cells: null, bytes: 0 }
}

function decodeTile(doc: TileDocument, i: number, j: number, bytes: number): DetailTile {
  const count = doc.cells.length
  const cells: DetailCells = {
    clat: new Int32Array(count),
    clon: new Int32Array(count),
    modis: new Int32Array(count),
    viirs: new Int32Array(count),
  }
  for (let index = 0; index < count; index += 1) {
    const cell = doc.cells[index]
    cells.clat[index] = cell[0]
    cells.clon[index] = cell[1]
    cells.modis[index] = cell[4]
    cells.viirs[index] = cell[5]
  }
  return { key: tileKey(i, j), tile: [i, j], cells, bytes }
}

async function fetchTile(year: number, ref: TileRef): Promise<DetailTile> {
  const path = `tiles/${RAW_PAGE_REGION}/${year}/${tileKey(ref.i, ref.j)}.json`
  try {
    const response = await fetch(assetUrl(path), { cache: 'no-cache' })
    if (!response.ok) {
      if (response.status !== 404) console.warn(`[detail] ${path} unavailable (${response.status})`)
      return missingTile(ref.i, ref.j)
    }
    const text = await response.text()
    const doc = JSON.parse(text) as TileDocument
    if (doc.schema !== 'fire-tile/1' || doc.year !== year || !Array.isArray(doc.cells)) {
      throw new Error(`${path} is not a fire-tile/1 document`)
    }
    return decodeTile(doc, ref.i, ref.j, text.length)
  } catch (error) {
    console.warn(`[detail] ${path} skipped`, error)
    return missingTile(ref.i, ref.j)
  }
}

export interface DetailLoad {
  tiles: DetailTile[]
  missing: string[]
  /** Bytes fetched by this call, not the size of the cached tiles. */
  bytes: number
}

export async function loadDetailTiles(year: number, refs: TileRef[]): Promise<DetailLoad> {
  if (detailYear !== year) {
    detailCache.clear()
    detailPending.clear()
    detailYear = year
  }
  const tiles: DetailTile[] = []
  const missing: string[] = []
  let bytes = 0
  for (const ref of refs) {
    const key = cacheKey(year, ref.i, ref.j)
    let tile = detailCache.get(key)
    if (!tile) {
      let pending = detailPending.get(key)
      if (!pending) {
        pending = fetchTile(year, ref).finally(() => detailPending.delete(key))
        detailPending.set(key, pending)
      }
      tile = await pending
      detailCache.set(key, tile)
      if (tile.cells) bytes += tile.bytes
    }
    tiles.push(tile)
    if (!tile.cells) missing.push(tile.key)
  }
  return { tiles, missing, bytes }
}

/** Detections, not cell-days, so the 0.01° tiles and the 0.1° raster share a unit. */
export function detailValue(cells: DetailCells, index: number, scope: string | null): number {
  if (scope === 'N') return cells.viirs[index]
  if (scope === 'Terra' || scope === 'Aqua') return cells.modis[index]
  return cells.modis[index] + cells.viirs[index]
}

export function detailRaster(tiles: readonly DetailTile[], scope: string | null, stepDeg: number): DetailRaster {
  const cells: Array<[number, number, number]> = []
  let max = 0
  let detections = 0
  for (const tile of tiles) {
    const grid = tile.cells
    if (!grid) continue
    for (let index = 0; index < grid.clat.length; index += 1) {
      const value = detailValue(grid, index, scope)
      if (value <= 0) continue
      cells.push([grid.clat[index] * stepDeg, grid.clon[index] * stepDeg, value])
      detections += value
      if (value > max) max = value
    }
  }
  return { cellDeg: stepDeg, cells, max, detections }
}

async function open(): Promise<void> {
  if (selectionConnection && tableConnection) return
  const duckdb = await import('@duckdb/duckdb-wasm')
  const bundle = await duckdb.selectBundle(BUNDLES)
  if (!bundle.mainWorker) throw new Error('DuckDB worker bundle unavailable')
  const worker = new Worker(bundle.mainWorker)
  database = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING), worker)
  await database.instantiate(bundle.mainModule, bundle.pthreadWorker)
  selectionConnection = await database.connect()
  tableConnection = await database.connect()
}

export async function initRawDuck(): Promise<void> {
  if (!opening) opening = open()
  await opening
}

async function cancelSelectionQuery(): Promise<void> {
  if (!selectionConnection || !selectionInFlight) return
  try {
    await selectionConnection.cancelSent()
  } catch {
    // A cancelled statement is expected; the caller ignores the stale result.
  }
}

async function cancelTableQuery(): Promise<void> {
  if (!tableConnection || !tableInFlight) return
  try {
    await tableConnection.cancelSent()
  } catch {
    // Same contract as above.
  }
}

export async function cancelQueries(): Promise<void> {
  await cancelSelectionQuery()
  await cancelTableQuery()
}

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

async function fetchParquet(path: string): Promise<Uint8Array> {
  const response = await fetch(assetUrl(path), { cache: 'no-cache' })
  if (!response.ok) throw new Error(`${path} unavailable (${response.status})`)
  return new Uint8Array(await response.arrayBuffer())
}

async function ensureCellDays(year: number): Promise<void> {
  if (!database) throw new Error('DuckDB is not ready')
  if (cellDaysYear === year) return
  await cancelSelectionQuery()
  const name = `celldays_${year}_${RAW_POINT_SEED}.parquet`
  const bytes = await fetchParquet(`celldays/${RAW_PAGE_REGION}-${year}.parquet`)
  if (cellDaysBuffer) await database.dropFile(cellDaysBuffer)
  await database.registerFileBuffer(name, bytes)
  cellDaysBuffer = name
  cellDaysYear = year
}

async function ensureDetections(year: number): Promise<void> {
  if (!database) throw new Error('DuckDB is not ready')
  if (detectionsYear === year) return
  await cancelTableQuery()
  const name = `detections_${year}_${RAW_POINT_SEED}.parquet`
  const bytes = await fetchParquet(`detections/${RAW_PAGE_REGION}-${year}.parquet`)
  if (detectionsBuffer) await database.dropFile(detectionsBuffer)
  await database.registerFileBuffer(name, bytes)
  detectionsBuffer = name
  detectionsYear = year
}

async function sendQuery(connection: AsyncDuckDBConnection, sql: string): Promise<Table> {
  const reader = await connection.send(sql)
  const batches: RecordBatch[] = []
  for await (const batch of reader) batches.push(batch)
  const { Table } = await import('apache-arrow')
  return new Table(batches)
}

function numberValue(value: unknown): number {
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'number') return value
  return Number(value)
}

function ints(table: Table, name: string): Int32Array {
  const vector = table.getChild(name)
  if (!vector) throw new Error(`Query result is missing ${name}`)
  const values = vector.toArray() as ArrayLike<number | bigint>
  const output = new Int32Array(values.length)
  for (let i = 0; i < values.length; i += 1) output[i] = Number(values[i])
  return output
}

function doubles(table: Table, name: string): Float64Array {
  const vector = table.getChild(name)
  if (!vector) throw new Error(`Query result is missing ${name}`)
  const values = vector.toArray() as ArrayLike<number | bigint>
  const output = new Float64Array(values.length)
  for (let i = 0; i < values.length; i += 1) output[i] = Number(values[i])
  return output
}

function strings(table: Table, name: string): string[] {
  const vector = table.getChild(name)
  if (!vector) throw new Error(`Query result is missing ${name}`)
  return Array.from(vector.toArray() as ArrayLike<unknown>, (value) => String(value))
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const number = numberValue(value)
  return Number.isFinite(number) ? number : null
}

function rowsFromTable(table: Table): RawDetectionRow[] {
  return table.toArray().map((row: unknown) => {
    const record = row as Record<string, unknown>
    return {
      time: String(record.time ?? ''),
      lat: numberValue(record.lat),
      lon: numberValue(record.lon),
      bright4: nullableNumber(record.bright4),
      confidence: String(record.confidence ?? ''),
      frp: nullableNumber(record.frp),
      satellite: String(record.satellite ?? ''),
    }
  })
}

function sensorMask(scope: string | null): { modis: boolean; viirs: boolean } {
  if (scope === 'N') return { modis: false, viirs: true }
  if (scope === 'Terra' || scope === 'Aqua') return { modis: true, viirs: false }
  return { modis: true, viirs: true }
}

function satelliteClause(scope: string | null): string {
  return scope ? ` AND satellite = ${quote(scope)}` : ''
}

function cellBounds(selection: Selection): { minClat: number; maxClat: number; minClon: number; maxClon: number } {
  const bounds = polygonBounds(selection.polygon)
  return {
    minClat: Math.floor(bounds.minLat * 100) - 1,
    maxClat: Math.ceil(bounds.maxLat * 100) + 1,
    minClon: Math.floor(bounds.minLon * 100) - 1,
    maxClon: Math.ceil(bounds.maxLon * 100) + 1,
  }
}

function circleClause(selection: Selection): string {
  if (selection.mode !== 'circle' || !selection.radiusKm) return ''
  const centre = selection.polygon.reduce(
    (sum, point) => ({ lon: sum.lon + point.lon / selection.polygon.length, lat: sum.lat + point.lat / selection.polygon.length }),
    { lon: 0, lat: 0 },
  )
  return ` AND 6371.0088 * 2 * asin(LEAST(1.0, sqrt(
    power(sin(radians((clat * 0.01 - ${centre.lat}) / 2)), 2) +
    cos(radians(${centre.lat})) * cos(radians(clat * 0.01)) *
    power(sin(radians((clon * 0.01 - ${centre.lon}) / 2)), 2)
  ))) <= ${selection.radiusKm}`
}

/** Bbox in SQL; only a lasso needs the JS point-in-polygon pass. */
export async function loadSelection(
  year: number,
  selection: Selection,
  scope: string | null,
  rules: BinRule[] | null,
  totalCellDays: number,
): Promise<SelectionLoad> {
  await initRawDuck()
  await serialBuffer(() => ensureCellDays(year))
  if (!selectionConnection) throw new Error('DuckDB selection connection is not ready')

  const started = performance.now()
  const bounds = cellBounds(selection)
  const sql = `
    SELECT clat, clon,
           CAST(n_modis AS INTEGER) AS n_modis,
           CAST(n_viirs AS INTEGER) AS n_viirs,
           CAST(frp AS DOUBLE) AS frp
    FROM read_parquet(${quote(cellDaysBuffer)})
    WHERE clat BETWEEN ${bounds.minClat} AND ${bounds.maxClat}
      AND clon BETWEEN ${bounds.minClon} AND ${bounds.maxClon}${circleClause(selection)}
  `

  if (selectionInFlight) await cancelSelectionQuery()
  selectionInFlight = true
  let table: Table
  try {
    table = await sendQuery(selectionConnection, sql)
  } finally {
    selectionInFlight = false
  }

  const clat = ints(table, 'clat')
  const clon = ints(table, 'clon')
  const nModis = ints(table, 'n_modis')
  const nViirs = ints(table, 'n_viirs')
  const frp = doubles(table, 'frp')
  const mask = sensorMask(scope)
  const bins: RawBinCount[] =
    rules?.map((rule) => ({ label: rule.label, p: rule.p, cellDays: 0, expected: 0 })) ?? []
  const binIndex = new Map(bins.map((bin, index) => [bin.label, index]))
  const cellSet = new Set<number>()
  const cells: RawCellKey[] = []
  let cellDays = 0
  let modisCellDays = 0
  let viirsCellDays = 0
  let viirsOnlyCellDays = 0
  let modisDetections = 0
  let viirsDetections = 0
  let frpSum = 0
  const lasso = selection.mode === 'lasso'

  for (let i = 0; i < clat.length; i += 1) {
    if (lasso && !pointInPolygon(clon[i] * 0.01, clat[i] * 0.01, selection.polygon)) continue
    const m = mask.modis ? nModis[i] : 0
    const v = mask.viirs ? nViirs[i] : 0
    if (m === 0 && v === 0) continue
    const key = clat[i] * 100000 + clon[i]
    if (!cellSet.has(key)) {
      cellSet.add(key)
      cells.push({ clat: clat[i], clon: clon[i] })
    }
    cellDays += 1
    modisDetections += m
    viirsDetections += v
    frpSum += frp[i]
    if (m > 0) modisCellDays += 1
    if (v > 0) viirsCellDays += 1
    if (m === 0 && v > 0) {
      viirsOnlyCellDays += 1
      if (rules) {
        const rule = binFor(v, rules)
        const index = binIndex.get(rule.label)
        if (index !== undefined) bins[index].cellDays += 1
      }
    }
  }
  for (const bin of bins) bin.expected = bin.cellDays * bin.p

  const fullExtent = selection.mode === 'extent' || (cellDays === totalCellDays && !scope)
  const aggregate: RawAggregate = {
    source: 'celldays',
    detections: modisDetections + viirsDetections,
    cellDays,
    modisCellDays,
    viirsCellDays,
    viirsOnlyCellDays,
    modisDetections,
    viirsDetections,
    frp: scope ? null : frpSum,
    bins,
    cells: fullExtent ? null : cells,
  }
  return { aggregate, elapsedMs: performance.now() - started }
}

const ROW_SELECT = `
  SELECT strftime(d.acq_date, '%Y-%m-%d') || ' ' ||
         lpad(CAST(CAST(d.minutes AS INTEGER) // 60 AS VARCHAR), 2, '0') || ':' ||
         lpad(CAST(CAST(d.minutes AS INTEGER) % 60 AS VARCHAR), 2, '0') AS time,
         CAST(d.lat AS DOUBLE) AS lat, CAST(d.lon AS DOUBLE) AS lon,
         CAST(d.bright_4um AS DOUBLE) AS bright4,
         CAST(d.confidence AS VARCHAR) AS confidence, CAST(d.frp AS DOUBLE) AS frp,
         CAST(d.satellite AS VARCHAR) AS satellite
`

export async function loadSelectionRows(
  year: number,
  scope: string | null,
  cells: RawCellKey[] | null,
): Promise<RawTablePage> {
  await initRawDuck()
  await serialBuffer(() => ensureDetections(year))
  if (!tableConnection || !database) throw new Error('DuckDB table connection is not ready')
  if (cells !== null && cells.length === 0) {
    return { rows: [], total: 0, limit: RAW_TABLE_LIMIT, newestFirst: true }
  }

  const where = `WHERE TRUE${satelliteClause(scope)}`
  const order = 'ORDER BY d.acq_date DESC, d.minutes DESC'
  let selectionBuffer = ''
  let sql: string

  if (cells === null) {
    sql = `
      ${ROW_SELECT.trim()}, count(*) OVER () AS total
      FROM (
        SELECT *, CAST(ROUND(lat / 0.01) AS BIGINT) AS clat, CAST(ROUND(lon / 0.01) AS BIGINT) AS clon
        FROM read_parquet(${quote(detectionsBuffer)})
      ) d ${where} ${order} LIMIT ${RAW_TABLE_LIMIT}
    `
  } else {
    selectionCounter += 1
    selectionBuffer = `sel_${selectionCounter}_${RAW_POINT_SEED}.csv`
    const csv = `clat,clon\n${cells.map((cell) => `${cell.clat},${cell.clon}`).join('\n')}\n`
    await database.registerFileBuffer(selectionBuffer, new TextEncoder().encode(csv))
    sql = `
      ${ROW_SELECT.trim()}, count(*) OVER () AS total
      FROM (
        SELECT *, CAST(ROUND(lat / 0.01) AS BIGINT) AS clat, CAST(ROUND(lon / 0.01) AS BIGINT) AS clon
        FROM read_parquet(${quote(detectionsBuffer)})
      ) d
      JOIN read_csv_auto(${quote(selectionBuffer)}, header = true) s USING (clat, clon)
      ${where} ${order} LIMIT ${RAW_TABLE_LIMIT}
    `
  }

  if (tableInFlight) await cancelTableQuery()
  tableInFlight = true
  try {
    const table = await sendQuery(tableConnection, sql)
    const rows = rowsFromTable(table)
    const total = table.numRows > 0 ? numberValue(table.getChild('total')?.get(0)) : 0
    return { rows, total, limit: RAW_TABLE_LIMIT, newestFirst: true }
  } finally {
    tableInFlight = false
    if (selectionBuffer) await database.dropFile(selectionBuffer)
  }
}

export interface SelectionExport {
  filename: string
  csv: string
  rows: number
}

/** The export's sensor scope must select the same cell-days as `loadSelection`. */
function sensorHavingClause(scope: string | null): string {
  if (scope === 'N') return `HAVING count(*) FILTER (WHERE sensor = 'VIIRS') > 0`
  if (scope === 'Terra' || scope === 'Aqua') return `HAVING count(*) FILTER (WHERE sensor = 'MODIS') > 0`
  return ''
}

/**
 * One row per 0.01° cell-day. `celldays` drops the date and carries the FRP sum, so
 * the export runs against the detection rows to keep the true per-cell-day maximum.
 */
export async function exportSelectionCsv(
  year: number,
  selection: Selection,
  scope: string | null,
): Promise<SelectionExport> {
  await initRawDuck()
  await serialBuffer(() => ensureDetections(year))
  if (!tableConnection) throw new Error('DuckDB table connection is not ready')

  const bounds = cellBounds(selection)
  const sql = `
    SELECT strftime(acq_date, '%Y-%m-%d') AS date,
           CAST(clat AS INTEGER) AS clat,
           CAST(clon AS INTEGER) AS clon,
           CAST(count(*) FILTER (WHERE sensor = 'MODIS') AS INTEGER) AS modis,
           CAST(count(*) FILTER (WHERE sensor = 'VIIRS') AS INTEGER) AS viirs,
           CAST(max(frp) AS DOUBLE) AS max_frp
    FROM (
      SELECT *, CAST(ROUND(lat / 0.01) AS BIGINT) AS clat, CAST(ROUND(lon / 0.01) AS BIGINT) AS clon
      FROM read_parquet(${quote(detectionsBuffer)})
      WHERE frp > 0
    ) d
    WHERE clat BETWEEN ${bounds.minClat} AND ${bounds.maxClat}
      AND clon BETWEEN ${bounds.minClon} AND ${bounds.maxClon}${circleClause(selection)}
    GROUP BY 1, 2, 3
    ${sensorHavingClause(scope)}
    ORDER BY 1, 2, 3
  `

  if (tableInFlight) await cancelTableQuery()
  tableInFlight = true
  let rows: SelectionCsvRow[]
  try {
    const table = await sendQuery(tableConnection, sql)
    const dates = strings(table, 'date')
    const clat = ints(table, 'clat')
    const clon = ints(table, 'clon')
    const modis = ints(table, 'modis')
    const viirs = ints(table, 'viirs')
    const maxFrp = doubles(table, 'max_frp')
    rows = []
    for (let i = 0; i < dates.length; i += 1) {
      if (selection.mode === 'lasso' && !pointInPolygon(clon[i] * 0.01, clat[i] * 0.01, selection.polygon)) continue
      rows.push({
        date: dates[i],
        clat: clat[i],
        clon: clon[i],
        modis: modis[i],
        viirs: viirs[i],
        maxFrp: maxFrp[i],
      })
    }
  } finally {
    tableInFlight = false
  }

  return {
    filename: selectionCsvName(year, selection.polygon),
    csv: selectionCsv(rows),
    rows: rows.length,
  }
}

export function aggregateBins(raw: RawAggregate, model: ModelArtifact): EstimateTotals {
  const rules = binRules(model)
  const byLabel = new Map(raw.bins.map((bin) => [bin.label, bin]))
  const bins = rules.map((rule) => {
    const count = byLabel.get(rule.label)?.cellDays ?? 0
    return { label: rule.label, p: rule.p, cellDays: count, expected: count * rule.p }
  })
  const total = (raw.modisCellDays ?? 0) + bins.reduce((sum, bin) => sum + bin.expected, 0)
  return {
    total,
    modisCellDays: raw.modisCellDays ?? 0,
    viirsOnlyCellDays: raw.viirsOnlyCellDays,
    bins,
  }
}
