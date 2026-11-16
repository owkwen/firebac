import type { CalendarArtifact, SeriesMode } from '@/types/calendar'
import { annualOf, baselineBand, daysInYear, seriesOf } from './aggregate'
import { MONTH_NAMES } from './constants'
import { formatDecimal, formatInteger } from './format'

export interface SeasonProfile {
  noSensor: boolean
  values: (number | null)[]
  p25: (number | null)[]
  p75: (number | null)[]
  summary: string
}

function totalText(total: number | null, mode: SeriesMode): string {
  if (total === null) return '—'
  return mode === 'modis' ? formatInteger(total) : formatDecimal(total, 2)
}

/** Reads the series and aggregates the baseline band; no artifact field is re-derived. */
export function buildSeasonProfile(
  artifact: CalendarArtifact,
  year: number,
  mode: SeriesMode,
): SeasonProfile {
  const noSensor = mode === 'harmonized' && year < artifact.harmonized_from
  const row = seriesOf(artifact.series, year)
  const track = row?.[mode]
  const values = track ? track.slice(0, daysInYear(year)) : []
  const band = baselineBand(artifact.series, artifact.baseline.start, artifact.baseline.end, mode)

  if (noSensor) {
    return {
      noSensor,
      values,
      p25: [],
      p75: [],
      summary: `No harmonized values in ${year}; the MODIS series covers this year continuously.`,
    }
  }

  const yearCells = artifact.cells.filter((cell) => cell.y === year)
  if (yearCells.length === 0) {
    return { noSensor, values, p25: band.p25, p75: band.p75, summary: `No calendar cells are published for ${year}.` }
  }
  const peak = yearCells.reduce((best, cell) =>
    (cell[mode] ?? 0) > (best[mode] ?? 0) ? cell : best,
  )
  const annual = annualOf(artifact.annual, year)
  const total = annual ? (mode === 'modis' ? annual.modis : annual.harmonized) : null
  return {
    noSensor,
    values,
    p25: band.p25,
    p75: band.p75,
    summary: `Peak month ${MONTH_NAMES[peak.m - 1]}, ${formatInteger(peak[mode] ?? 0)} cell-days; year total ${totalText(total, mode)} cell-days. The band is the daily p25–p75 across 2012–2022.`,
  }
}
