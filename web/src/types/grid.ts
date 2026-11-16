/** `rows` is [cellIndex, month, modis, harmonized, viirs]. */
export type GridRow = [number, number, number, number | null, number]

export interface GridArtifact {
  schema: 'fire-grid/1'
  region: string
  year: number
  step_deg: number
  /** Cell centres, 0.25° multiples: [lat, lon]. West longitudes are negative. */
  cells: [number, number][]
  rows: GridRow[]
}
