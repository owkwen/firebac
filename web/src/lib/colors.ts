import type { Sensor } from '@/types/dataset'

export interface ChartTheme {
  ink: string
  muted: string
  faint: string
  grid: string
  modis: string
  viirs: string
  accent: string
  ceiling: string
  panel: string
  band: string
  sunken: string
  raised: string
  edge: string
  edgeStrong: string
  focus: string
}

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export function chartTheme(): ChartTheme {
  return {
    ink: token('--ink'),
    muted: token('--muted'),
    faint: token('--faint'),
    grid: token('--chart-grid'),
    modis: token('--modis'),
    viirs: token('--viirs'),
    accent: token('--accent'),
    ceiling: token('--ceiling'),
    panel: token('--panel'),
    band: token('--chart-band'),
    sunken: token('--sunken'),
    raised: token('--raised'),
    edge: token('--edge'),
    edgeStrong: token('--edge-strong'),
    focus: token('--focus'),
  }
}

export function sensorColor(sensor: Sensor, theme: ChartTheme): string {
  return sensor === 'MODIS' ? theme.modis : theme.viirs
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Token values live in `src/styles/tokens.css`. Monotone luminance, CVD-safe; zero is the plot background. */
export const COUNT_RAMP = ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'] as const

/** Blue–orange, deuteranopia-safe. Zero is the neutral panel colour, not a stop. */
export const DIVERGING_NEG = ['#abd9e9', '#74add1', '#2c7bb6'] as const
export const DIVERGING_POS = ['#fdae61', '#f46d43', '#d7191c'] as const

interface Rgb {
  r: number
  g: number
  b: number
}

function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.replace('#', ''), 16)
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 }
}

function mix(from: string, to: string, fraction: number): Rgb {
  const a = hexToRgb(from)
  const b = hexToRgb(to)
  return {
    r: Math.round(a.r + (b.r - a.r) * fraction),
    g: Math.round(a.g + (b.g - a.g) * fraction),
    b: Math.round(a.b + (b.b - a.b) * fraction),
  }
}

function cssRgb(rgb: Rgb): string {
  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`
}

function luminance(rgb: Rgb): number {
  const channel = (value: number): number => {
    const unit = value / 255
    return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b)
}

export interface CellPaint {
  background: string
  ink: string
}

let palette: { sunken: string; raised: string; ink: string; faint: string } | null = null

function cellPalette() {
  if (!palette) {
    palette = {
      sunken: token('--sunken'),
      raised: token('--raised'),
      ink: token('--ink'),
      faint: token('--faint'),
    }
  }
  return palette
}

function paintFor(rgb: Rgb, background: string): CellPaint {
  const { sunken, ink } = cellPalette()
  return { background, ink: luminance(rgb) > 0.34 ? sunken : ink }
}

function rampAt(stops: readonly string[], t: number): Rgb {
  const bounded = Math.min(1, Math.max(0, t))
  const scaled = bounded * (stops.length - 1)
  const index = Math.min(stops.length - 2, Math.floor(scaled))
  return mix(stops[index], stops[index + 1], scaled - index)
}

/**
 * Colour is log1p so winter months stay visible; the legend states the scale.
 * Daily mode passes the smallest positive value as `min`, so the ramp starts
 * over the positive range while zero stays an explicit no-detection gap.
 */
export function countsPaint(value: number, max: number, min = 0): CellPaint {
  const { sunken, faint } = cellPalette()
  if (!(value > 0)) return { background: sunken, ink: faint }
  const low = Math.log1p(Math.max(0, min))
  const high = Math.log1p(Math.max(max, 1))
  const fraction = high > low ? (Math.log1p(value) - low) / (high - low) : 1
  const rgb = rampAt(COUNT_RAMP, fraction)
  return paintFor(rgb, cssRgb(rgb))
}

export function anomalyPaint(z: number, limit: number): CellPaint {
  const { raised, ink } = cellPalette()
  if (!Number.isFinite(z) || limit <= 0) return { background: raised, ink }
  const t = Math.min(1, Math.abs(z) / limit)
  if (t < 0.02) return { background: raised, ink }
  const stops = z < 0 ? [raised, ...DIVERGING_NEG] : [raised, ...DIVERGING_POS]
  const rgb = rampAt(stops, t)
  return paintFor(rgb, cssRgb(rgb))
}
