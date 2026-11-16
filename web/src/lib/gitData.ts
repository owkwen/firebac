import type { AsyncDuckDB, AsyncDuckDBConnection, DuckDBBundles } from '@duckdb/duckdb-wasm'
import type { Table } from 'apache-arrow'
import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url'
import ehWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url'
import mvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url'
import type { RasterLayer } from '@/types/map'
import type {
  Bbox,
  GitBlameResult,
  GitCommit,
  GitCommitCells,
  GitIndex,
  GitLog,
  GitSensor,
} from '@/types/git'
import {
  GIT_COMMIT_CAP,
  GIT_DENSITY_RAMP,
  GIT_FALLBACK_BBOX,
  cellMaxima,
  commitKey,
  commitTimestamp,
  passId,
  platformCode,
  summariseCommits,
} from './git'

const BUNDLES: DuckDBBundles = {
  mvp: { mainModule: mvpWasm, mainWorker: mvpWorker },
  eh: { mainModule: ehWasm, mainWorker: ehWorker },
}

let database: AsyncDuckDB | null = null
let connection: AsyncDuckDBConnection | null = null
let opening: Promise<void> | null = null
let currentYear: number | null = null
let currentBuffers: string[] = []

// One connection and a promise chain: DuckDB-WASM serialises statements per
// connection, and a year switch must not overtake the query it replaces.
let queryChain: Promise<unknown> = Promise.resolve()

function serialise<T>(task: () => Promise<T>): Promise<T> {
  const next = queryChain.then(task, task)
  queryChain = next.catch(() => undefined)
  return next
}

function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL
  return `${base.endsWith('/') ? base : `${base}/`}${path.replace(/^\/+/, '')}`
}

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/** The Git view owns its index read; the Region page's loader is a different contract. */
export async function fetchGitIndex(): Promise<GitIndex> {
  const response = await fetch(assetUrl('passes/index.json'), { cache: 'no-cache' })
  if (!response.ok) throw new Error(`passes/index.json unavailable (${response.status})`)
  const payload = (await response.json()) as GitIndex
  if (!Array.isArray(payload.years) || payload.years.length === 0) {
    throw new Error('passes/index.json has no years')
  }
  for (const entry of payload.years) {
    if (
      !Number.isInteger(entry.year) ||
      !Number.isFinite(entry.passes) ||
      entry.passes <= 0 ||
      !Number.isFinite(entry.pass_cells) ||
      entry.pass_cells <= 0
    ) {
      throw new Error('passes/index.json has a malformed year entry')
    }
  }
  return payload
}

interface DensityDocument {
  schema?: unknown
  year?: unknown
  step_deg?: unknown
  cells?: unknown
}

/**
 * The Region page already publishes the same 0.1° artifact; the Git view reads
 * its detection column only, for orientation while choosing a box.
 */
export async function loadDensityRaster(year: number): Promise<RasterLayer | null> {
  const response = await fetch(assetUrl(`density/CA-${year}.json`), { cache: 'no-cache' })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`density/CA-${year}.json unavailable (${response.status})`)
  const payload = (await response.json()) as DensityDocument
  if (payload.schema !== 'fire-density/1' || payload.year !== year) {
    throw new Error(`density/CA-${year}.json is not a fire-density/1 document for ${year}`)
  }
  if (payload.step_deg !== undefined && payload.step_deg !== 0.1) {
    throw new Error(`density/CA-${year}.json does not use 0.1° bins`)
  }
  if (!Array.isArray(payload.cells)) throw new Error(`density/CA-${year}.json has no cells`)

  const cells: Array<[number, number, number]> = []
  let max = 0
  for (const cell of payload.cells) {
    if (!Array.isArray(cell) || cell.length < 3) {
      throw new Error(`density/CA-${year}.json has a malformed cell`)
    }
    const lat = Number(cell[0])
    const lon = Number(cell[1])
    const detections = Number(cell[2])
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(detections)) {
      throw new Error(`density/CA-${year}.json has a non-numeric cell`)
    }
    if (detections > 0) {
      cells.push([lat, lon, detections])
      if (detections > max) max = detections
    }
  }
  if (cells.length === 0) return null
  return {
    kind: 'raster',
    cellDeg: 0.1,
    cells,
    ramp: GIT_DENSITY_RAMP,
    scale: 'log',
    max,
    opacity: 0.65,
  }
}

function sqlInteger(value: number): string {
  return String(Math.round(value))
}

interface CellRange {
  clat0: number
  clat1: number
  clon0: number
  clon1: number
}

function cellRange(bbox: Bbox): CellRange {
  return {
    clat0: Math.round(bbox.lat0 / 0.01),
    clat1: Math.round(bbox.lat1 / 0.01),
    clon0: Math.round(bbox.lon0 / 0.01),
    clon1: Math.round(bbox.lon1 / 0.01),
  }
}

async function fetchParquet(path: string): Promise<Uint8Array> {
  const response = await fetch(assetUrl(path), { cache: 'no-cache' })
  if (!response.ok) throw new Error(`${path} unavailable (${response.status})`)
  return new Uint8Array(await response.arrayBuffer())
}

async function open(): Promise<void> {
  if (connection) return
  const duckdb = await import('@duckdb/duckdb-wasm')
  const bundle = await duckdb.selectBundle(BUNDLES)
  if (!bundle.mainWorker) throw new Error('DuckDB worker bundle unavailable')
  const worker = new Worker(bundle.mainWorker)
  database = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING), worker)
  await database.instantiate(bundle.mainModule, bundle.pthreadWorker)
  connection = await database.connect()
}

async function init(): Promise<void> {
  if (!opening) opening = open()
  await opening
}

async function query(sql: string): Promise<Table> {
  if (!connection) throw new Error('DuckDB connection is not ready')
  return connection.query(sql)
}

async function ensureYear(year: number): Promise<void> {
  if (!database || !connection) throw new Error('DuckDB connection is not ready')
  if (currentYear === year) return
  if (currentYear !== null) {
    await connection.query('DROP VIEW IF EXISTS passcells')
    await connection.query('DROP VIEW IF EXISTS passes')
    for (const buffer of currentBuffers) await database.dropFile(buffer)
  }

  const passPath = `passes/CA-${year}.parquet`
  const cellPath = `passcells/CA-${year}.parquet`
  const passBuffer = `passes_${year}.parquet`
  const cellBuffer = `passcells_${year}.parquet`
  const [passBytes, cellBytes] = await Promise.all([
    fetchParquet(passPath),
    fetchParquet(cellPath),
  ])
  await database.registerFileBuffer(passBuffer, passBytes)
  await database.registerFileBuffer(cellBuffer, cellBytes)
  await connection.query(`
    CREATE OR REPLACE VIEW passes AS
    SELECT CAST(platform AS VARCHAR) AS platform,
           CAST(acq_date AS DATE) AS acq_date,
           CAST(bucket AS SMALLINT) AS bucket,
           CAST(minutes AS INTEGER) AS minutes,
           CAST(detections AS BIGINT) AS detections,
           CAST(frp AS DOUBLE) AS frp,
           CAST(cells AS BIGINT) AS cells,
           CAST(min_clat AS BIGINT) AS min_clat,
           CAST(max_clat AS BIGINT) AS max_clat,
           CAST(min_clon AS BIGINT) AS min_clon,
           CAST(max_clon AS BIGINT) AS max_clon
    FROM read_parquet(${quote(passBuffer)})
  `)
  await connection.query(`
    CREATE OR REPLACE VIEW passcells AS
    SELECT CAST(platform AS VARCHAR) AS platform,
           CAST(acq_date AS DATE) AS acq_date,
           CAST(bucket AS SMALLINT) AS bucket,
           CAST(clat AS BIGINT) AS clat,
           CAST(clon AS BIGINT) AS clon,
           CAST(n AS BIGINT) AS n,
           CAST(frp AS DOUBLE) AS frp
    FROM read_parquet(${quote(cellBuffer)})
  `)
  currentBuffers = [passBuffer, cellBuffer]
  currentYear = year
}

/** The artifacts name platforms; the UI names authors. */
function satelliteExpr(platform: string): string {
  return `CASE ${platform} WHEN 'TERRA' THEN 'Terra' WHEN 'AQUA' THEN 'Aqua' ELSE 'N' END`
}

function sensorExpr(platform: string): string {
  return `CASE ${platform} WHEN 'NPP' THEN 'VIIRS' ELSE 'MODIS' END`
}

function column(table: Table, name: string): ArrayLike<unknown> {
  const vector = table.getChild(name)
  if (!vector) throw new Error(`Query result is missing ${name}`)
  return vector.toArray() as ArrayLike<unknown>
}

function numberAt(values: ArrayLike<unknown>, index: number): number {
  const value = values[index]
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'number') return value
  return Number(value)
}

function textAt(values: ArrayLike<unknown>, index: number): string {
  const value = values[index]
  return value === null || value === undefined ? '' : String(value)
}

function commitsFromTable(table: Table): GitCommit[] {
  const satellite = column(table, 'satellite')
  const sensor = column(table, 'sensor')
  const day = column(table, 'day')
  const bucket = column(table, 'bucket')
  const firstMinutes = column(table, 'first_minutes')
  const detections = column(table, 'detections')
  const frp = column(table, 'frp')
  const cells = column(table, 'cells')
  const minLat = column(table, 'min_lat')
  const maxLat = column(table, 'max_lat')
  const minLon = column(table, 'min_lon')
  const maxLon = column(table, 'max_lon')

  const commits: GitCommit[] = []
  for (let index = 0; index < table.numRows; index += 1) {
    const author = textAt(satellite, index)
    const date = textAt(day, index)
    const sixHour = numberAt(bucket, index)
    const minutes = numberAt(firstMinutes, index)
    commits.push({
      id: passId(author, date, minutes),
      satellite: author,
      sensor: (textAt(sensor, index) === 'MODIS' ? 'MODIS' : 'VIIRS') as GitSensor,
      date,
      bucket: sixHour,
      minutes,
      timestamp: commitTimestamp(date, minutes),
      detections: numberAt(detections, index),
      frp: numberAt(frp, index),
      cells: numberAt(cells, index),
      minLat: numberAt(minLat, index),
      maxLat: numberAt(maxLat, index),
      minLon: numberAt(minLon, index),
      maxLon: numberAt(maxLon, index),
    })
  }
  return commits
}

/** Every cell of the requested passes; the plan canvas clips to the AOI. */
async function queryCells(commits: readonly GitCommit[]): Promise<Map<string, GitCommitCells>> {
  const result = new Map<string, GitCommitCells>()
  for (const commit of commits) {
    result.set(commit.id, {
      clat: new Int32Array(0),
      clon: new Int32Array(0),
      frp: new Float64Array(0),
    })
  }
  if (commits.length === 0) return result

  const values = commits
    .map(
      (commit) =>
        `(${quote(platformCode(commit.satellite))}, DATE ${quote(commit.date)}, ${commit.bucket})`,
    )
    .join(', ')
  const table = await query(`
    WITH recent(platform, day, bucket) AS (VALUES ${values})
    SELECT ${satelliteExpr('pc.platform')} AS satellite,
           strftime(pc.acq_date, '%Y-%m-%d') AS day,
           pc.bucket,
           pc.clat,
           pc.clon,
           COALESCE(pc.frp, 0)::DOUBLE AS frp
    FROM passcells pc JOIN recent r
      ON pc.platform = r.platform AND pc.acq_date = r.day AND pc.bucket = r.bucket
  `)

  const satellite = column(table, 'satellite')
  const day = column(table, 'day')
  const bucket = column(table, 'bucket')
  const clat = column(table, 'clat')
  const clon = column(table, 'clon')
  const frp = column(table, 'frp')
  const byKey = new Map<string, string>()
  for (const commit of commits) byKey.set(commitKey(commit.satellite, commit.date, commit.bucket), commit.id)

  const buckets = new Map<string, { clat: number[]; clon: number[]; frp: number[] }>()
  for (let index = 0; index < table.numRows; index += 1) {
    const key = commitKey(textAt(satellite, index), textAt(day, index), numberAt(bucket, index))
    const id = byKey.get(key)
    if (!id) continue
    const entry = buckets.get(id) ?? { clat: [], clon: [], frp: [] }
    entry.clat.push(numberAt(clat, index))
    entry.clon.push(numberAt(clon, index))
    entry.frp.push(numberAt(frp, index))
    buckets.set(id, entry)
  }
  for (const [id, entry] of buckets) {
    result.set(id, {
      clat: Int32Array.from(entry.clat),
      clon: Int32Array.from(entry.clon),
      frp: Float64Array.from(entry.frp),
    })
  }
  return result
}

export async function loadDensestBox(year: number): Promise<Bbox> {
  await init()
  return serialise(async () => {
    await ensureYear(year)
    const table = await query(`
      SELECT FLOOR(clat / 50.0) * 0.5 AS lat0,
             FLOOR(clon / 50.0) * 0.5 AS lon0,
             SUM(n)::BIGINT AS n
      FROM passcells
      GROUP BY 1, 2
      ORDER BY n DESC
      LIMIT 1
    `)
    if (table.numRows === 0) return GIT_FALLBACK_BBOX
    const lat = numberAt(column(table, 'lat0'), 0) + 0.25
    const lon = numberAt(column(table, 'lon0'), 0) + 0.25
    const latC = Math.min(89, Math.max(-89, lat))
    const lonC = Math.min(179, Math.max(-179, lon))
    return {
      lat0: latC - 0.5,
      lat1: latC + 0.5,
      lon0: lonC - 0.5,
      lon1: lonC + 0.5,
    }
  })
}

export async function loadCommitLog(
  year: number,
  bbox: Bbox,
  expectedPasses: number,
): Promise<GitLog> {
  await init()
  return serialise(async () => {
    await ensureYear(year)
    const countTable = await query('SELECT COUNT(*)::BIGINT AS n FROM passes')
    const passesLoaded = numberAt(column(countTable, 'n'), 0)
    if (passesLoaded !== expectedPasses) {
      throw new Error(
        `passes/CA-${year}.parquet has ${passesLoaded.toLocaleString('en-US')} rows; passes/index.json says ${expectedPasses.toLocaleString('en-US')}`,
      )
    }

    const range = cellRange(bbox)
    const table = await query(`
      WITH scoped AS (
        SELECT DISTINCT platform, acq_date, bucket
        FROM passcells
        WHERE clat BETWEEN ${sqlInteger(range.clat0)} AND ${sqlInteger(range.clat1)}
          AND clon BETWEEN ${sqlInteger(range.clon0)} AND ${sqlInteger(range.clon1)}
      )
      SELECT ${satelliteExpr('p.platform')} AS satellite,
             ${sensorExpr('p.platform')} AS sensor,
             strftime(p.acq_date, '%Y-%m-%d') AS day,
             p.bucket,
             p.minutes AS first_minutes,
             p.detections,
             p.frp,
             p.cells,
             p.min_clat / 100.0 AS min_lat,
             p.max_clat / 100.0 AS max_lat,
             p.min_clon / 100.0 AS min_lon,
             p.max_clon / 100.0 AS max_lon
      FROM passes p JOIN scoped s USING (platform, acq_date, bucket)
    `)
    const commits = commitsFromTable(table).sort(
      (a, b) =>
        b.timestamp - a.timestamp ||
        a.satellite.localeCompare(b.satellite) ||
        a.id.localeCompare(b.id),
    )
    const displayed = commits.slice(0, GIT_COMMIT_CAP)
    const cells = await queryCells(displayed)
    return {
      year,
      bbox,
      commits,
      displayed,
      cells,
      sensorMax: cellMaxima(displayed, cells),
      totals: summariseCommits(commits),
    }
  })
}

export async function loadCommitCells(
  year: number,
  commits: readonly GitCommit[],
): Promise<Map<string, GitCommitCells>> {
  await init()
  return serialise(async () => {
    await ensureYear(year)
    return queryCells(commits)
  })
}

export async function loadBlame(
  year: number,
  bbox: Bbox,
  lat: number,
  lon: number,
): Promise<GitBlameResult> {
  await init()
  return serialise(async () => {
    await ensureYear(year)
    const clat = Math.round(lat / 0.01)
    const clon = Math.round(lon / 0.01)
    const range = cellRange(bbox)
    const table = await query(`
      SELECT ${satelliteExpr('p.platform')} AS satellite,
             ${sensorExpr('p.platform')} AS sensor,
             strftime(p.acq_date, '%Y-%m-%d') AS day,
             p.bucket,
             p.minutes AS first_minutes,
             pc.n AS detections,
             COALESCE(pc.frp, 0)::DOUBLE AS frp,
             1::BIGINT AS cells,
             pc.clat / 100.0 AS min_lat,
             pc.clat / 100.0 AS max_lat,
             pc.clon / 100.0 AS min_lon,
             pc.clon / 100.0 AS max_lon
      FROM passcells pc JOIN passes p USING (platform, acq_date, bucket)
      WHERE pc.clat = ${sqlInteger(clat)} AND pc.clon = ${sqlInteger(clon)}
        AND pc.clat BETWEEN ${sqlInteger(range.clat0)} AND ${sqlInteger(range.clat1)}
        AND pc.clon BETWEEN ${sqlInteger(range.clon0)} AND ${sqlInteger(range.clon1)}
      ORDER BY p.acq_date ASC, p.minutes ASC, p.platform ASC, p.bucket ASC
    `)
    return {
      lat: clat / 100,
      lon: clon / 100,
      commits: commitsFromTable(table),
    }
  })
}
