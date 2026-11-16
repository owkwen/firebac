import type { GeoCollection } from '@/types/geo'
import type {
  ColorRamp,
  GeoExtent,
  LonLat,
  MapFit,
  MapLayer,
  MapView,
  PointsLayer,
  PolygonLayer,
  RasterLayer,
} from '@/types/map'
import type { ChartTheme } from './colors'

const RAD = Math.PI / 180
/** Web Mercator stops at 85.05°; use a round 85 so the poles never invert. */
export const MERCATOR_LAT_LIMIT = 85
export const GRATICULE_STEPS = [1, 5, 10, 20, 30] as const
export const MAX_GRATICULE_LINES = 8
export const INSET_WIDTH_PX = 148
export const INSET_HEIGHT_PX = 96
export const AUTO_GRATICULE_SPAN_DEG = 40
export const MAP_CLICK_MS = 350
export const MAP_CLICK_PX = 4
export const MAP_HOVER_WIDTH_PX = 260
export const MAP_PAN_FRACTION = 0.1
export const MAP_ZOOM_STEP = 1.25
export const MAP_WHEEL_RATE = 0.002
export const MAP_DOUBLE_CLICK_FACTOR = 0.5

/** Detail is binned 3×3, so a 0.01° tile becomes a 0.03° cell. */
export const BIN_FACTOR = 3


export type MapLod = 'wide' | 'mid' | 'detail'

export const LOD_GRAIN_DEG: Record<MapLod, number> = { wide: 0.1, mid: 0.03, detail: 0.01 }
/** 0.1° above 8°, 0.03° between 8° and 3°, 0.01° below 3°. */
export const LOD_WIDE_ENTER_DEG = 8
export const LOD_WIDE_EXIT_DEG = 9
export const LOD_DETAIL_ENTER_DEG = 3
export const LOD_DETAIL_EXIT_DEG = 4

const LABEL_FONT = '10px ui-monospace, "SFMono-Regular", Menlo, monospace'

export function mercatorY(lat: number): number {
  return Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2))
}

export function inverseMercatorY(y: number): number {
  return (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / RAD
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export interface MapProjection {
  scale: number
  toX: (lon: number) => number
  toY: (lat: number) => number
  toLon: (x: number) => number
  toLat: (y: number) => number
}

export function projectView(view: MapView, width: number, height: number): MapProjection {
  const span = Math.max(view.span, 1e-6)
  const scale = width / (span * RAD)
  const centre = mercatorY(view.lat)
  return {
    scale,
    toX: (lon) => width / 2 + (lon - view.lon) * RAD * scale,
    toY: (lat) => height / 2 - (mercatorY(lat) - centre) * scale,
    toLon: (x) => view.lon + (x - width / 2) / scale / RAD,
    toLat: (y) => inverseMercatorY(centre - (y - height / 2) / scale),
  }
}

/** Keep the view inside the world and inside the zoom clamps. */
export function clampView(
  view: MapView,
  width: number,
  height: number,
  minSpan: number,
  maxSpan: number,
): MapView {
  const span = clamp(view.span, Math.max(minSpan, 1e-4), Math.max(maxSpan, minSpan))
  const scale = Math.max(width, 1) / (span * RAD)
  const halfMerc = Math.max(height, 1) / (2 * scale)
  const limit = mercatorY(MERCATOR_LAT_LIMIT)
  let centre = mercatorY(view.lat)
  if (halfMerc >= limit) centre = 0
  else centre = clamp(centre, -limit + halfMerc, limit - halfMerc)
  const lonLimit = Math.max(0, 180 - span / 2)
  return {
    lon: span >= 360 ? 0 : clamp(view.lon, -lonLimit, lonLimit),
    lat: inverseMercatorY(centre),
    span,
  }
}

export function viewFromBounds(
  bounds: GeoExtent,
  width: number,
  height: number,
  padding: number,
  minSpan: number,
  maxSpan: number,
): MapView {
  const lonSpan = Math.max(0, bounds.maxLon - bounds.minLon)
  const minY = mercatorY(bounds.minLat)
  const maxY = mercatorY(bounds.maxLat)
  const latSpan = Math.max(0, (maxY - minY) / RAD)
  const grow = 1 + 2 * clamp(padding, 0, 0.5)
  const fitSpan = Math.max(lonSpan, latSpan * Math.max(width, 1) / Math.max(height, 1)) * grow
  return {
    lon: (bounds.minLon + bounds.maxLon) / 2,
    lat: inverseMercatorY((minY + maxY) / 2),
    span: clamp(fitSpan, minSpan, maxSpan),
  }
}

/** Bounds currently visible; used by the inset rectangle. */
export function viewExtent(view: MapView, width: number, height: number): GeoExtent {
  const projection = projectView(view, width, height)
  return {
    minLon: projection.toLon(0),
    maxLon: projection.toLon(width),
    maxLat: projection.toLat(0),
    minLat: projection.toLat(height),
  }
}

export function zoomView(
  view: MapView,
  factor: number,
  anchor: { x: number; y: number },
  width: number,
  height: number,
  minSpan: number,
  maxSpan: number,
): MapView {
  const projection = projectView(view, width, height)
  const anchorLon = projection.toLon(anchor.x)
  const anchorLat = projection.toLat(anchor.y)
  const span = clamp(view.span * factor, Math.max(minSpan, 1e-4), Math.max(maxSpan, minSpan))
  const scale = Math.max(width, 1) / (span * RAD)
  return clampView(
    {
      lon: anchorLon - (anchor.x - width / 2) / scale / RAD,
      lat: inverseMercatorY(mercatorY(anchorLat) + (anchor.y - height / 2) / scale),
      span,
    },
    width,
    height,
    minSpan,
    maxSpan,
  )
}

/** Move the view so the map content follows a pointer drag of (dx, dy) pixels. */
export function panView(
  view: MapView,
  dx: number,
  dy: number,
  width: number,
  height: number,
  minSpan: number,
  maxSpan: number,
): MapView {
  const scale = Math.max(width, 1) / (Math.max(view.span, 1e-6) * RAD)
  return clampView(
    {
      lon: view.lon - dx / scale / RAD,
      lat: inverseMercatorY(mercatorY(view.lat) + dy / scale),
      span: view.span,
    },
    width,
    height,
    minSpan,
    maxSpan,
  )
}

/* -------------------------------------------------------------------------- */
/* Interaction and level of detail                                            */
/* -------------------------------------------------------------------------- */

/**
 * How the pointer drives the map:
 * - `pan`   — a drag moves the map; a click still selects (calendar month).
 * - `box`   — a drag draws a selection box; Alt turns the drag into a pan.
 * - `point` — a drag moves the map; clicking a mark selects it.
 */
export interface MapInteraction {
  mode: 'pan' | 'box' | 'point'
  /** Let Alt turn a drag into a pan while in `box` mode. Defaults to true. */
  altPan?: boolean
}

export type MapCursor = 'grab' | 'grabbing' | 'crosshair' | 'pointer'

/**
 * One cursor language for every map, so the first page a reader opens teaches
 * the truth: grab means the map moves, crosshair means a drag selects, a link
 * cursor means the thing under the pointer is selectable, and Alt in a
 * selection mode previews the pan it becomes.
 */
export function mapCursor(
  interaction: MapInteraction,
  state: { panning: boolean; alt: boolean; selectable: boolean },
): MapCursor {
  if (state.panning) return 'grabbing'
  if (interaction.mode === 'box') {
    return state.alt && (interaction.altPan ?? true) ? 'grabbing' : 'crosshair'
  }
  return state.selectable ? 'pointer' : 'grab'
}

/**
 * Three grains with a ~1° dead band at each boundary (8–9° and 3–4°), so a
 * wheel nudge or a small pan cannot flap between levels.
 */
export function nextLod(span: number, current: MapLod): MapLod {
  if (span >= LOD_WIDE_ENTER_DEG && span <= LOD_WIDE_EXIT_DEG) {
    return current === 'wide' ? 'wide' : 'mid'
  }
  if (span >= LOD_DETAIL_ENTER_DEG && span <= LOD_DETAIL_EXIT_DEG) {
    return current === 'detail' ? 'detail' : 'mid'
  }
  if (span > LOD_WIDE_EXIT_DEG) return 'wide'
  if (span < LOD_DETAIL_ENTER_DEG) return 'detail'
  return 'mid'
}

export function grainLabel(cellDeg: number): string {
  for (const lod of ['wide', 'mid', 'detail'] as const) {
    if (Math.abs(cellDeg - LOD_GRAIN_DEG[lod]) < 1e-9) return `${LOD_GRAIN_DEG[lod]}°`
  }
  return `${cellDeg}°`
}

export interface BinnedRaster {
  cellDeg: number
  cells: Array<[number, number, number]>
  max: number
}

/**
 * Sum a 3×3 block of cells into one coarser cell, on the client. The centre
 * stays on the middle source cell, so the bins line up with the tile grid.
 */
export function binRasterCells(
  cells: readonly [number, number, number][],
  cellDeg: number,
  factor = BIN_FACTOR,
): BinnedRaster {
  const stride = 20_000
  const latOffset = 3_000
  const lonOffset = 7_000
  const sums = new Map<number, number>()
  for (let i = 0; i < cells.length; i += 1) {
    const cell = cells[i]
    const value = cell[2]
    if (!(value > 0)) continue
    const bi = Math.floor(Math.round(cell[0] / cellDeg) / factor)
    const bj = Math.floor(Math.round(cell[1] / cellDeg) / factor)
    const key = (bi + latOffset) * stride + (bj + lonOffset)
    sums.set(key, (sums.get(key) ?? 0) + value)
  }
  const out: Array<[number, number, number]> = []
  const middle = (factor - 1) / 2
  let max = 0
  for (const [key, value] of sums) {
    const bi = Math.floor(key / stride) - latOffset
    const bj = (key % stride) - lonOffset
    out.push([(bi * factor + middle) * cellDeg, (bj * factor + middle) * cellDeg, value])
    if (value > max) max = value
  }
  return { cellDeg: cellDeg * factor, cells: out, max }
}

export function graticuleStep(span: number): number {
  for (const step of GRATICULE_STEPS) {
    if (span / step <= MAX_GRATICULE_LINES) return step
  }
  return GRATICULE_STEPS[GRATICULE_STEPS.length - 1]
}

export function graticuleTicks(min: number, max: number, step: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || step <= 0) return []
  const ticks: number[] = []
  for (let value = Math.ceil(min / step) * step; value <= max; value += step) {
    ticks.push(Math.round(value * 1e6) / 1e6)
  }
  return ticks
}

export function formatDegrees(value: number, axis: 'lat' | 'lon'): string {
  const rounded = Math.round(value)
  if (rounded === 0) return '0°'
  const hemisphere = axis === 'lat' ? (rounded > 0 ? 'N' : 'S') : rounded > 0 ? 'E' : 'W'
  return `${Math.abs(rounded)}°${hemisphere}`
}

/* -------------------------------------------------------------------------- */
/* Raster lookup and colour                                                   */
/* -------------------------------------------------------------------------- */

interface RasterIndex {
  values: Map<number, number>
  max: number
}

const indexes = new WeakMap<RasterLayer, RasterIndex>()

function cellKey(lat: number, lon: number, cellDeg: number): number {
  return Math.round(lat / cellDeg) * 1_000_000 + Math.round(lon / cellDeg)
}

function rasterIndex(layer: RasterLayer): RasterIndex {
  const cached = indexes.get(layer)
  if (cached) return cached
  const values = new Map<number, number>()
  let max = 0
  for (const cell of layer.cells) {
    const value = cell[2]
    if (!(value > 0)) continue
    values.set(cellKey(cell[0], cell[1], layer.cellDeg), value)
    if (value > max) max = value
  }
  const index = { values, max }
  indexes.set(layer, index)
  return index
}

export function rasterValue(layer: RasterLayer, lon: number, lat: number): number | null {
  const value = rasterIndex(layer).values.get(cellKey(lat, lon, layer.cellDeg))
  return value === undefined ? null : value
}

export function rasterMax(layer: RasterLayer): number {
  return layer.max ?? rasterIndex(layer).max
}

export function valueAtLayers(layers: readonly MapLayer[], lon: number, lat: number): number | null {
  for (let i = layers.length - 1; i >= 0; i -= 1) {
    const layer = layers[i]
    if (layer.kind !== 'raster') continue
    const value = rasterValue(layer, lon, lat)
    if (value !== null) return value
  }
  return null
}

function parseHex(hex: string): [number, number, number] | null {
  const value = hex.trim().replace('#', '')
  if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(value)) return null
  const full = value.length === 3 ? value.replace(/./g, (digit) => digit + digit) : value
  const number = Number.parseInt(full, 16)
  return [(number >> 16) & 255, (number >> 8) & 255, number & 255]
}

const rampStops = new WeakMap<ColorRamp, Array<[number, number, number]> | null>()

function parsedRamp(ramp: ColorRamp): Array<[number, number, number]> | null {
  if (rampStops.has(ramp)) return rampStops.get(ramp) ?? null
  const stops = ramp.map(parseHex)
  const parsed = stops.every((stop): stop is [number, number, number] => stop !== null) ? stops : null
  rampStops.set(ramp, parsed)
  return parsed
}

const PALETTE_STEPS = 256
/** Integer counts below this reuse a value→colour lookup; above it, one log each. */
const PALETTE_LUT_LIMIT = 8192
/** The readback bitmap never needs more pixels than this; panning stays bounded. */
const MAX_BITMAP_PIXELS = 4_000_000

interface RasterPalette {
  /** Packed RGBA, index 0..255; index 0 stays transparent. */
  colors: Uint32Array
  /** Colour index per integer detection count, for the common range. */
  lut: Uint8Array
  max: number
  log: boolean
}

const palettes = new WeakMap<RasterLayer, RasterPalette>()

function packChannels(r: number, g: number, b: number): number {
  return ((255 << 24) | (Math.round(b) << 16) | (Math.round(g) << 8) | Math.round(r)) >>> 0
}

function packedColor(stops: Array<[number, number, number]> | null, ramp: ColorRamp, fraction: number): number {
  if (ramp.length === 0) return 0
  if (ramp.length === 1) {
    const single = parseHex(ramp[0])
    return single ? packChannels(single[0], single[1], single[2]) : 0
  }
  const bounded = clamp(fraction, 0, 1)
  const scaled = bounded * (ramp.length - 1)
  if (!stops) {
    const sampled = parseHex(ramp[Math.round(scaled)])
    return sampled ? packChannels(sampled[0], sampled[1], sampled[2]) : 0
  }
  const index = Math.min(ramp.length - 2, Math.floor(scaled))
  const from = stops[index]
  const to = stops[index + 1]
  const mix = scaled - index
  return packChannels(
    from[0] + (to[0] - from[0]) * mix,
    from[1] + (to[1] - from[1]) * mix,
    from[2] + (to[2] - from[2]) * mix,
  )
}

/** One 256-stop colour table per layer; no per-cell colour maths in the draw loop. */
function rasterPalette(layer: RasterLayer): RasterPalette {
  const cached = palettes.get(layer)
  if (cached) return cached
  const max = Math.max(1, rasterMax(layer))
  const log = layer.scale !== 'linear'
  const stops = parsedRamp(layer.ramp)
  const colors = new Uint32Array(PALETTE_STEPS)
  for (let index = 1; index < PALETTE_STEPS; index += 1) {
    colors[index] = packedColor(stops, layer.ramp, index / (PALETTE_STEPS - 1))
  }
  const size = Math.min(PALETTE_LUT_LIMIT, Math.ceil(max) + 1)
  const lut = new Uint8Array(size)
  const logMax = Math.log1p(max)
  for (let value = 1; value < size; value += 1) {
    const fraction = log ? Math.log1p(value) / logMax : value / max
    const index = Math.round(clamp(fraction, 0, 1) * (PALETTE_STEPS - 1))
    lut[value] = index < 1 ? 1 : index
  }
  const palette = { colors, lut, max, log }
  palettes.set(layer, palette)
  return palette
}

export interface RasterBitmap {
  width: number
  height: number
  /** Device pixels per bitmap pixel; 1 means one bitmap pixel per screen pixel. */
  step: number
  data: Uint8ClampedArray
}

export interface RasterBuffers {
  bitmap: RasterBitmap
  /** Per-pixel value accumulator at bitmap resolution. */
  weights: Float32Array
}

/**
 * Bitmap resolution for this view. Cells larger than a screen pixel get one
 * bitmap pixel per cell; cells smaller than a pixel are binned, so the drawn
 * resolution is bounded by the canvas, never by the data.
 */
export function rasterBitmapSize(
  layer: RasterLayer,
  projection: MapProjection,
  width: number,
  height: number,
  dpr: number,
): { width: number; height: number; step: number } {
  const cellPx = Math.abs(projection.toX(layer.cellDeg) - projection.toX(0)) * dpr
  const floor = layer.minCellPx ? Math.max(1, Math.round(layer.minCellPx * dpr)) : 1
  let step = Math.max(floor, Math.round(cellPx))
  let pixelWidth = Math.max(1, Math.ceil((width * dpr) / step))
  let pixelHeight = Math.max(1, Math.ceil((height * dpr) / step))
  while (pixelWidth * pixelHeight > MAX_BITMAP_PIXELS) {
    step += 1
    pixelWidth = Math.max(1, Math.ceil((width * dpr) / step))
    pixelHeight = Math.max(1, Math.ceil((height * dpr) / step))
  }
  return { width: pixelWidth, height: pixelHeight, step }
}

export function rasterBuffers(
  size: { width: number; height: number; step: number },
  data?: Uint8ClampedArray,
): RasterBuffers {
  const length = size.width * size.height
  return {
    bitmap: {
      ...size,
      data: data && data.length === length * 4 ? data : new Uint8ClampedArray(length * 4),
    },
    weights: new Float32Array(length),
  }
}

/**
 * Paint the raster into an RGBA bitmap at cell resolution: one pass binning
 * cells into the pixel grid, one pass colourising from the palette. The caller
 * blits the bitmap with `drawImage`, so a frame costs one upload, not one
 * `fillRect` per cell.
 */
export function paintRasterBitmap(
  layer: RasterLayer,
  projection: MapProjection,
  width: number,
  height: number,
  dpr: number,
  buffers: RasterBuffers,
): RasterBitmap {
  const { bitmap, weights } = buffers
  const { width: bw, height: bh, step } = bitmap
  const { colors, lut, max, log } = rasterPalette(layer)
  const perPixel = dpr / step
  const half = layer.cellDeg / 2
  const minLon = projection.toLon(0) - half
  const maxLon = projection.toLon(width) + half
  const maxLat = projection.toLat(0) + half
  const minLat = projection.toLat(height) - half

  weights.fill(0)
  let dirtyLeft = bw
  let dirtyRight = 0
  let dirtyTop = bh
  let dirtyBottom = 0
  const cells = layer.cells
  for (let i = 0; i < cells.length; i += 1) {
    const cell = cells[i]
    const value = cell[2]
    if (!(value > 0)) continue
    const lat = cell[0]
    const lon = cell[1]
    if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) continue
    let x0 = Math.round(projection.toX(lon - half) * perPixel)
    let x1 = Math.round(projection.toX(lon + half) * perPixel)
    let y0 = Math.round(projection.toY(lat + half) * perPixel)
    let y1 = Math.round(projection.toY(lat - half) * perPixel)
    if (x1 <= x0) x1 = x0 + 1
    if (y1 <= y0) y1 = y0 + 1
    if (x0 < 0) x0 = 0
    if (y0 < 0) y0 = 0
    if (x1 > bw) x1 = bw
    if (y1 > bh) y1 = bh
    if (x0 >= x1 || y0 >= y1) continue
    if (x0 < dirtyLeft) dirtyLeft = x0
    if (x1 > dirtyRight) dirtyRight = x1
    if (y0 < dirtyTop) dirtyTop = y0
    if (y1 > dirtyBottom) dirtyBottom = y1
    for (let y = y0; y < y1; y += 1) {
      const row = y * bw
      for (let x = x0; x < x1; x += 1) weights[row + x] += value
    }
  }

  const pixels = new Uint32Array(bitmap.data.buffer)
  pixels.fill(0)
  if (dirtyRight <= dirtyLeft || dirtyBottom <= dirtyTop) return bitmap
  const logMax = Math.log1p(max)
  const lutSize = lut.length
  for (let y = dirtyTop; y < dirtyBottom; y += 1) {
    const row = y * bw
    for (let x = dirtyLeft; x < dirtyRight; x += 1) {
      const value = weights[row + x]
      if (!(value > 0)) continue
      let index: number
      if (value < lutSize) index = lut[value | 0] || 1
      else {
        const fraction = log ? Math.log1p(value) / logMax : value / max
        index = Math.round(clamp(fraction, 0, 1) * (PALETTE_STEPS - 1)) || 1
      }
      pixels[row + x] = colors[index]
    }
  }
  return bitmap
}

/**
 * Keeps the offscreen bitmap for one raster layer and only repaints it when the
 * view, layer or colours change. A selection drag blits the last bitmap.
 */
export class RasterLayerPainter {
  private buffers: RasterBuffers | null = null
  private image: ImageData | null = null
  private tile: HTMLCanvasElement | null = null
  private surface: CanvasRenderingContext2D | null = null
  private key = ''

  draw(
    ctx: CanvasRenderingContext2D,
    layer: RasterLayer,
    projection: MapProjection,
    width: number,
    height: number,
    dpr: number,
    key: string,
  ): void {
    if (key !== this.key || !this.tile || !this.image) {
      const size = rasterBitmapSize(layer, projection, width, height, dpr)
      let image = this.image
      if (!image || image.width !== size.width || image.height !== size.height) {
        image = new ImageData(size.width, size.height)
        this.image = image
      }
      const cached = this.buffers
      const buffers =
        cached &&
        cached.bitmap.width === size.width &&
        cached.bitmap.height === size.height &&
        cached.bitmap.step === size.step
          ? cached
          : rasterBuffers(size, image.data)
      this.buffers = buffers
      if (!this.tile) this.tile = document.createElement('canvas')
      if (this.tile.width !== size.width || this.tile.height !== size.height) {
        this.tile.width = size.width
        this.tile.height = size.height
        this.surface = this.tile.getContext('2d')
      }
      paintRasterBitmap(layer, projection, width, height, dpr, buffers)
      this.surface?.putImageData(image, 0, 0)
      this.key = key
    }
    const previousAlpha = ctx.globalAlpha
    const previousSmoothing = ctx.imageSmoothingEnabled
    if (layer.opacity !== undefined) ctx.globalAlpha = clamp(layer.opacity, 0, 1)
    // The tile is one bitmap pixel per data cell; interpolating it would invent
    // values between discrete bins, so the blit stays nearest-neighbour.
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(this.tile, 0, 0, this.tile.width, this.tile.height, 0, 0, width, height)
    ctx.imageSmoothingEnabled = previousSmoothing
    ctx.globalAlpha = previousAlpha
  }
}

/* -------------------------------------------------------------------------- */
/* Layer bounds                                                               */
/* -------------------------------------------------------------------------- */

function emptyExtent(): GeoExtent {
  return {
    minLat: Number.POSITIVE_INFINITY,
    maxLat: Number.NEGATIVE_INFINITY,
    minLon: Number.POSITIVE_INFINITY,
    maxLon: Number.NEGATIVE_INFINITY,
  }
}

function growExtent(extent: GeoExtent, lat: number, lon: number): void {
  if (lat < extent.minLat) extent.minLat = lat
  if (lat > extent.maxLat) extent.maxLat = lat
  if (lon < extent.minLon) extent.minLon = lon
  if (lon > extent.maxLon) extent.maxLon = lon
}

function validExtent(extent: GeoExtent): GeoExtent | null {
  return Number.isFinite(extent.minLat) && Number.isFinite(extent.maxLat) ? extent : null
}

export function ringBounds(ring: readonly LonLat[]): GeoExtent | null {
  const extent = emptyExtent()
  for (const point of ring) growExtent(extent, point.lat, point.lon)
  return validExtent(extent)
}

export function polygonBounds(polygon: readonly LonLat[]): GeoExtent | null {
  return ringBounds(polygon)
}

export function layersBounds(layers: readonly MapLayer[], kinds: 'data' | 'polygon'): GeoExtent | null {
  const extent = emptyExtent()
  for (const layer of layers) {
    if (kinds === 'polygon' && layer.kind !== 'polygon') continue
    if (kinds === 'data' && layer.kind === 'polygon') continue
    if (layer.kind === 'raster') {
      const half = layer.cellDeg / 2
      for (const cell of layer.cells) {
        if (!(cell[2] > 0)) continue
        growExtent(extent, cell[0] + half, cell[1] - half)
        growExtent(extent, cell[0] - half, cell[1] + half)
      }
    } else if (layer.kind === 'points') {
      const length = Math.min(layer.lat.length, layer.lon.length)
      for (let i = 0; i < length; i += 1) growExtent(extent, layer.lat[i], layer.lon[i])
    } else {
      const bounds = ringBounds(layer.ring)
      if (!bounds) continue
      growExtent(extent, bounds.minLat, bounds.minLon)
      growExtent(extent, bounds.maxLat, bounds.maxLon)
    }
  }
  return validExtent(extent)
}

export function fitBounds(
  layers: readonly MapLayer[],
  fit: MapFit,
  selectionPolygon: readonly LonLat[] | undefined,
): GeoExtent | null {
  if (fit === 'none') return null
  if (fit === 'bbox') {
    return (selectionPolygon && polygonBounds(selectionPolygon)) ?? layersBounds(layers, 'polygon')
  }
  if (fit === 'outline') return layersBounds(layers, 'polygon') ?? layersBounds(layers, 'data')
  return layersBounds(layers, 'data') ?? layersBounds(layers, 'polygon')
}

/* -------------------------------------------------------------------------- */
/* Canvas drawing                                                             */
/* -------------------------------------------------------------------------- */

export function outlineLayers(
  outline: GeoCollection | null,
  stroke: string,
  fill?: string,
  width = 1,
): PolygonLayer[] {
  if (!outline) return []
  const layers: PolygonLayer[] = []
  for (const feature of outline.features) {
    for (const polygon of feature.geometry.coordinates) {
      for (const ring of polygon) {
        layers.push({
          kind: 'polygon',
          ring: ring.map(([lon, lat]) => ({ lon, lat })),
          stroke,
          fill,
          width,
        })
      }
    }
  }
  return layers
}

function ringPath(ring: readonly LonLat[], projection: MapProjection): Path2D {
  const path = new Path2D()
  ring.forEach((point, index) => {
    const x = projection.toX(point.lon)
    const y = projection.toY(point.lat)
    if (index === 0) path.moveTo(x, y)
    else path.lineTo(x, y)
  })
  path.closePath()
  return path
}

export function drawPolygons(
  ctx: CanvasRenderingContext2D,
  layers: readonly MapLayer[],
  projection: MapProjection,
): void {
  for (const layer of layers) {
    if (layer.kind !== 'polygon' || layer.ring.length < 3) continue
    const path = ringPath(layer.ring, projection)
    if (layer.fill) {
      ctx.fillStyle = layer.fill
      ctx.fill(path, 'evenodd')
    }
    ctx.strokeStyle = layer.stroke
    ctx.lineWidth = layer.width ?? 1
    ctx.setLineDash(layer.dash ?? [])
    ctx.stroke(path)
  }
  ctx.setLineDash([])
}

export function drawPoints(
  ctx: CanvasRenderingContext2D,
  layer: PointsLayer,
  projection: MapProjection,
): void {
  const length = Math.min(layer.lat.length, layer.lon.length)
  if (length === 0) return
  const radius = Math.max(0.75, (layer.size ?? 3) / 2)
  ctx.fillStyle = layer.color
  ctx.beginPath()
  for (let i = 0; i < length; i += 1) {
    const x = projection.toX(layer.lon[i])
    const y = projection.toY(layer.lat[i])
    ctx.moveTo(x + radius, y)
    ctx.arc(x, y, radius, 0, Math.PI * 2)
  }
  ctx.fill()
}

export function drawSelection(
  ctx: CanvasRenderingContext2D,
  polygon: readonly LonLat[],
  projection: MapProjection,
  theme: ChartTheme,
  label?: string,
): void {
  if (polygon.length < 2) return
  const path = ringPath(polygon, projection)
  ctx.globalAlpha = 0.12
  ctx.fillStyle = theme.accent
  ctx.fill(path)
  ctx.globalAlpha = 1
  ctx.strokeStyle = theme.accent
  ctx.lineWidth = 1.5
  ctx.stroke(path)

  if (!label) return
  const centre = polygon.reduce(
    (sum, point) => ({ lon: sum.lon + point.lon / polygon.length, lat: sum.lat + point.lat / polygon.length }),
    { lon: 0, lat: 0 },
  )
  ctx.font = LABEL_FONT
  const textWidth = ctx.measureText(label).width
  const x = projection.toX(centre.lon)
  const y = projection.toY(centre.lat)
  ctx.fillStyle = theme.panel
  ctx.fillRect(x - textWidth / 2 - 2, y - 16, textWidth + 4, 14)
  ctx.fillStyle = theme.ink
  ctx.textAlign = 'center'
  ctx.fillText(label, x, y - 5)
  ctx.textAlign = 'left'
}

export function drawGraticule(
  ctx: CanvasRenderingContext2D,
  projection: MapProjection,
  width: number,
  height: number,
  theme: ChartTheme,
): void {
  const leftLon = projection.toLon(0)
  const rightLon = projection.toLon(width)
  const topLat = Math.min(MERCATOR_LAT_LIMIT, projection.toLat(0))
  const bottomLat = Math.max(-MERCATOR_LAT_LIMIT, projection.toLat(height))
  const lonStep = graticuleStep(rightLon - leftLon)
  const latStep = graticuleStep(topLat - bottomLat)
  const lonLines = graticuleTicks(leftLon, rightLon, lonStep)
  const latLines = graticuleTicks(bottomLat, topLat, latStep)

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, width, height)
  ctx.clip()
  ctx.strokeStyle = theme.edge
  ctx.lineWidth = 1
  ctx.beginPath()
  for (const lon of lonLines) {
    const x = Math.round(projection.toX(lon)) + 0.5
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
  }
  for (const lat of latLines) {
    const y = Math.round(projection.toY(lat)) + 0.5
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
  }
  ctx.stroke()
  ctx.restore()
}

export function drawEdgeLabels(
  ctx: CanvasRenderingContext2D,
  projection: MapProjection,
  width: number,
  height: number,
  theme: ChartTheme,
): void {
  const leftLon = projection.toLon(0)
  const rightLon = projection.toLon(width)
  const topLat = Math.min(MERCATOR_LAT_LIMIT, projection.toLat(0))
  const bottomLat = Math.max(-MERCATOR_LAT_LIMIT, projection.toLat(height))
  const lonLines = graticuleTicks(leftLon, rightLon, graticuleStep(rightLon - leftLon))
  const latLines = graticuleTicks(bottomLat, topLat, graticuleStep(topLat - bottomLat))

  ctx.save()
  ctx.font = LABEL_FONT
  ctx.fillStyle = theme.muted
  ctx.textBaseline = 'bottom'
  ctx.textAlign = 'left'
  for (const lat of latLines) {
    const y = projection.toY(lat)
    if (y < 12 || y > height - 18) continue
    ctx.fillText(formatDegrees(lat, 'lat'), 4, y - 3)
  }
  ctx.textAlign = 'center'
  for (const lon of lonLines) {
    const x = projection.toX(lon)
    if (x < 24 || x > width - 24) continue
    ctx.fillText(formatDegrees(lon, 'lon'), x, height - 4)
  }
  ctx.restore()
}

export function drawInset(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  layers: readonly MapLayer[],
  extent: GeoExtent,
  theme: ChartTheme,
): void {
  ctx.fillStyle = theme.panel
  ctx.fillRect(0, 0, width, height)
  const outline = layersBounds(layers, 'polygon')
  if (!outline) return
  // Generous margin and no arbitrary span cap: the inset must fit the outline it
  // frames, and leave room for the view rectangle to read as a box inside it.
  const view = viewFromBounds(outline, width, height, 0.2, 0.1, 360)
  const projection = projectView(view, width, height)
  drawPolygons(ctx, layers, projection)

  const left = clamp(Math.min(projection.toX(extent.minLon), projection.toX(extent.maxLon)), 0, width)
  const right = clamp(Math.max(projection.toX(extent.minLon), projection.toX(extent.maxLon)), 0, width)
  const top = clamp(Math.min(projection.toY(extent.maxLat), projection.toY(extent.minLat)), 0, height)
  const bottom = clamp(Math.max(projection.toY(extent.maxLat), projection.toY(extent.minLat)), 0, height)
  // A rectangle that never enters the inset, or fills it, locates nothing.
  if (right - left < 2 || bottom - top < 2) return
  if (right - left >= width - 2 && bottom - top >= height - 2) return
  const x = Math.max(left, 1)
  const y = Math.max(top, 1)
  const boxWidth = Math.min(right - left, width - 1 - x)
  const boxHeight = Math.min(bottom - top, height - 1 - y)
  ctx.globalAlpha = 0.4
  ctx.fillStyle = theme.accent
  ctx.fillRect(x, y, boxWidth, boxHeight)
  ctx.globalAlpha = 1
  ctx.strokeStyle = theme.accent
  ctx.lineWidth = 1.5
  ctx.strokeRect(x, y, boxWidth, boxHeight)
}
