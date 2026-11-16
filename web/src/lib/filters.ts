import type { DatasetInfo, Sensor } from '@/types/dataset'
import type { FilterState, ViirsConfidence } from '@/types/filters'
import { FALLBACK_DATE_FROM, FALLBACK_DATE_TO, FIRE_TYPES, SENSORS, VIIRS_LEVELS } from './constants'

export function defaultFilters(datasets: DatasetInfo[]): FilterState {
  const latestYear = datasets.length > 0 ? Math.max(...datasets.map((d) => d.year)) : null
  const selected =
    latestYear === null
      ? []
      : datasets.filter((d) => d.year === latestYear).map((d) => d.file)
  const years = datasets.filter((d) => selected.includes(d.file)).map((d) => d.year)
  const sensors = uniqueSensors(
    datasets.filter((d) => selected.includes(d.file)).map((d) => d.sensor),
  )

  return {
    datasets: selected,
    sensors: sensors.length > 0 ? sensors : [...SENSORS],
    dateFrom: years.length > 0 ? `${Math.min(...years)}-01-01` : FALLBACK_DATE_FROM,
    dateTo: years.length > 0 ? `${Math.max(...years)}-12-31` : FALLBACK_DATE_TO,
    types: FIRE_TYPES.map((t) => t.value),
    modisMin: 0,
    viirsMin: 'l',
  }
}

function uniqueSensors(sensors: Sensor[]): Sensor[] {
  return SENSORS.filter((sensor) => sensors.includes(sensor))
}

export function cloneFilters(filters: FilterState): FilterState {
  return {
    ...filters,
    datasets: [...filters.datasets],
    sensors: [...filters.sensors],
    types: [...filters.types],
  }
}

export function viirsAllowedLevels(min: ViirsConfidence): ViirsConfidence[] {
  const threshold = VIIRS_LEVELS.find((level) => level.value === min)?.rank ?? 1
  return VIIRS_LEVELS.filter((level) => level.rank >= threshold).map((level) => level.value)
}

export function selectedDatasetInfos(
  datasets: DatasetInfo[],
  filters: FilterState,
): DatasetInfo[] {
  return datasets.filter((dataset) => filters.datasets.includes(dataset.file))
}

export function availableSensors(datasets: DatasetInfo[]): Sensor[] {
  return uniqueSensors(datasets.map((dataset) => dataset.sensor))
}

export function sameFilters(a: FilterState, b: FilterState): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
