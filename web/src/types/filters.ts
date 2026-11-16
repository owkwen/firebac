import type { Sensor } from './dataset'

export type ViirsConfidence = 'l' | 'n' | 'h'

export interface FilterState {
  datasets: string[]
  sensors: Sensor[]
  dateFrom: string
  dateTo: string
  types: number[]
  modisMin: number
  viirsMin: ViirsConfidence
}
