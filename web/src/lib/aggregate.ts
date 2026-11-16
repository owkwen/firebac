import type {
  AnnualRow,
  CalendarCell,
  SeriesMode,
  SeriesRow,
} from '@/types/calendar'
import type { GridArtifact } from '@/types/grid'

export type CellTable = Map<string, CalendarCell>

export function cellKey(year: number, month: number): string {
  return `${year}-${month}`
}

export function indexCells(cells: readonly CalendarCell[]): CellTable {
  return new Map(cells.map((cell) => [cellKey(cell.y, cell.m), cell]))
}

export function annualOf(annual: readonly AnnualRow[], year: number): AnnualRow | null {
  return annual.find((row) => row.year === year) ?? null
}

export function seriesOf(series: readonly SeriesRow[], year: number): SeriesRow | null {
  return series.find((row) => row.year === year) ?? null
}

export function daysInYear(year: number): number {
  // The series always carries 366 slots; the 366th is meaningful only in a leap year.
  return new Date(Date.UTC(year, 1, 29)).getUTCMonth() === 1 ? 366 : 365
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 1) return values[0]
  const position = (values.length - 1) * fraction
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  return values[lower] + (values[upper] - values[lower]) * (position - lower)
}

/**
 * Day-of-year p25/p75 across the baseline years. This is aggregation, which
 * the contract allows; no daily harmonization or anomaly is re-derived.
 */
export function baselineBand(
  series: readonly SeriesRow[],
  start: number,
  end: number,
  mode: SeriesMode,
): { p25: (number | null)[]; p75: (number | null)[] } {
  const rows = series.filter((row) => row.year >= start && row.year <= end)
  const p25: (number | null)[] = []
  const p75: (number | null)[] = []
  for (let day = 0; day < 366; day += 1) {
    const values: number[] = []
    for (const row of rows) {
      const track = row[mode]
      if (!track) continue
      const value = track[day]
      if (typeof value === 'number') values.push(value)
    }
    values.sort((a, b) => a - b)
    if (values.length === 0) {
      p25.push(null)
      p75.push(null)
    } else {
      p25.push(percentile(values, 0.25))
      p75.push(percentile(values, 0.75))
    }
  }
  return { p25, p75 }
}

export function recoveryGap(annual: AnnualRow): number | null {
  if (annual.harmonized === null || annual.modis <= 0) return null
  return annual.harmonized / annual.modis - 1
}

export interface MapCell {
  index: number
  lat: number
  lon: number
  value: number
}

export function mapCells(grid: GridArtifact, month: number, series: SeriesMode): MapCell[] {
  const valueIndex = { modis: 2, harmonized: 3, viirs: 4 }[series]
  const cells: MapCell[] = []
  for (const row of grid.rows) {
    if (row[1] !== month) continue
    const value = row[valueIndex]
    if (value === null) continue
    const centre = grid.cells[row[0]]
    if (!centre) continue
    cells.push({ index: row[0], lat: centre[0], lon: centre[1], value })
  }
  return cells
}
