import type { SelectionCsvRow } from '@/types/detections'
import type { LonLat } from '@/types/map'
import { polygonBounds } from './selection'

const HEADER = 'date,lat,lon,modis_detections,viirs_detections,max_frp'

function latitude(value: number): string {
  return `${Math.abs(value).toFixed(2)}${value >= 0 ? 'N' : 'S'}`
}

function longitude(value: number): string {
  return `${Math.abs(value).toFixed(2)}${value >= 0 ? 'E' : 'W'}`
}

/** The filename carries the query, so a downloaded CSV explains itself without a README. */
export function selectionCsvName(year: number, polygon: LonLat[]): string {
  const bounds = polygonBounds(polygon)
  return [
    'firebac',
    year,
    latitude(bounds.minLat),
    latitude(bounds.maxLat),
    longitude(bounds.minLon),
    longitude(bounds.maxLon),
  ].join('-') + '.csv'
}

export function selectionCsv(rows: readonly SelectionCsvRow[]): string {
  const body = rows.map((row) =>
    [
      row.date,
      (row.clat / 100).toFixed(2),
      (row.clon / 100).toFixed(2),
      row.modis,
      row.viirs,
      row.maxFrp.toFixed(2),
    ].join(','),
  )
  return `${[HEADER, ...body].join('\n')}\n`
}
