import type { CalendarState, MetricMode, ResolutionMode, SeriesMode } from '@/types/calendar'
import { CALENDAR_DEFAULTS, METRIC_MODES, RESOLUTION_MODES, SERIES_MODES } from './constants'

function isSeries(value: string | null): value is SeriesMode {
  return value !== null && SERIES_MODES.includes(value as SeriesMode)
}

function isMetric(value: string | null): value is MetricMode {
  return value !== null && METRIC_MODES.includes(value as MetricMode)
}

function isResolution(value: string | null): value is ResolutionMode {
  return value !== null && RESOLUTION_MODES.includes(value as ResolutionMode)
}

function integerIn(value: string | null, min: number, max: number): number | null {
  if (value === null || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : null
}

/** Invalid values fall back to the defaults instead of breaking the view. */
export function readCalendarState(
  search: string,
  regions: readonly string[],
  years: readonly number[],
): CalendarState {
  const params = new URLSearchParams(search)
  const fallback = CALENDAR_DEFAULTS

  const requestedRegion = params.get('r')
  const region =
    requestedRegion !== null && regions.includes(requestedRegion)
      ? requestedRegion
      : regions.includes(fallback.region)
        ? fallback.region
        : (regions[0] ?? fallback.region)

  const series = isSeries(params.get('s')) ? (params.get('s') as SeriesMode) : fallback.series
  const resolution = isResolution(params.get('res'))
    ? (params.get('res') as ResolutionMode)
    : fallback.resolution
  // The artifact publishes z per month only, so a daily URL can never carry anomaly.
  const metric =
    resolution === 'day'
      ? 'counts'
      : isMetric(params.get('v'))
        ? (params.get('v') as MetricMode)
        : fallback.metric

  const requestedYear = integerIn(params.get('y'), 1900, 2100)
  const year =
    requestedYear !== null && years.includes(requestedYear)
      ? requestedYear
      : years.includes(fallback.year)
        ? fallback.year
        : (years[years.length - 1] ?? fallback.year)

  const month = integerIn(params.get('m'), 1, 12) ?? fallback.month

  return { region, series, metric, resolution, year, month }
}

export function writeCalendarState(state: CalendarState): string {
  const params = new URLSearchParams()
  params.set('r', state.region)
  params.set('s', state.series)
  params.set('v', state.metric)
  params.set('res', state.resolution)
  params.set('y', String(state.year))
  params.set('m', String(state.month))
  return params.toString()
}

/** Router query objects keep control changes and the address bar in one shape. */
export function calendarQuery(state: CalendarState): Record<string, string> {
  const params = new URLSearchParams(writeCalendarState(state))
  return Object.fromEntries(params.entries())
}
