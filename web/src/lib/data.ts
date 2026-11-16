import type { DatasetInfo, DatasetManifest, Sensor } from '@/types/dataset'

function inferSensor(file: string): Sensor | null {
  if (file.startsWith('modis_')) return 'MODIS'
  if (file.startsWith('viirs')) return 'VIIRS'
  return null
}

export function datasetFromFile(file: string): DatasetInfo | null {
  const sensor = inferSensor(file)
  const match = /_(\d{4})_(.+)\.csv$/i.exec(file)
  if (!sensor || !match) return null
  return {
    file,
    sensor,
    year: Number(match[1]),
    country: match[2].replace(/_/g, ' '),
  }
}

export async function fetchManifest(): Promise<DatasetInfo[]> {
  const response = await fetch('/data/manifest.json', { cache: 'no-cache' })
  if (!response.ok) throw new Error(`Dataset manifest unavailable (${response.status})`)
  const manifest = (await response.json()) as DatasetManifest
  if (!Array.isArray(manifest.datasets)) throw new Error('Dataset manifest has no datasets array')
  return manifest.datasets
    .map((dataset) => datasetFromFile(dataset.file))
    .filter((dataset): dataset is DatasetInfo => dataset !== null)
    .sort((a, b) => a.year - b.year || a.sensor.localeCompare(b.sensor) || a.country.localeCompare(b.country))
}

export async function fetchCsvBytes(file: string): Promise<Uint8Array> {
  const response = await fetch(`/data/${encodeURIComponent(file)}`)
  if (!response.ok) throw new Error(`Could not load ${file} (${response.status})`)
  return new Uint8Array(await response.arrayBuffer())
}
