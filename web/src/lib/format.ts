import type { CalendarCell } from '@/types/calendar'
import type { CellValue, ColumnKind } from '@/types/detections'

const INTEGER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const ONE_DECIMAL = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
const TWO_DECIMALS = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const THREE_DECIMALS = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 })

export function formatInteger(value: number): string {
  return INTEGER.format(value)
}

export function formatDecimal(value: number, digits = 1): string {
  return (digits <= 1 ? ONE_DECIMAL : TWO_DECIMALS).format(value)
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

export function formatRange(from: string | null, to: string | null): string {
  if (!from || !to) return 'no range'
  return from === to ? from : `${from} to ${to}`
}

/** Three decimals: the artifact publishes ratios to three. */
export function formatRatio(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return `${value.toFixed(3)}×`
}

export function formatRatioShort(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return `${value.toFixed(2)}×`
}

export function formatZ(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  const text = THREE_DECIMALS.format(value)
  return value >= 0 ? `+${text}` : text
}

export function formatZShort(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  const text = value.toFixed(2)
  return value >= 0 ? `+${text}` : text
}

export function formatSignedPercent(fraction: number | null): string {
  if (fraction === null || !Number.isFinite(fraction)) return '—'
  const percent = fraction * 100
  return `${percent >= 0 ? '+' : ''}${percent.toFixed(1)}%`
}

export function formatBuildDate(iso: string): string {
  return iso.slice(0, 10)
}

export function formatElapsed(ms: number): string {
  if (ms < 1) return '<1 ms'
  return `${INTEGER.format(ms)} ms`
}

export function formatPercent(part: number, total: number): string {
  if (total <= 0) return '0%'
  return `${((part / total) * 100).toFixed(1)}%`
}

function plural(value: number, singular: string, pluralForm: string): string {
  return `${formatInteger(value)} ${value === 1 ? singular : pluralForm}`
}

/**
 * Only platforms with a non-zero pixel count appear. A VIIRS-only cell has no
 * Terra/Aqua split, so Suomi NPP is the platform that contributed.
 */
export function formatPlatformSplit(cell: CalendarCell): string {
  const platforms: string[] = []
  if (cell.modis > 0) {
    if (cell.terra_px > 0) platforms.push(`Terra ${formatInteger(cell.terra_px)}`)
    if (cell.aqua_px > 0) platforms.push(`Aqua ${formatInteger(cell.aqua_px)}`)
  } else if (cell.viirs_px > 0) {
    platforms.push(`Suomi NPP ${formatInteger(cell.viirs_px)}`)
  }
  return platforms.length > 0 ? `${platforms.join(' / ')} px` : ''
}

/** Shared by the heatmap tooltip and the detail strip. */
export function formatSparse(cell: CalendarCell): string {
  const detections = cell.modis > 0 ? cell.modis : cell.viirs
  return `${plural(detections, 'detection', 'detections')} on ${plural(cell.days, 'day', 'days')} — sparse coverage, not a quiet month`
}

export function formatCell(value: CellValue, kind: ColumnKind): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  if (kind === 'number') {
    const n = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(n) ? formatDecimal(n, 2) : String(value)
  }
  if (kind === 'integer') {
    const n = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(n) ? formatInteger(n) : String(value)
  }
  return String(value)
}
