import type { DatasetInfo, Sensor } from '@/types/dataset'
import type { FilterState, ViirsConfidence } from '@/types/filters'
import { FIRE_TYPES, SENSORS, VIIRS_LEVELS } from './constants'
import { availableSensors, defaultFilters } from './filters'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function validDate(value: string | null): value is string {
  return value !== null && ISO_DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
}

function validSensor(value: string): value is Sensor {
  return SENSORS.includes(value as Sensor)
}

function validViirsLevel(value: string | null): value is ViirsConfidence {
  return value !== null && VIIRS_LEVELS.some((level) => level.value === value)
}

function splitValues(params: URLSearchParams, key: string): string[] {
  return params.getAll(key).flatMap((value) => value.split(',')).filter(Boolean)
}

export function readFilters(search: string, datasets: DatasetInfo[]): FilterState {
  const fallback = defaultFilters(datasets)
  const params = new URLSearchParams(search)
  const knownFiles = new Set(datasets.map((dataset) => dataset.file))

  const requestedDatasets = splitValues(params, 'ds').filter((file) => knownFiles.has(file))
  const selectedDatasets =
    requestedDatasets.length > 0 ? [...new Set(requestedDatasets)] : fallback.datasets

  const available = availableSensors(
    datasets.filter((dataset) => selectedDatasets.includes(dataset.file)),
  )
  const requestedSensors = splitValues(params, 'sensor').filter(validSensor)
  const requested = requestedSensors.length > 0 ? SENSORS.filter((s) => requestedSensors.includes(s)) : fallback.sensors
  const sensors = requested.filter((sensor) => available.includes(sensor))

  const requestedTypes = splitValues(params, 'type')
    .map(Number)
    .filter((value) => FIRE_TYPES.some((type) => type.value === value))
  const types = requestedTypes.length > 0 ? [...new Set(requestedTypes)] : fallback.types

  const fromParam = params.get('from')
  const toParam = params.get('to')
  const dateFrom = validDate(fromParam) ? fromParam : fallback.dateFrom
  const dateTo = validDate(toParam) ? toParam : fallback.dateTo
  const orderedDates = dateFrom <= dateTo ? { dateFrom, dateTo } : { dateFrom: dateTo, dateTo: dateFrom }

  const modisParam = Number(params.get('mconf'))
  const modisMin =
    Number.isInteger(modisParam) && modisParam >= 0 && modisParam <= 100 ? modisParam : fallback.modisMin

  const viirsParam = params.get('vconf')
  const viirsMin = validViirsLevel(viirsParam) ? viirsParam : fallback.viirsMin

  return {
    datasets: selectedDatasets,
    sensors: sensors.length > 0 ? sensors : available,
    types,
    modisMin,
    viirsMin,
    ...orderedDates,
  }
}

export function writeFilters(filters: FilterState): string {
  const params = new URLSearchParams()
  filters.datasets.forEach((file) => params.append('ds', file))
  filters.sensors.forEach((sensor) => params.append('sensor', sensor))
  params.set('from', filters.dateFrom)
  params.set('to', filters.dateTo)
  filters.types.forEach((type) => params.append('type', String(type)))
  params.set('mconf', String(filters.modisMin))
  params.set('vconf', filters.viirsMin)
  return params.toString()
}
