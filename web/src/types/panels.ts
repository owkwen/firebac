import type { Sensor } from './dataset'
import type { DetectionRow } from './detections'
import type { ViirsConfidence } from './filters'

export type BrightnessBand = '4um' | '11um'

export interface SensorCount {
  sensor: Sensor
  count: number
  firstDay: string | null
  lastDay: string | null
}

export interface DailyCount {
  sensor: Sensor
  day: string
  count: number
}

export interface CountsData {
  bySensor: SensorCount[]
  daily: DailyCount[]
  total: number
}

export interface HistogramBin {
  bin: number
  count: number
}

export interface BrightnessSeries {
  sensor: Sensor
  points: HistogramBin[]
}

export interface BrightnessData {
  fourMicron: BrightnessSeries[]
  elevenMicron: BrightnessSeries[]
  ceilingK: number
}

export interface ScatterPoint {
  modis: number
  viirs: number
  lat: number
  lon: number
}

export interface ScatterData {
  points: ScatterPoint[]
  totalPairs: number
  cap: number
  windowMinutes: number
  ceilingK: number
}

export interface ViirsCount {
  level: ViirsConfidence
  count: number
}

export interface SplitCount {
  sensor: Sensor
  passed: number
  total: number
}

export interface ConfidenceData {
  modisBins: HistogramBin[]
  viirs: ViirsCount[]
  split: SplitCount[]
  modisMin: number
  viirsMin: ViirsConfidence
}

export interface AreaBin {
  sensor: Sensor
  bin: number
  count: number
}

export interface FootprintSummary {
  sensor: Sensor
  count: number
  medianScan: number
  medianTrack: number
  medianArea: number
}

export interface FootprintPoint {
  sensor: Sensor
  scan: number
  track: number
}

export interface FootprintData {
  points: FootprintPoint[]
  areaBins: AreaBin[]
  summaries: FootprintSummary[]
  areaCapKm2: number
}

export interface MapPoint {
  sensor: Sensor
  lat: number
  lon: number
}

export interface SensorBounds {
  sensor: Sensor
  count: number
  minLat: number
  maxLat: number
  minLon: number
  maxLon: number
}

export interface MapData {
  points: MapPoint[]
  bounds: SensorBounds[]
  total: number
  sampled: number
}

export interface TableData {
  rows: DetectionRow[]
  total: number
}

export interface ExploreData {
  counts: CountsData
  brightness: BrightnessData
  scatter: ScatterData
  confidence: ConfidenceData
  footprints: FootprintData
  map: MapData
  table: TableData
}

export interface SqlConsoleMeta {
  elapsedMs: number
  rowCount: number
  truncated: boolean
}
