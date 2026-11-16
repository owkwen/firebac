import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const dataDir = fileURLToPath(new URL('../public/data/', import.meta.url))

function datasetFromFile(file) {
  const sensor = file.startsWith('modis_') ? 'MODIS' : file.startsWith('viirs') ? 'VIIRS' : null
  const match = /_(\d{4})_(.+)\.csv$/i.exec(file)
  if (!sensor || !match) return null
  return {
    file,
    sensor,
    year: Number(match[1]),
    country: match[2].replace(/_/g, ' '),
  }
}

await mkdir(dataDir, { recursive: true })
const entries = await readdir(dataDir)
const datasets = entries
  .filter((file) => file.toLowerCase().endsWith('.csv'))
  .map(datasetFromFile)
  .filter(Boolean)
  .sort((a, b) => a.year - b.year || a.sensor.localeCompare(b.sensor) || a.country.localeCompare(b.country))

await writeFile(new URL('manifest.json', `file://${dataDir}`), `${JSON.stringify({ datasets }, null, 2)}\n`)
console.log(`data manifest: ${datasets.length} CSV file(s)`)
