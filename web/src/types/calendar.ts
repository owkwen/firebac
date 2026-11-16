import type { Sensor } from './dataset'

export type SeriesMode = 'modis' | 'viirs' | 'harmonized'
export type MetricMode = 'counts' | 'anomaly'
export type ResolutionMode = 'month' | 'day'

export interface RegionRef {
  code: string
  name: string
}

export interface Constellation {
  modis: string[]
  terra_from: string
  aqua_from: string
  viirs: string[]
  viirs_from: string
  note: string
}

/** The first month a platform contributes; the heatmap marks that corner. */
export interface SystemMark {
  sensor: Sensor
  /** Cell key, `year-month`. */
  key: string
  year: number
  month: number
  /** Tooltip and accessible text, e.g. "Terra · first month in the record: Nov 2000". */
  label: string
}

/** A null mode value means the series does not exist for that year, never zero. */
export type ModeValue = Record<SeriesMode, number | null>

export interface CalendarCell {
  y: number
  m: number
  modis: number
  viirs: number
  harmonized: number | null
  modis_px: number
  viirs_px: number
  /** Of modis_px, from Terra. */
  terra_px: number
  /** Of modis_px, from Aqua. */
  aqua_px: number
  /** Distinct dates with any detection in this month. */
  days: number
  /** days <= 2: treat as missing coverage, not a quiet month. */
  sparse: boolean
  base: Record<SeriesMode, number>
  z: ModeValue
  ratio: ModeValue
}

export interface AnnualRow {
  year: number
  /** Platforms with at least one detection that year, e.g. ["Aqua", "Terra"]. */
  satellites: string[]
  modis: number
  /** Null before VIIRS starts, never zero. */
  viirs: number | null
  harmonized: number | null
  base: Record<SeriesMode, number>
  ratio: ModeValue
  z: ModeValue
}

export interface SeriesRow {
  year: number
  modis: number[]
  /** The whole track is null before 2012, not an array of zeros. */
  viirs: (number | null)[] | null
  /** The whole track is null before 2012, not an array of zeros. */
  harmonized: (number | null)[] | null
}

export interface CalendarArtifact {
  schema: 'fire-calendar/2'
  region: RegionRef
  grid_deg: number
  map_deg: number
  generated_utc: string
  years: number[]
  months: number[]
  modes: SeriesMode[]
  harmonized_from: number
  /** Years whose level is not comparable with the baseline: `z` and `ratio` are null. */
  non_comparable_years: number[]
  /** One line naming why those years are withheld; the UI shows it verbatim. */
  non_comparable_note: string
  harmonized_partial: number[]
  constellation: Constellation
  baseline: { start: number; end: number }
  calibration: { start: number; end: number }
  peak: { year: number; ratio: number }
  cells: CalendarCell[]
  annual: AnnualRow[]
  series: SeriesRow[]
}

export interface CalendarState {
  region: string
  series: SeriesMode
  metric: MetricMode
  /** Year × month, or year × day of year. */
  resolution: ResolutionMode
  year: number
  month: number
}
