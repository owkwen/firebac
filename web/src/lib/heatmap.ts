import type { CalendarCell, MetricMode, SeriesMode } from '@/types/calendar'
import { indexCells } from './aggregate'
import { anomalyPaint, countsPaint, COUNT_RAMP, DIVERGING_NEG, DIVERGING_POS } from './colors'
import { MONTH_NAMES, SERIES_LABELS } from './constants'
import { formatCompact, formatInteger, formatSparse, formatZ } from './format'

export interface CellPosition {
  year: number
  month: number
}

/**
 * Arrow keys walk the published lattice and skip (year, month) pairs the
 * artifact does not contain, so focus never lands on a phantom cell.
 */
export function nextCell(
  years: readonly number[],
  months: readonly number[],
  from: CellPosition,
  deltaYear: number,
  deltaMonth: number,
  has: (year: number, month: number) => boolean,
): CellPosition | null {
  let yearIndex = years.indexOf(from.year)
  let monthIndex = months.indexOf(from.month)
  if (yearIndex < 0 || monthIndex < 0) return null

  while (true) {
    yearIndex += deltaYear
    monthIndex += deltaMonth
    if (yearIndex < 0 || yearIndex >= years.length) return null
    if (monthIndex < 0 || monthIndex >= months.length) return null
    const candidate = { year: years[yearIndex], month: months[monthIndex] }
    if (has(candidate.year, candidate.month)) return candidate
  }
}

export interface HeatCell {
  key: string
  year: number
  month: number
  background: string
  ink: string
  label: string
  title: string
  hatch: boolean
  empty: boolean
  sparse: boolean
}

export interface HeatRow {
  year: number
  cells: HeatCell[]
}

interface HeatInput {
  cells: readonly CalendarCell[]
  years: readonly number[]
  months: readonly number[]
  series: SeriesMode
  metric: MetricMode
  harmonizedFrom: number
}

export interface HeatScale {
  countsMax: number
  zLimit: number
}

export function heatScale(cells: readonly CalendarCell[], series: SeriesMode): HeatScale {
  return {
    countsMax: Math.max(1, ...cells.map((cell) => cell[series] ?? 0)),
    zLimit: Math.max(1, ...cells.map((cell) => Math.abs(cell.z[series] ?? 0))),
  }
}

export function buildHeatRows(input: HeatInput): HeatRow[] {
  const table = indexCells(input.cells)
  const scale = heatScale(input.cells, input.series)

  function paint(year: number, month: number): HeatCell {
    const key = `${year}-${month}`
    const cell = table.get(key)
    const monthName = MONTH_NAMES[month - 1]
    if (!cell) {
      return {
        key, year, month, background: 'transparent', ink: 'var(--faint)', label: '–',
        title: `${monthName} ${year}: no record for this month`,
        hatch: false, empty: true, sparse: false,
      }
    }
    const sparseNote = cell.sparse ? ` · ${formatSparse(cell)}` : ''
    if (input.series !== 'modis' && year < input.harmonizedFrom) {
      return {
        key, year, month, background: 'var(--raised)', ink: 'var(--faint)', label: 'N/A',
        title: `${monthName} ${year}: no second sensor (VIIRS starts ${input.harmonizedFrom})`,
        hatch: true, empty: false, sparse: false,
      }
    }
    if (input.metric === 'counts') {
      const amount = cell[input.series] ?? 0
      const paint = countsPaint(amount, scale.countsMax)
      const amountLabel = `${formatInteger(amount)} ${amount === 1 ? 'cell-day' : 'cell-days'}`
      return {
        key, year, month, background: paint.background, ink: paint.ink,
        label: formatCompact(amount),
        title: `${monthName} ${year}: ${amountLabel}, ${SERIES_LABELS[input.series]}${sparseNote}`,
        hatch: false, empty: false, sparse: cell.sparse,
      }
    }
    const z = cell.z[input.series]
    if (z === null) {
      return {
        key, year, month, background: 'var(--raised)', ink: 'var(--faint)', label: 'N/A',
        title: `${monthName} ${year}: ${SERIES_LABELS[input.series]} z is null`,
        hatch: true, empty: false, sparse: false,
      }
    }
    const paint = anomalyPaint(z, scale.zLimit)
    return {
      key, year, month, background: paint.background, ink: paint.ink,
      label: formatZ(z),
      title: `${monthName} ${year}: ${SERIES_LABELS[input.series]} z ${formatZ(z)}${sparseNote}`,
      hatch: false, empty: false, sparse: cell.sparse,
    }
  }

  return input.years.map((year) => ({
    year,
    cells: input.months.map((month) => paint(year, month)),
  }))
}

export const HEAT_RAMPS = {
  counts: COUNT_RAMP,
  negative: DIVERGING_NEG,
  positive: DIVERGING_POS,
}
