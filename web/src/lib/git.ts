import type { CSSProperties } from 'vue'
import type {
  Bbox,
  GitCommit,
  GitCommitCells,
  GitDiff,
  GitLayoutPrefs,
  GitPlanSize,
  GitSensor,
  GitTotals,
  TimelineEntry,
  TimelineLayout,
  TimelineRow,
  TimelineTick,
} from '@/types/git'

export const GIT_COMMIT_CAP = 400
export const GIT_ROW_HEIGHT = 32
export const GIT_ROW_HEIGHTS: Record<GitPlanSize, number> = { compact: 32, large: 40 }
export const GIT_AXIS_WIDTH_PX = 88
export const GIT_PLAN_WIDTHS: Record<GitPlanSize, number> = { compact: 140, large: 240 }
export const GIT_GRID_PADDING_PX = 12
/** Half of a 1440 px viewport still fits the grid, so the timeline never scrolls sideways by default. */
export const GIT_STREAM_MIN_WIDTH_PX = 176
export const GIT_DEFAULT_YEAR = 2023
export const GIT_FALLBACK_BBOX: Bbox = { lat0: 55, lat1: 56, lon0: -106, lon1: -105 }

/** The four visible columns, from the axis gutter to the MODIS stream. */
export function gitGridStyle(plan: GitPlanSize): CSSProperties {
  const planWidth = GIT_PLAN_WIDTHS[plan]
  return {
    gridTemplateColumns: `${GIT_AXIS_WIDTH_PX}px minmax(0,1fr) ${planWidth}px minmax(0,1fr)`,
    paddingInline: `${GIT_GRID_PADDING_PX}px`,
    minWidth: `${GIT_AXIS_WIDTH_PX + planWidth + 2 * GIT_STREAM_MIN_WIDTH_PX}px`,
  }
}

export const GIT_LAYOUT_KEY = 'firms.git.layout.v1'
/** Large by default: compact plans lose an isolated one- or two-pixel pass. */
export const GIT_LAYOUT_DEFAULTS: GitLayoutPrefs = {
  planSize: 'large',
}

const PLAN_SIZES: readonly GitPlanSize[] = ['compact', 'large']

function storedLayout(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(GIT_LAYOUT_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** Anything malformed falls back to the default; a stale key can never break the view. */
export function readGitLayout(): GitLayoutPrefs {
  const size = storedLayout().planSize
  return {
    planSize: PLAN_SIZES.includes(size as GitPlanSize)
      ? (size as GitPlanSize)
      : GIT_LAYOUT_DEFAULTS.planSize,
  }
}

/** A key written by an older build is ignored on read, not migrated. */
export function writeGitLayout(prefs: GitLayoutPrefs): void {
  try {
    localStorage.setItem(GIT_LAYOUT_KEY, JSON.stringify(prefs))
  } catch {
    // Private mode: the layout still works for this session.
  }
}

const DAY_MS = 86_400_000
const TIMELINE_PAD = 8
const DAY_HEADER_PX = 24
const GAP_ROW_PX = 28
const DAY_BLOCK_GAP_PX = 8
const DAY_HOUR_PX = 4
/** Chromium caps a canvas at 32,767 px; stay below it with every displayed row. */
const MAX_TIMELINE_PX = 32_000
const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

function coordKey(value: number): string {
  const normal = Object.is(value, -0) ? 0 : value
  return normal.toFixed(4)
}

const PLATFORM_CODES: Record<string, string> = {
  Terra: 'TERRA',
  Aqua: 'AQUA',
  N: 'NPP',
  N20: 'N20',
  N21: 'N21',
}

export function platformCode(satellite: string): string {
  return PLATFORM_CODES[satellite] ?? satellite.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
}

/**
 * NASA granule-style pass ID: PLATFORM.AYYYYDDD.HHMM, where HHMM is the
 * earliest UTC acquisition minute in the pass. No AOI in the identifier, so it
 * is stable for the same pass across reloads.
 */
export function passId(satellite: string, date: string, minutes: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return `${platformCode(satellite)}.A0000000.0000`
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const dayOfYear =
    Math.floor((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / DAY_MS) + 1
  const clock = ((Math.round(minutes) % 1440) + 1440) % 1440
  return `${platformCode(satellite)}.A${year}${String(dayOfYear).padStart(3, '0')}.${two(Math.floor(clock / 60))}${two(clock % 60)}`
}

export function commitKey(satellite: string, date: string, bucket: number): string {
  return `${satellite}|${date}|${bucket}`
}

export function normaliseBbox(latA: number, latB: number, lonA: number, lonB: number): Bbox {
  return {
    lat0: Math.min(latA, latB),
    lat1: Math.max(latA, latB),
    lon0: Math.min(lonA, lonB),
    lon1: Math.max(lonA, lonB),
  }
}

export function validBbox(bbox: Bbox): boolean {
  const values = [bbox.lat0, bbox.lat1, bbox.lon0, bbox.lon1]
  if (!values.every((value) => Number.isFinite(value))) return false
  return (
    bbox.lat0 >= -90 &&
    bbox.lat1 <= 90 &&
    bbox.lon0 >= -180 &&
    bbox.lon1 <= 180 &&
    bbox.lat1 > bbox.lat0 &&
    bbox.lon1 > bbox.lon0
  )
}

/** URL order is lat0,lat1,lon0,lon1; anything malformed is no box at all. */
export function parseBboxParam(value: string | undefined | null): Bbox | null {
  if (!value) return null
  const parts = value.split(',').map(Number)
  if (parts.length !== 4 || !parts.every((part) => Number.isFinite(part))) return null
  const bbox = normaliseBbox(parts[0], parts[1], parts[2], parts[3])
  return validBbox(bbox) ? bbox : null
}

export function bboxParam(bbox: Bbox): string {
  return [bbox.lat0, bbox.lat1, bbox.lon0, bbox.lon1].map(coordKey).join(',')
}

function signed(value: number, digits: number): string {
  return value.toFixed(digits).replace('-', '−')
}

export function formatBbox(bbox: Bbox, digits = 3): string {
  return `lat ${signed(bbox.lat0, digits)}..${signed(bbox.lat1, digits)} · lon ${signed(bbox.lon0, digits)}..${signed(bbox.lon1, digits)}`
}

export function formatCellCoordinate(clat: number, clon: number): string {
  return `${signed(clat / 100, 2)}, ${signed(clon / 100, 2)}`
}

interface UtcParts {
  year: number
  month: number
  day: number
  hours: number
  minutes: number
}

function utcParts(timestamp: number): UtcParts {
  const date = new Date(timestamp)
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    day: date.getUTCDate(),
    hours: date.getUTCHours(),
    minutes: date.getUTCMinutes(),
  }
}

function two(value: number): string {
  return String(value).padStart(2, '0')
}

export function formatClock(timestamp: number): string {
  const parts = utcParts(timestamp)
  return `${two(parts.hours)}:${two(parts.minutes)}`
}

export function formatDay(timestamp: number): string {
  const parts = utcParts(timestamp)
  return `${parts.day} ${MONTH_LABELS[parts.month]}`
}

export function formatDayYear(timestamp: number): string {
  return `${formatDay(timestamp)} ${utcParts(timestamp).year}`
}

export function formatStamp(timestamp: number): string {
  return `${formatDayYear(timestamp)} ${formatClock(timestamp)} UTC`
}

/** One line for a gap marker: same-year ranges name the year once. */
export function formatDayRange(from: string, to: string): string {
  const start = /^(\d{4})-(\d{2})-(\d{2})$/.exec(from)
  const end = /^(\d{4})-(\d{2})-(\d{2})$/.exec(to)
  if (!start || !end) return `${from} – ${to}`
  const startText = `${Number(start[3])} ${MONTH_LABELS[Number(start[2]) - 1]}`
  const endText = `${Number(end[3])} ${MONTH_LABELS[Number(end[2]) - 1]}`
  if (from === to) return `${startText} ${start[1]}`
  if (start[1] === end[1]) return `${startText} – ${endText} ${end[1]}`
  return `${startText} ${start[1]} – ${endText} ${end[1]}`
}

export function formatPoint(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(2)}${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(2)}${lon >= 0 ? 'E' : 'W'}`
}

export function formatSpan(first: number, last: number): string {
  const span = Math.max(0, last - first)
  if (span === 0) return 'same minute'
  const days = span / DAY_MS
  if (days >= 10) return `${Math.round(days)} days`
  if (days >= 1) return `${days.toFixed(1)} days`
  const hours = span / 3_600_000
  if (hours >= 1) return `${hours.toFixed(1)} h`
  return `${Math.max(1, Math.round(span / 60_000))} min`
}

export function commitTimestamp(date: string, minutes: number): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return Number.NaN
  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Math.floor(minutes / 60),
    minutes % 60,
  )
}

export function summariseCommits(commits: readonly GitCommit[]): GitTotals {
  const authors = new Map<string, GitTotals['authors'][number]>()
  let first = Number.POSITIVE_INFINITY
  let last = Number.NEGATIVE_INFINITY
  for (const commit of commits) {
    if (commit.timestamp < first) first = commit.timestamp
    if (commit.timestamp > last) last = commit.timestamp
    const entry = authors.get(commit.satellite) ?? {
      satellite: commit.satellite,
      sensor: commit.sensor,
      commits: 0,
      detections: 0,
      frp: 0,
    }
    entry.commits += 1
    entry.detections += commit.detections
    entry.frp += commit.frp
    authors.set(commit.satellite, entry)
  }
  const rank = (satellite: string): number =>
    satellite === 'Terra' ? 0 : satellite === 'Aqua' ? 1 : satellite === 'N' ? 2 : 3
  return {
    commits: commits.length,
    first: Number.isFinite(first) ? first : null,
    last: Number.isFinite(last) ? last : null,
    authors: [...authors.values()].sort(
      (a, b) => rank(a.satellite) - rank(b.satellite) || a.satellite.localeCompare(b.satellite),
    ),
  }
}

export function cellMaxima(
  commits: readonly GitCommit[],
  cells: Map<string, GitCommitCells>,
): Record<GitSensor, number> {
  const maxima: Record<GitSensor, number> = { MODIS: 0, VIIRS: 0 }
  for (const commit of commits) {
    const set = cells.get(commit.id)
    if (!set) continue
    for (let i = 0; i < set.frp.length; i += 1) {
      if (set.frp[i] > maxima[commit.sensor]) maxima[commit.sensor] = set.frp[i]
    }
  }
  return maxima
}

function cellKey(clat: number, clon: number): number {
  return clat * 100_000 + clon
}

function centroid(cells: GitCommitCells): { lat: number; lon: number } | null {
  if (cells.clat.length === 0) return null
  let lat = 0
  let lon = 0
  for (let i = 0; i < cells.clat.length; i += 1) {
    lat += cells.clat[i] / 100
    lon += cells.clon[i] / 100
  }
  return { lat: lat / cells.clat.length, lon: lon / cells.clat.length }
}

function travel(from: { lat: number; lon: number }, to: { lat: number; lon: number }): {
  distanceKm: number
  bearing: number | null
} {
  const rad = Math.PI / 180
  const lat1 = from.lat * rad
  const lat2 = to.lat * rad
  const dLat = (to.lat - from.lat) * rad
  const dLon = (to.lon - from.lon) * rad
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  const distanceKm = 2 * 6371.0088 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  if (distanceKm < 0.005) return { distanceKm, bearing: null }
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  const bearing = (Math.atan2(y, x) * 180) / Math.PI
  return { distanceKm, bearing: (bearing + 360) % 360 }
}

export function compareCells(a: GitCommitCells, b: GitCommitCells): GitDiff {
  const keys = new Set<number>()
  for (let i = 0; i < a.clat.length; i += 1) keys.add(cellKey(a.clat[i], a.clon[i]))
  let common = 0
  for (let i = 0; i < b.clat.length; i += 1) {
    if (keys.has(cellKey(b.clat[i], b.clon[i]))) common += 1
  }
  const centreA = centroid(a)
  const centreB = centroid(b)
  const shift = centreA && centreB ? travel(centreA, centreB) : { distanceKm: 0, bearing: null }
  return {
    gained: b.clat.length - common,
    lost: a.clat.length - common,
    common,
    distanceKm: shift.distanceKm,
    bearing: shift.bearing,
  }
}

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'] as const

export function compassLabel(bearing: number): string {
  return COMPASS[Math.round(bearing / 45) % 8]
}

interface DateParts {
  year: number
  month: number
  day: number
}

function dateParts(date: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return null
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
}

function dayIndex(date: string): number | null {
  const parts = dateParts(date)
  if (!parts) return null
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / DAY_MS)
}

function isoDay(index: number): string {
  return new Date(index * DAY_MS).toISOString().slice(0, 10)
}

/**
 * Days collapse to headers, empty stretches collapse to one labelled marker,
 * and only passes inside a day keep a time-proportional scale. Height therefore
 * grows with the number of active days, never with the calendar span.
 */
export function buildTimeline(
  commits: readonly GitCommit[],
  rowHeight = GIT_ROW_HEIGHT,
): TimelineLayout {
  if (commits.length === 0) return { height: 0, entries: [], rows: [], ticks: [] }
  const sorted = [...commits].sort(
    (a, b) =>
      b.timestamp - a.timestamp ||
      a.satellite.localeCompare(b.satellite) ||
      a.id.localeCompare(b.id),
  )

  const days: { date: string; commits: GitCommit[] }[] = []
  for (const commit of sorted) {
    const current = days[days.length - 1]
    if (current && current.date === commit.date) current.commits.push(commit)
    else days.push({ date: commit.date, commits: [commit] })
  }

  const build = (hourScale: number): TimelineLayout & { extra: number } => {
    const entries: TimelineEntry[] = []
    const rows: TimelineRow[] = []
    const ticks: TimelineTick[] = []
    const scale = rowHeight / GIT_ROW_HEIGHT
    let extra = 0
    let cursor = TIMELINE_PAD

    for (let index = 0; index < days.length; index += 1) {
      const day = days[index]
      if (index > 0) {
        const newer = dayIndex(days[index - 1].date)
        const older = dayIndex(day.date)
        if (newer !== null && older !== null && newer - older - 1 > 0) {
          const empty = newer - older - 1
          cursor += DAY_BLOCK_GAP_PX
          entries.push({
            kind: 'gap',
            y: cursor,
            height: GAP_ROW_PX,
            days: empty,
            from: isoDay(older + 1),
            to: isoDay(newer - 1),
          })
          cursor += GAP_ROW_PX
        }
        cursor += DAY_BLOCK_GAP_PX
      }

      entries.push({
        kind: 'day',
        y: cursor,
        height: DAY_HEADER_PX,
        date: day.date,
        passes: day.commits.length,
      })
      cursor += DAY_HEADER_PX

      for (let position = 0; position < day.commits.length; position += 1) {
        const commit = day.commits[position]
        if (position > 0) {
          const hours = (day.commits[position - 1].timestamp - commit.timestamp) / 3_600_000
          const gap = Math.max(
            rowHeight,
            Math.round(hours * DAY_HOUR_PX * scale * hourScale),
          )
          extra += gap - rowHeight
          cursor += gap
        }
        entries.push({ kind: 'commit', y: cursor, height: rowHeight, commit })
        rows.push({ commit, y: cursor })
        ticks.push({
          timestamp: commit.timestamp,
          y: cursor + rowHeight / 2,
          label: formatClock(commit.timestamp),
          major: position === 0,
        })
        cursor += rowHeight
      }
    }

    return {
      height: Math.max(rowHeight + 2 * TIMELINE_PAD, cursor + TIMELINE_PAD),
      entries,
      rows,
      ticks,
      extra,
    }
  }

  const natural = build(1)
  if (natural.height <= MAX_TIMELINE_PX || natural.extra <= 0) return natural
  // Compress only the extra within-day spacing; the minimum row grid stays intact.
  let low = 0
  let high = 1
  for (let step = 0; step < 20; step += 1) {
    const mid = (low + high) / 2
    if (build(mid).height <= MAX_TIMELINE_PX) low = mid
    else high = mid
  }
  return build(low)
}

/**
 * Context, not a data product: one cool slate-teal hue under the commit plans,
 * so the reader can see where to drag without mistaking it for the AOI answer.
 * Deliberately brighter than the "muted context" instinct: at 0.65 opacity over
 * the #070a0d map the previous ramp composed to 1.1–1.7:1, and because half a
 * year's 0.1° bins sit at 1–13 on a log scale, they all landed on the first
 * stop — the layer read as empty. These stops compose to 2.6–4.2:1: enough to
 * read as graded terrain, capped so the land/sea fill and coastline still show
 * through it and the saturated orange AOI stroke stays the only accent.
 */
export const GIT_DENSITY_RAMP = ['#5f8290', '#7399a4', '#88a7b1', '#95b1ba'] as const

/**
 * The deepest zoom the locator map allows. A 0.1° bin is ten pixels across at
 * 1°; finer reading is the AOI page's job, and going deeper only inflates a bin.
 */
export const GIT_MAP_MIN_SPAN_DEG = 1

