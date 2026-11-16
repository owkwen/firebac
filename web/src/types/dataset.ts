export type Sensor = 'MODIS' | 'VIIRS'

export interface DatasetInfo {
  file: string
  sensor: Sensor
  year: number
  country: string
}

export interface DatasetManifest {
  datasets: DatasetInfo[]
}
