import type { LonLat } from '@/types/map'

export type SelectionMode = 'circle' | 'rectangle' | 'lasso' | 'extent'

export interface Selection {
  polygon: LonLat[]
  mode: SelectionMode
  radiusKm?: number
}

export interface LonLatBounds {
  minLon: number
  maxLon: number
  minLat: number
  maxLat: number
}

const RAD = Math.PI / 180
const EARTH_RADIUS_KM = 6371.0088
const CIRCLE_SEGMENTS = 64

export function rectanglePolygon(a: LonLat, b: LonLat): LonLat[] {
  const west = Math.min(a.lon, b.lon)
  const east = Math.max(a.lon, b.lon)
  const south = Math.min(a.lat, b.lat)
  const north = Math.max(a.lat, b.lat)
  return [
    { lon: west, lat: south },
    { lon: east, lat: south },
    { lon: east, lat: north },
    { lon: west, lat: north },
  ]
}

/** A 64-gon on the sphere, so its area and the cell-in-polygon test agree. */
export function circlePolygon(center: LonLat, radiusKm: number): LonLat[] {
  const distance = radiusKm / EARTH_RADIUS_KM
  const lat1 = center.lat * RAD
  const lon1 = center.lon * RAD
  const points: LonLat[] = []
  for (let step = 0; step < CIRCLE_SEGMENTS; step += 1) {
    const bearing = (step / CIRCLE_SEGMENTS) * 2 * Math.PI
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(distance) +
        Math.cos(lat1) * Math.sin(distance) * Math.cos(bearing),
    )
    const lon2 =
      lon1 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(distance) * Math.cos(lat1),
        Math.cos(distance) - Math.sin(lat1) * Math.sin(lat2),
      )
    points.push({ lon: lon2 / RAD, lat: lat2 / RAD })
  }
  return points
}

export function polygonBounds(polygon: LonLat[]): LonLatBounds {
  const lons = polygon.map((point) => point.lon)
  const lats = polygon.map((point) => point.lat)
  return {
    minLon: Math.min(...lons),
    maxLon: Math.max(...lons),
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
  }
}

/** Ray casting; the polygon is an open ring, as produced by the three selection modes. */
export function pointInPolygon(lon: number, lat: number, polygon: LonLat[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].lon
    const yi = polygon[i].lat
    const xj = polygon[j].lon
    const yj = polygon[j].lat
    const crosses = yi > lat !== yj > lat
    if (crosses && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Spherical excess; antimeridian-safe for the Canadian extent. */
export function polygonAreaKm2(polygon: LonLat[]): number {
  if (polygon.length < 3) return 0
  let sum = 0
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    let deltaLon = (b.lon - a.lon) * RAD
    if (deltaLon > Math.PI) deltaLon -= 2 * Math.PI
    if (deltaLon < -Math.PI) deltaLon += 2 * Math.PI
    sum += deltaLon * (2 + Math.sin(a.lat * RAD) + Math.sin(b.lat * RAD))
  }
  return Math.abs(sum) * EARTH_RADIUS_KM * EARTH_RADIUS_KM / 2
}

export function selectionLabel(selection: Selection | null): string {
  if (!selection) return 'country totals'
  if (selection.mode === 'circle') return `${selection.radiusKm ?? 0} km circle`
  if (selection.mode === 'extent') return 'full extent'
  return selection.mode
}
