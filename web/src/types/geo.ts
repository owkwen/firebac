/** GeoJSON as vendored: Natural Earth 110m, public domain. */
export type GeoPosition = [number, number]

export interface GeoFeature {
  type: 'Feature'
  properties: { name?: string; code?: string }
  geometry: {
    type: 'MultiPolygon'
    /** [polygon][ring][position], position = [lon, lat]. */
    coordinates: GeoPosition[][][]
  }
}

export interface GeoCollection {
  type: 'FeatureCollection'
  name?: string
  license?: string
  features: GeoFeature[]
}
