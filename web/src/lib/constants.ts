import type { CalendarState, MetricMode, ResolutionMode, SeriesMode } from '@/types/calendar'
import type { Sensor } from '@/types/dataset'
import type { ViirsConfidence } from '@/types/filters'

export const SENSORS: readonly Sensor[] = ['MODIS', 'VIIRS']

export const FIRE_TYPES = [
  { value: 0, label: 'Vegetation' },
  { value: 2, label: 'Industrial' },
  { value: 3, label: 'Offshore' },
] as const

export const VIIRS_LEVELS = [
  { value: 'l', label: 'Low', rank: 1 },
  { value: 'n', label: 'Nominal', rank: 2 },
  { value: 'h', label: 'High', rank: 3 },
] as const satisfies readonly { value: ViirsConfidence; label: string; rank: number }[]

export const VIIRS_SATURATION_K = 367
export const MODIS_CONFIDENCE_MAX = 100
export const MODIS_CONFIDENCE_STEP = 5

export const BRIGHTNESS_BIN_K = 2
export const CO_LOCATION_WINDOW_MINUTES = 30
export const CO_LOCATION_DECIMALS = 2
export const SCATTER_SAMPLE_CAP = 5000

export const FOOTPRINT_SAMPLE_CAP = 3000
export const FOOTPRINT_AREA_BIN_KM2 = 0.1
export const FOOTPRINT_AREA_CAP_KM2 = 6
export const MAP_SAMPLE_PER_SENSOR = 6000
export const MAP_FRAME_HEIGHT_PX = 440
export const MAP_FRAME_MAX_WIDTH_PX = 760

export const CALENDAR_MAP_FRAME_HEIGHT_PX = 420
export const CALENDAR_MAP_PADDING_DEG = 1
export const CALENDAR_MAP_LAT_MIN = 41
export const CALENDAR_MAP_LAT_MAX = 70
export const CALENDAR_MAP_LON_MIN = -141
export const CALENDAR_MAP_LON_MAX = -59

export const TABLE_ROW_LIMIT = 500
export const SQL_ROW_LIMIT = 1000

export const FALLBACK_DATE_FROM = '2000-01-01'
export const FALLBACK_DATE_TO = '2030-12-31'

export const CALENDAR_DEFAULTS: CalendarState = {
  region: 'CA',
  series: 'modis',
  metric: 'counts',
  resolution: 'month',
  year: 2023,
  month: 7,
}

export const SERIES_MODES: readonly SeriesMode[] = ['modis', 'viirs', 'harmonized']
export const METRIC_MODES: readonly MetricMode[] = ['counts', 'anomaly']
export const RESOLUTION_MODES: readonly ResolutionMode[] = ['month', 'day']

export const SERIES_LABELS: Record<SeriesMode, string> = {
  modis: 'MODIS',
  viirs: 'VIIRS',
  harmonized: 'Both',
}

/** The mode keys are also the URL values; only the labels read as prose. */
export const SERIES_NOTES: Record<SeriesMode, string> = {
  modis: 'MODIS cell-days, 2000 onward',
  viirs: 'raw VIIRS cell-days, 2012 onward; not comparable with MODIS',
  harmonized: 'MODIS + VIIRS-only detections, corrected',
}

export const METRIC_LABELS: Record<MetricMode, string> = {
  counts: 'Burning days',
  anomaly: 'vs normal',
}

export const METRIC_CAPTIONS: Record<MetricMode, string> = {
  counts: '0.01° cells with a detection, by month',
  anomaly: 'z-score against the 2012–2022 normal for that month; ±1 is a typical year',
}

export const RESOLUTION_LABELS: Record<ResolutionMode, string> = {
  month: 'Monthly',
  day: 'Daily',
}

export const DAILY_METRIC_CAPTION =
  'Burning days by day of year. Counts are cell-days; the anomaly is published monthly only.'
export const DAILY_ANOMALY_REASON = 'daily anomaly is published monthly'

export const SERIES_OPTIONS = [
  { value: 'modis', label: SERIES_LABELS.modis },
  { value: 'viirs', label: SERIES_LABELS.viirs },
  { value: 'harmonized', label: SERIES_LABELS.harmonized },
] as const

export const METRIC_OPTIONS = [
  { value: 'counts', label: METRIC_LABELS.counts },
  { value: 'anomaly', label: METRIC_LABELS.anomaly },
] as const

export const RESOLUTION_OPTIONS = [
  { value: 'month', label: RESOLUTION_LABELS.month },
  { value: 'day', label: RESOLUTION_LABELS.day },
] as const

export const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

export const CALENDAR_SYSTEMS = [
  { system: 'Terra', field: 'terra_from', sensor: 'MODIS' },
  { system: 'Aqua', field: 'aqua_from', sensor: 'MODIS' },
  { system: 'Suomi NPP', field: 'viirs_from', sensor: 'VIIRS' },
] as const satisfies readonly {
  system: string
  field: 'terra_from' | 'aqua_from' | 'viirs_from'
  sensor: Sensor
}[]

/** Corner badge geometry: a dot inset from the cell edge, clear of the value text. */
export const SYSTEM_MARK_SIZE_PX = 5
export const SYSTEM_MARK_INSET_PX = 2

/** Calendar tooltip box, so it can be clamped inside the viewport. */
export const CALENDAR_TIP_WIDTH_PX = 240
export const CALENDAR_TIP_HEIGHT_PX = 52

export const CALENDAR_TITLE = 'burning activity calendar'
export const BASELINE_LABEL = '2012–2022 baseline'
