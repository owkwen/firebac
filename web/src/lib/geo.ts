import type { GeoCollection } from '@/types/geo'

export async function fetchGeoOutline(): Promise<GeoCollection> {
  const base = import.meta.env.BASE_URL
  const url = `${base.endsWith('/') ? base : `${base}/`}geo/americas-110m.json`
  const response = await fetch(url, { cache: 'no-cache' })
  if (!response.ok) throw new Error(`Map outline unavailable (${response.status})`)
  const geo = (await response.json()) as GeoCollection
  if (geo.type !== 'FeatureCollection' || !Array.isArray(geo.features)) {
    throw new Error('Map outline is not a FeatureCollection')
  }
  return geo
}
