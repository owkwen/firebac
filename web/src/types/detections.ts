export type CellValue = string | number | boolean | null
export type DataRow = Record<string, CellValue>

export interface DetectionRow extends DataRow {
  sensor: string
  acq_date: string
  acq_time: string
  lat: number
  lon: number
  brightness_k: number | null
  confidence: string
  frp: number | null
  type: number
}

export type ColumnKind = 'text' | 'number' | 'integer' | 'confidence'

export interface TableColumn {
  key: string
  label: string
  kind: ColumnKind
}

export interface SqlResult {
  columns: string[]
  rows: DataRow[]
  elapsedMs: number
  totalRows: number
  truncated: boolean
  query: string
}

export interface DensityIndexYear {
  year: number
  cell_days: number
  density_cells: number
  density_bytes: number
  celldays_bytes: number
}

export interface DensityIndex {
  region: string
  years: DensityIndexYear[]
}

/** `fire-density/1`: [lat, lon, detections, modis, viirs, frp] in 0.1° bins. */
export interface DensityCells {
  lat: Float64Array
  lon: Float64Array
  detections: Int32Array
  modis: Int32Array
  viirs: Int32Array
  frp: Float64Array
}

export interface DensityYear {
  schema: 'fire-density/1'
  region: string
  year: number
  stepDeg: number
  cells: DensityCells
  count: number
}

export interface TileIndexEntry {
  /** [lat tile, lon tile]; tile `[i, j]` covers `[i*5, i*5+5) × [j*5, j*5+5)`. */
  tile: [number, number]
  cells: number
  bytes: number
}

export interface TileIndexYear {
  year: number
  tiles: TileIndexEntry[]
}

/** `tiles/CA/index.json`: which 5° detail tiles exist for each year. */
export interface TileIndex {
  region: string
  step_deg: number
  tile_deg: number
  years: TileIndexYear[]
}

/** `fire-tile/1` row: [clat, clon, modis_cd, viirs_cd, modis_px, viirs_px]; `clat = round(lat / 0.01)`. */
export type TileCell = [number, number, number, number, number, number]

export interface TileDocument {
  schema: 'fire-tile/1'
  year: number
  tile: [number, number]
  step_deg: number
  cells: TileCell[]
}

export interface TileRef {
  i: number
  j: number
}

/** Pixel detections only; the cell-day columns are dropped once the tile is decoded. */
export interface DetailCells {
  clat: Int32Array
  clon: Int32Array
  modis: Int32Array
  viirs: Int32Array
}

export interface DetailTile {
  key: string
  tile: [number, number]
  /** null when the tile is absent on disk; the page keeps painting the others. */
  cells: DetailCells | null
  bytes: number
}

export interface DetailRaster {
  cellDeg: number
  /** Cell centres and scoped detections: [lat, lon, value]. */
  cells: Array<[number, number, number]>
  max: number
  detections: number
}

export interface RawDetectionRow {
  time: string
  lat: number
  lon: number
  bright4: number | null
  confidence: string
  frp: number | null
  satellite: string
}

export interface RawTablePage {
  rows: RawDetectionRow[]
  total: number
  limit: number
  newestFirst: boolean
}

/** One exported 0.01° cell-day; `clat`/`clon` are integer hundredths of a degree. */
export interface SelectionCsvRow {
  date: string
  clat: number
  clon: number
  modis: number
  viirs: number
  maxFrp: number
}

export interface RawCellKey {
  clat: number
  clon: number
}

export interface RawBinCount {
  label: string
  p: number
  cellDays: number
  expected: number
}

export interface RawAggregate {
  source: 'density' | 'celldays'
  detections: number
  cellDays: number | null
  modisCellDays: number | null
  viirsCellDays: number | null
  viirsOnlyCellDays: number
  modisDetections: number
  viirsDetections: number
  frp: number | null
  bins: RawBinCount[]
  /** null means the polygon covered the whole year, so the table needs no join. */
  cells: RawCellKey[] | null
}

export interface EstimateTotals {
  total: number
  modisCellDays: number
  viirsOnlyCellDays: number
  bins: RawBinCount[]
}
