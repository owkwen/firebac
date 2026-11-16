/** One coordinate pair, longitude first to match GeoJSON. */
export interface LonLat {
  lon: number
  lat: number
}

export interface GeoExtent {
  minLat: number
  maxLat: number
  minLon: number
  maxLon: number
}

/** Centre and horizontal span in degrees of longitude. */
export interface MapView {
  lon: number
  lat: number
  span: number
}

export type MapFit = 'outline' | 'bbox' | 'layer' | 'none'

export type MapSelectionMode = 'none' | 'point' | 'rect' | 'circle' | 'lasso'

export interface MapSelection {
  mode: MapSelectionMode
  /** Circle radius; only meaningful when mode is `circle`. */
  radiusKm?: number
  /** A polygon supplied by the page (a stored selection or an AOI). */
  polygon?: LonLat[]
}

export interface MapInteractive {
  zoom: boolean
  pan: boolean
}

export interface MapHover {
  lat: number
  lon: number
  /** Nearest raster value, or null when no raster cell covers the point. */
  value: number | null
}

/** Colour stops, low to high. Hex stops are interpolated; anything else is sampled. */
export type ColorRamp = readonly string[]

export interface RasterLayer {
  kind: 'raster'
  cellDeg: number
  /** Cell centres and their value: [lat, lon, value]. Zero and null are gaps. */
  cells: Array<[number, number, number]>
  ramp: ColorRamp
  scale?: 'linear' | 'log'
  /** Upper end of the scale; defaults to the largest value in the layer. */
  max?: number
  /** Floor for the drawn cell size in CSS pixels; defaults to 1. */
  minCellPx?: number
  opacity?: number
}

export interface PointsLayer {
  kind: 'points'
  lon: ArrayLike<number>
  lat: ArrayLike<number>
  color: string
  size?: number
}

export interface PolygonLayer {
  kind: 'polygon'
  ring: LonLat[]
  stroke: string
  fill?: string
  width?: number
  dash?: number[]
}

export type MapLayer = RasterLayer | PointsLayer | PolygonLayer
