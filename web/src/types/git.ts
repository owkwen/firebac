export type GitSensor = 'MODIS' | 'VIIRS'

export type GitPlanSize = 'compact' | 'large'

export interface GitLayoutPrefs {
  planSize: GitPlanSize
}

export interface GitIndexYear {
  year: number
  passes: number
  pass_cells: number
  bytes: number
}

export interface GitIndex {
  region: string
  years: GitIndexYear[]
}

/** AOI rectangle in degrees. lat0 < lat1 and lon0 < lon1 after normalisation. */
export interface Bbox {
  lat0: number
  lat1: number
  lon0: number
  lon1: number
}

/**
 * One satellite pass over the AOI. The group key is satellite + acq_date + 6 h
 * bucket; `minutes` is the earliest acquisition minute in the bucket, so the
 * pass ID survives a change in which detection happens to fall first in the scan.
 */
export interface GitCommit {
  id: string
  satellite: string
  sensor: GitSensor
  date: string
  bucket: number
  minutes: number
  timestamp: number
  detections: number
  frp: number
  cells: number
  minLat: number
  maxLat: number
  minLon: number
  maxLon: number
}

/** Aggregated 0.01° cells for one commit; arrays are parallel. */
export interface GitCommitCells {
  clat: Int32Array
  clon: Int32Array
  frp: Float64Array
}

export interface GitAuthorTotals {
  satellite: string
  sensor: GitSensor
  commits: number
  detections: number
  frp: number
}

export interface GitTotals {
  commits: number
  first: number | null
  last: number | null
  authors: GitAuthorTotals[]
}

export interface GitLog {
  year: number
  bbox: Bbox
  /** Newest first, every commit in the AOI. */
  commits: GitCommit[]
  /** Newest first, capped; the only commits that get a plan and a card. */
  displayed: GitCommit[]
  cells: Map<string, GitCommitCells>
  sensorMax: Record<GitSensor, number>
  totals: GitTotals
}

export interface TimelineRow {
  commit: GitCommit
  y: number
}

export interface TimelineTick {
  timestamp: number
  y: number
  label: string
  major: boolean
}

export interface TimelineDayEntry {
  kind: 'day'
  y: number
  height: number
  date: string
  passes: number
}

export interface TimelineGapEntry {
  kind: 'gap'
  y: number
  height: number
  /** Whole calendar days with no commit between two active days. */
  days: number
  from: string
  to: string
}

export interface TimelineCommitEntry {
  kind: 'commit'
  y: number
  height: number
  commit: GitCommit
}

export type TimelineEntry = TimelineDayEntry | TimelineGapEntry | TimelineCommitEntry

export interface TimelineLayout {
  height: number
  entries: TimelineEntry[]
  /** Commit entries only: the rows the canvas, cards and preview consume. */
  rows: TimelineRow[]
  ticks: TimelineTick[]
}

export type TerminalKind = 'info' | 'error' | 'muted' | 'echo'

export interface TerminalLine {
  id: number
  kind: TerminalKind
  text: string
}

export interface TerminalMessage {
  kind: Exclude<TerminalKind, 'echo'>
  text: string
}

export interface TerminalState {
  year: number
  bbox: Bbox | null
  commits: GitCommit[]
  displayedCount: number
  cap: number
  loading: boolean
}

export interface GitBlameResult {
  lat: number
  lon: number
  commits: GitCommit[]
}

export interface GitDiff {
  gained: number
  lost: number
  common: number
  distanceKm: number
  /** Degrees clockwise from north; null when the centroids coincide. */
  bearing: number | null
}
