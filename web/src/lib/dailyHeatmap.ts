import type { SeriesMode, SeriesRow } from '@/types/calendar'
import type { ChartTheme } from './colors'
import { daysInYear } from './aggregate'
import { countsPaint } from './colors'
import { MONTH_LABELS, SERIES_LABELS } from './constants'
import { formatInteger } from './format'

/**
 * Fixed 12 × 31 lattice. Column = (month − 1) × 31 + (day − 1), so March
 * always starts at the same column in every row and leap years never shift
 * the later months. Days that do not exist (29 February in a common year,
 * 30 February, 31 April) are simply never painted.
 */
export const DAILY_MONTH_COLUMNS = 31
export const DAILY_COLUMNS = 12 * DAILY_MONTH_COLUMNS
export const DAILY_PAD_TOP = 18
export const DAILY_PAD_LEFT = 46
export const DAILY_PAD_RIGHT = 2
export const DAILY_ROW_HEIGHT = 22
export const DAILY_CELL_HEIGHT = 20

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const
const YEAR_FONT = '11px ui-monospace, SFMono-Regular, Menlo, monospace'
const MONTH_FONT = '600 10px system-ui, -apple-system, sans-serif'

export function dailyHeight(rowCount: number): number {
  return DAILY_PAD_TOP + rowCount * DAILY_ROW_HEIGHT
}

export function dailyCellWidth(width: number): number {
  return Math.max(0.5, (width - DAILY_PAD_LEFT - DAILY_PAD_RIGHT) / DAILY_COLUMNS)
}

export function daysInMonth(year: number, month: number): number {
  return MONTH_DAYS[month - 1] + (month === 2 && daysInYear(year) === 366 ? 1 : 0)
}

/** 0-based day-of-year index where each month starts, for decoding the series. */
export function monthStarts(year: number): number[] {
  const leap = daysInYear(year) === 366
  const starts: number[] = []
  let elapsed = 0
  for (let month = 0; month < 12; month += 1) {
    starts.push(elapsed)
    elapsed += MONTH_DAYS[month] + (month === 1 && leap ? 1 : 0)
  }
  return starts
}

export function firstColumnOfMonth(month: number): number {
  return (month - 1) * DAILY_MONTH_COLUMNS
}

export interface CalendarDay {
  month: number
  day: number
  /** 0-based doy index into series[year][mode]. */
  dayIndex: number
}

export function dateAtColumn(year: number, column: number): CalendarDay | null {
  if (column < 0 || column >= DAILY_COLUMNS) return null
  const month = Math.floor(column / DAILY_MONTH_COLUMNS) + 1
  const day = (column % DAILY_MONTH_COLUMNS) + 1
  if (day > daysInMonth(year, month)) return null
  return { month, day, dayIndex: monthStarts(year)[month - 1] + day - 1 }
}

/** Keep a cursor in the same month/day when possible; 29 February falls back to the 28th. */
export function resolveColumn(year: number, column: number): number {
  const start = firstColumnOfMonth(Math.floor(column / DAILY_MONTH_COLUMNS) + 1)
  for (let candidate = column; candidate >= start; candidate -= 1) {
    if (dateAtColumn(year, candidate)) return candidate
  }
  return start
}

/** Arrow keys walk real dates only, skipping slots that do not exist. */
export function stepColumn(year: number, column: number, delta: number): number | null {
  let candidate = column + delta
  while (candidate >= 0 && candidate < DAILY_COLUMNS) {
    if (dateAtColumn(year, candidate)) return candidate
    candidate += delta
  }
  return null
}

export function isoDay(year: number, dayIndex: number): string {
  return new Date(Date.UTC(year, 0, dayIndex + 1)).toISOString().slice(0, 10)
}

export function dailyValue(
  row: SeriesRow | undefined,
  series: SeriesMode,
  day: number,
): number | null {
  if (!row || day < 0 || day >= daysInYear(row.year)) return null
  const value = row[series]?.[day]
  return typeof value === 'number' ? value : null
}

export interface DailyScale {
  /** Smallest positive value actually painted; the ramp starts here. */
  min: number
  max: number
}

/** The ramp is scaled over the positive values the daily view paints, never the monthly max. */
export function dailyScale(
  rows: readonly SeriesRow[],
  series: SeriesMode,
  harmonizedFrom: number,
): DailyScale {
  let min = Number.POSITIVE_INFINITY
  let max = 0
  for (const row of rows) {
    if (series === 'harmonized' && row.year < harmonizedFrom) continue
    const track = row[series]
    if (!track) continue
    const days = Math.min(daysInYear(row.year), track.length)
    for (let day = 0; day < days; day += 1) {
      const value = track[day]
      if (typeof value !== 'number' || value <= 0) continue
      if (value < min) min = value
      if (value > max) max = value
    }
  }
  if (!Number.isFinite(min)) return { min: 0, max: 1 }
  return { min, max }
}

export interface DayDescription {
  date: string
  month: number
  value: number | null
  count: string
  summary: string
}

export function dayDescription(
  rows: readonly SeriesRow[],
  year: number,
  column: number,
  series: SeriesMode,
  harmonizedFrom: number,
): DayDescription | null {
  const row = rows.find((candidate) => candidate.year === year)
  const calendarDay = dateAtColumn(year, column)
  if (!row || !calendarDay) return null
  const date = isoDay(year, calendarDay.dayIndex)
  const month = calendarDay.month
  if (series === 'harmonized' && year < harmonizedFrom) {
    return {
      date,
      month,
      value: null,
      count: 'no second sensor',
      summary: `${date}: no second sensor, VIIRS starts ${harmonizedFrom}`,
    }
  }
  const value = dailyValue(row, series, calendarDay.dayIndex)
  if (value === null) {
    return { date, month, value, count: 'no record', summary: `${date}: no record` }
  }
  const count = `${formatInteger(value)} burning ${value === 1 ? 'day' : 'days'}`
  return { date, month, value, count, summary: `${date}: ${count}, ${SERIES_LABELS[series]}` }
}

export interface DailyCellPosition {
  year: number
  column: number
}

interface DrawInput {
  ctx: CanvasRenderingContext2D
  width: number
  rows: readonly SeriesRow[]
  series: SeriesMode
  harmonizedFrom: number
  selected: { year: number; month: number }
  cursor: DailyCellPosition | null
  focused: boolean
  scale: DailyScale
  theme: ChartTheme
}

function drawHatch(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  theme: ChartTheme,
): void {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, width, height)
  ctx.clip()
  ctx.fillStyle = theme.raised
  ctx.fillRect(x, y, width, height)
  ctx.strokeStyle = theme.edgeStrong
  ctx.lineWidth = 1
  for (let start = x - height; start < x + width; start += 5) {
    ctx.beginPath()
    ctx.moveTo(start, y + height)
    ctx.lineTo(start + height, y)
    ctx.stroke()
  }
  ctx.restore()
}

export function drawDailyHeatmap(input: DrawInput): void {
  const { ctx, width, rows, series, theme } = input
  const height = dailyHeight(rows.length)
  const cellWidth = dailyCellWidth(width)
  const gridWidth = width - DAILY_PAD_LEFT - DAILY_PAD_RIGHT
  const gridBottom = DAILY_PAD_TOP + rows.length * DAILY_ROW_HEIGHT

  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = theme.panel
  ctx.fillRect(0, 0, width, height)

  ctx.textBaseline = 'alphabetic'
  ctx.font = MONTH_FONT
  ctx.textAlign = 'center'
  for (let month = 0; month < 12; month += 1) {
    const start = month * DAILY_MONTH_COLUMNS
    if (month > 0) {
      ctx.fillStyle = theme.edgeStrong
      ctx.fillRect(Math.round(DAILY_PAD_LEFT + start * cellWidth), DAILY_PAD_TOP - 4, 1, 4)
    }
    ctx.fillStyle = theme.muted
    ctx.fillText(MONTH_LABELS[month][0], DAILY_PAD_LEFT + (start + 15.5) * cellWidth, DAILY_PAD_TOP - 6)
  }

  rows.forEach((row, rowIndex) => {
    const top = DAILY_PAD_TOP + rowIndex * DAILY_ROW_HEIGHT
    const isSelectedYear = row.year === input.selected.year

    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.font = YEAR_FONT
    ctx.fillStyle = isSelectedYear ? theme.ink : theme.muted
    ctx.fillText(String(row.year), DAILY_PAD_LEFT - 8, top + DAILY_CELL_HEIGHT / 2)

    if (series === 'harmonized' && row.year < input.harmonizedFrom) {
      drawHatch(ctx, DAILY_PAD_LEFT, top, gridWidth, DAILY_CELL_HEIGHT, theme)
    } else {
      const track = row[series]
      const starts = monthStarts(row.year)
      ctx.save()
      ctx.beginPath()
      ctx.rect(DAILY_PAD_LEFT, top, gridWidth, DAILY_CELL_HEIGHT)
      ctx.clip()
      for (let month = 1; month <= 12; month += 1) {
        const days = daysInMonth(row.year, month)
        const monthStart = starts[month - 1]
        for (let day = 1; day <= days; day += 1) {
          const value = track?.[monthStart + day - 1]
          // Zero and missing days stay unfilled, so "no fire today" reads as a gap.
          if (typeof value !== 'number' || value <= 0) continue
          const column = (month - 1) * DAILY_MONTH_COLUMNS + (day - 1)
          ctx.fillStyle = countsPaint(value, input.scale.max, input.scale.min).background
          // Half a pixel of overlap keeps fractional cell widths from growing hairlines.
          ctx.fillRect(
            DAILY_PAD_LEFT + column * cellWidth,
            top,
            cellWidth + 0.5,
            DAILY_CELL_HEIGHT,
          )
        }
      }
      ctx.restore()
    }
  })

  ctx.fillStyle = theme.edgeStrong
  for (let month = 1; month < 12; month += 1) {
    ctx.fillRect(
      Math.round(DAILY_PAD_LEFT + month * DAILY_MONTH_COLUMNS * cellWidth),
      DAILY_PAD_TOP,
      1,
      gridBottom - DAILY_PAD_TOP,
    )
  }

  const cursor = input.cursor
  if (input.focused && cursor) {
    const rowIndex = rows.findIndex((row) => row.year === cursor.year)
    if (rowIndex >= 0 && dateAtColumn(cursor.year, cursor.column)) {
      const x = DAILY_PAD_LEFT + cursor.column * cellWidth
      const y = DAILY_PAD_TOP + rowIndex * DAILY_ROW_HEIGHT
      ctx.strokeStyle = theme.focus
      ctx.lineWidth = 1
      ctx.strokeRect(x + 0.5, y + 0.5, Math.max(2, cellWidth - 1), DAILY_CELL_HEIGHT - 1)
    }
  }
}
