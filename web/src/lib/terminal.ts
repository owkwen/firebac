import type {
  Bbox,
  GitBlameResult,
  GitCommit,
  GitCommitCells,
  GitSensor,
  TerminalMessage,
  TerminalState,
} from '@/types/git'
import { formatDecimal, formatInteger } from './format'
import {
  compareCells,
  compassLabel,
  formatBbox,
  formatCellCoordinate,
  formatSpan,
  formatStamp,
  normaliseBbox,
  summariseCommits,
  validBbox,
} from './git'

export interface TerminalContext {
  state: () => TerminalState
  setLog: (bbox: Bbox | null, year: number | null) => Promise<TerminalState>
  loadBlame: (lat: number, lon: number) => Promise<GitBlameResult>
  loadCells: (commits: readonly GitCommit[]) => Promise<Map<string, GitCommitCells>>
}

export interface TerminalResult {
  messages: TerminalMessage[]
  clear: boolean
}

export type ParsedCommand =
  | { name: 'help' }
  | { name: 'clear' }
  | { name: 'status' }
  | { name: 'log'; bbox: Bbox | null; year: number | null }
  | { name: 'blame'; lat: number; lon: number }
  | { name: 'show'; id: string }
  | { name: 'diff'; a: string; b: string }

const COMMANDS: readonly { usage: string; description: string }[] = [
  { usage: 'help', description: 'list commands with one-line descriptions' },
  {
    usage: 'log [lat0 lat1 lon0 lon1] [--year YYYY]',
    description: 'set the AOI and year, summarise the commit log',
  },
  { usage: 'blame <lat> <lon>', description: 'first and last commit to touch a 0.01° cell' },
  { usage: 'show <pass-id>', description: 'time, satellite, detections, FRP, cells, hit bbox' },
  { usage: 'diff <pass-id> <pass-id>', description: 'cells gained and lost between two passes' },
  { usage: 'status', description: 'current AOI, year and commit count' },
  { usage: 'clear', description: 'clear the buffer' },
]

function error(text: string): TerminalMessage {
  return { kind: 'error', text }
}

function info(text: string): TerminalMessage {
  return { kind: 'info', text }
}

function muted(text: string): TerminalMessage {
  return { kind: 'muted', text }
}

function messageOf(value: unknown): string {
  return value instanceof Error ? value.message : String(value)
}

/** The header prints coordinates with U+2212, so a paste must survive our own typography. */
const NUMERIC_DASH = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g

function normaliseNumber(token: string): string {
  return token.trim().replace(NUMERIC_DASH, '-').replace(/^\+/, '')
}

function parseNumber(token: string, label: string): number {
  const text = normaliseNumber(token)
  const value = text === '' ? Number.NaN : Number(text)
  if (!Number.isFinite(value)) throw new Error(`${label} must be a number, got "${token}"`)
  return value
}

const PASS_ID_PATTERN = /^(?:[A-Z0-9]+\.)?A\d{7}\.\d{4}$/

function parsePassId(token: string): string {
  const value = token.trim().toUpperCase().replace(/^#/, '')
  if (!PASS_ID_PATTERN.test(value)) {
    throw new Error(`not a pass ID (PLATFORM.AYYYYDDD.HHMM expected): ${token}`)
  }
  return value
}

export function parseCommand(input: string): ParsedCommand {
  const tokens = input.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) throw new Error('empty command — type help')
  const name = tokens[0].toLowerCase()
  const rest = tokens.slice(1)

  if (name === 'help' || name === 'clear' || name === 'status') {
    if (rest.length > 0) throw new Error(`${name} takes no arguments`)
    return { name }
  }

  if (name === 'log') {
    let year: number | null = null
    const numbers: string[] = []
    for (let index = 0; index < rest.length; index += 1) {
      const token = rest[index]
      if (token === '--year') {
        const value = rest[index + 1]
        if (!value) throw new Error('--year needs a four-digit year')
        year = parseNumber(value, 'year')
        if (!Number.isInteger(year) || year < 1900 || year > 2200) {
          throw new Error(`year must be an integer between 1900 and 2200, got ${value}`)
        }
        index += 1
      } else if (token.startsWith('--')) {
        throw new Error(`unknown option ${token}`)
      } else {
        numbers.push(token)
      }
    }
    if (numbers.length === 0) return { name, bbox: null, year }
    if (numbers.length !== 4) {
      throw new Error('log takes four bbox numbers: lat0 lat1 lon0 lon1')
    }
    const bbox = normaliseBbox(
      parseNumber(numbers[0], 'lat0'),
      parseNumber(numbers[1], 'lat1'),
      parseNumber(numbers[2], 'lon0'),
      parseNumber(numbers[3], 'lon1'),
    )
    if (!validBbox(bbox)) throw new Error(`invalid bbox: ${formatBbox(bbox)}`)
    return { name, bbox, year }
  }

  if (name === 'blame') {
    if (rest.length !== 2) throw new Error('blame takes two numbers: lat lon')
    const lat = parseNumber(rest[0], 'lat')
    const lon = parseNumber(rest[1], 'lon')
    if (lat < -90 || lat > 90) throw new Error(`lat must be between -90 and 90, got ${lat}`)
    if (lon < -180 || lon > 180) throw new Error(`lon must be between -180 and 180, got ${lon}`)
    return { name, lat, lon }
  }

  if (name === 'show') {
    if (rest.length !== 1) throw new Error('show takes one pass ID')
    return { name, id: parsePassId(rest[0]) }
  }

  if (name === 'diff') {
    if (rest.length !== 2) throw new Error('diff takes two pass IDs')
    return { name, a: parsePassId(rest[0]), b: parsePassId(rest[1]) }
  }

  throw new Error(`unknown command: ${tokens[0]} — type help`)
}

function authorLabel(sensor: GitSensor, satellite: string): string {
  return sensor === 'MODIS' ? `MODIS ${satellite}` : `VIIRS ${satellite}`
}

function bucketLabel(bucket: number): string {
  const start = String(Math.floor(bucket * 6)).padStart(2, '0')
  const end = bucket >= 3 ? '24' : String((bucket + 1) * 6).padStart(2, '0')
  return `${start}:00–${end}:00 UTC bucket`
}

function logSummary(state: TerminalState): TerminalMessage[] {
  if (!state.bbox) return [muted('AOI not ready yet — the densest cell is still loading')]
  const totals = summariseCommits(state.commits)
  const lines: TerminalMessage[] = [
    info(`${formatBbox(state.bbox)} · year ${state.year}`),
  ]
  if (totals.commits === 0) {
    lines.push(muted('no commits inside this box — drag a new AOI or pass four bbox numbers'))
    return lines
  }
  if (totals.first === null || totals.last === null) return lines
  lines.push(
    info(
      `${formatInteger(totals.commits)} commits · ${formatStamp(totals.first)} → ${formatStamp(totals.last)} · ${formatSpan(totals.first, totals.last)}`,
    ),
  )
  for (const author of totals.authors) {
    lines.push(
      info(
        `${authorLabel(author.sensor, author.satellite).padEnd(12)} ${formatInteger(author.commits)} commits · ${formatInteger(author.detections)} det · ${formatInteger(author.frp)} MW`,
      ),
    )
  }
  if (state.commits.length > state.displayedCount) {
    lines.push(
      muted(`showing the newest ${state.displayedCount} of ${formatInteger(state.commits.length)} commits`),
    )
  }
  return lines
}

function runHelp(): TerminalResult {
  return {
    clear: false,
    messages: [
      muted('pass IDs: PLATFORM.AYYYYDDD.HHMM'),
      ...COMMANDS.map((command) => info(`  ${command.usage.padEnd(42)} ${command.description}`)),
    ],
  }
}

function runStatus(state: TerminalState): TerminalResult {
  if (!state.bbox) {
    return { clear: false, messages: [muted(`AOI not ready · year ${state.year} · loading detections`)] }
  }
  const messages = [
    info(`${formatBbox(state.bbox)} · year ${state.year}`),
    info(
      `${formatInteger(state.commits.length)} commits · newest ${state.displayedCount} drawn · cap ${state.cap}`,
    ),
  ]
  if (state.loading) messages.push(muted('a query is still running'))
  return { clear: false, messages }
}

async function runBlame(command: { lat: number; lon: number }, ctx: TerminalContext): Promise<TerminalResult> {
  const state = ctx.state()
  const result = await ctx.loadBlame(command.lat, command.lon)
  const cell = formatCellCoordinate(Math.round(result.lat * 100), Math.round(result.lon * 100))
  if (result.commits.length === 0) {
    const where = state.bbox ? ` inside ${formatBbox(state.bbox)}` : ''
    return {
      clear: false,
      messages: [muted(`cell ${cell}: no detections in ${state.year}${where}`)],
    }
  }
  const first = result.commits[0]
  const last = result.commits[result.commits.length - 1]
  const detections = result.commits.reduce((sum, commit) => sum + commit.detections, 0)
  const messages = [
    info(
      `cell ${cell} · ${result.commits.length} commit${result.commits.length === 1 ? '' : 's'} · ${formatInteger(detections)} detections`,
    ),
    info(`first ${first.id} · ${formatStamp(first.timestamp)} · ${authorLabel(first.sensor, first.satellite)}`),
    info(`last  ${last.id} · ${formatStamp(last.timestamp)} · ${authorLabel(last.sensor, last.satellite)}`),
  ]
  if (first.id === last.id) messages.push(muted('first and last are the same pass'))
  return { clear: false, messages }
}

interface PassLookup {
  commit?: GitCommit
  error?: string
}

/** Full IDs match exactly; an ID without its platform is accepted when unique. */
function resolvePass(token: string, commits: readonly GitCommit[]): PassLookup {
  const value = token.toUpperCase()
  const exact = commits.find((commit) => commit.id === value)
  if (exact) return { commit: exact }

  if (value.startsWith('A')) {
    const matches = commits.filter((commit) => commit.id.endsWith(`.${value}`))
    if (matches.length === 1) return { commit: matches[0] }
    if (matches.length > 1) {
      return {
        error: `${value} is ambiguous in this log — ${matches.map((commit) => commit.id).join(', ')}`,
      }
    }
  }
  return { error: `unknown pass ID ${token} — not in this AOI/year` }
}

async function runShow(
  command: { id: string },
  ctx: TerminalContext,
): Promise<TerminalResult> {
  const state = ctx.state()
  const lookup = resolvePass(command.id, state.commits)
  if (!lookup.commit) {
    return { clear: false, messages: [error(lookup.error ?? `unknown pass ID ${command.id}`)] }
  }
  const commit = lookup.commit
  const index = state.commits.indexOf(commit)
  const messages = [
    info(
      `pass ${commit.id} · ${authorLabel(commit.sensor, commit.satellite)} · ${formatStamp(commit.timestamp)} · ${bucketLabel(commit.bucket)}`,
    ),
    info(
      `${formatInteger(commit.detections)} detections · ${formatDecimal(commit.frp, 1)} MW · ${formatInteger(commit.cells)} cells`,
    ),
    muted(
      `hit bbox ${formatBbox({ lat0: commit.minLat, lat1: commit.maxLat, lon0: commit.minLon, lon1: commit.maxLon }, 3)}`,
    ),
  ]
  if (index < 0 || index >= state.displayedCount) {
    messages.push(
      muted(`not in the newest ${state.displayedCount}; it is still part of the full log`),
    )
  }
  return { clear: false, messages }
}

async function runDiff(
  command: { a: string; b: string },
  ctx: TerminalContext,
): Promise<TerminalResult> {
  const state = ctx.state()
  const firstLookup = resolvePass(command.a, state.commits)
  if (!firstLookup.commit) {
    return { clear: false, messages: [error(firstLookup.error ?? `unknown pass ID ${command.a}`)] }
  }
  const secondLookup = resolvePass(command.b, state.commits)
  if (!secondLookup.commit) {
    return { clear: false, messages: [error(secondLookup.error ?? `unknown pass ID ${command.b}`)] }
  }
  const first = firstLookup.commit
  const second = secondLookup.commit
  if (first.id === second.id) {
    return {
      clear: false,
      messages: [muted(`${first.id} to ${second.id}: same pass — no diff`)],
    }
  }

  const sets = await ctx.loadCells([first, second])
  const empty: GitCommitCells = {
    clat: new Int32Array(0),
    clon: new Int32Array(0),
    frp: new Float64Array(0),
  }
  const diff = compareCells(sets.get(first.id) ?? empty, sets.get(second.id) ?? empty)
  const messages = [
    info(
      `${first.id} → ${second.id} · ${formatStamp(first.timestamp)} → ${formatStamp(second.timestamp)}`,
    ),
    info(
      `+${formatInteger(diff.gained)} gained · −${formatInteger(diff.lost)} lost · ${formatInteger(diff.common)} common cells`,
    ),
  ]
  if (diff.bearing === null) {
    messages.push(muted('centroids coincide — no direction of travel'))
  } else {
    messages.push(
      muted(
        `travel ${compassLabel(diff.bearing)} · ${diff.distanceKm.toFixed(1)} km (cell centroids)`,
      ),
    )
  }
  return { clear: false, messages }
}

async function runLog(
  command: { bbox: Bbox | null; year: number | null },
  ctx: TerminalContext,
): Promise<TerminalResult> {
  const state =
    command.bbox || command.year ? await ctx.setLog(command.bbox, command.year) : ctx.state()
  return { clear: false, messages: logSummary(state) }
}

export async function runCommand(input: string, ctx: TerminalContext): Promise<TerminalResult> {
  let command: ParsedCommand
  try {
    command = parseCommand(input)
  } catch (caught) {
    return { clear: false, messages: [error(messageOf(caught))] }
  }

  try {
    switch (command.name) {
      case 'help':
        return runHelp()
      case 'clear':
        return { clear: true, messages: [] }
      case 'status':
        return runStatus(ctx.state())
      case 'log':
        return await runLog(command, ctx)
      case 'blame':
        return await runBlame(command, ctx)
      case 'show':
        return await runShow(command, ctx)
      case 'diff':
        return await runDiff(command, ctx)
    }
  } catch (caught) {
    return { clear: false, messages: [error(messageOf(caught))] }
  }
}
