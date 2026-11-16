import type { CalendarArtifact } from '@/types/calendar'
import type { DensityIndex } from '@/types/detections'
import type { GridArtifact } from '@/types/grid'
import type { MetaArtifact, RegionEntry } from '@/types/meta'
import type { ModelArtifact } from '@/types/model'

export type ArtifactKind = 'calendar' | 'density' | 'grid' | 'model' | 'meta' | 'regions'

export class ArtifactError extends Error {
  readonly file: string
  readonly kind: ArtifactKind

  constructor(kind: ArtifactKind, file: string, reason: string) {
    super(`${file}: ${reason}`)
    this.name = 'ArtifactError'
    this.kind = kind
    this.file = file
  }
}

function baseUrl(): string {
  const base = import.meta.env.BASE_URL
  return base.endsWith('/') ? base : `${base}/`
}

export function artifactUrl(path: string): string {
  return `${baseUrl()}artifacts/${path.replace(/^\/+/, '')}`
}

export function publicDataUrl(path: string): string {
  return `${baseUrl()}${path.replace(/^\/+/, '')}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Schema and top-level keys are checked once per file. Field-level shape is
 * trusted after that: the builder already enforces it, and re-checking 8 M
 * rows in the browser would only slow the first paint. The coverage fields are
 * the exception: they are new, tiny (one row per month/year) and drive the
 * sparse and platform annotations, so they are checked once at load.
 */
function requireRecord(
  value: unknown,
  kind: ArtifactKind,
  file: string,
  schema: string,
  keys: readonly string[],
): Record<string, unknown> {
  if (!isRecord(value)) throw new ArtifactError(kind, file, 'expected a JSON object')
  if (value.schema !== schema) {
    throw new ArtifactError(kind, file, `schema is ${String(value.schema)}, expected ${schema}`)
  }
  const missing = keys.filter((key) => !(key in value))
  if (missing.length > 0) {
    throw new ArtifactError(kind, file, `missing required key${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`)
  }
  return value
}

const cache = new Map<string, Promise<unknown>>()

async function fetchJson(path: string, kind: ArtifactKind, resolved = artifactUrl(path)): Promise<unknown> {
  const url = resolved
  const cached = cache.get(url)
  if (cached) return cached

  const request = (async () => {
    let response: Response
    try {
      response = await fetch(url, { cache: 'no-cache' })
    } catch (cause) {
      throw new ArtifactError(kind, path, `network failure (${cause instanceof Error ? cause.message : String(cause)})`)
    }
    if (!response.ok) throw new ArtifactError(kind, path, `HTTP ${response.status}`)
    try {
      return await response.json()
    } catch {
      throw new ArtifactError(kind, path, 'response is not valid JSON')
    }
  })()

  cache.set(url, request)
  request.catch(() => cache.delete(url))
  return request
}

function requireCoverageFields(
  data: Record<string, unknown>,
  file: string,
): void {
  const cells = data.cells
  const annual = data.annual
  if (!Array.isArray(cells) || !Array.isArray(annual)) {
    throw new ArtifactError('calendar', file, 'cells and annual must be arrays')
  }
  const badCell = cells.find(
    (cell) =>
      !isRecord(cell) ||
      typeof cell.terra_px !== 'number' ||
      typeof cell.aqua_px !== 'number' ||
      typeof cell.days !== 'number' ||
      typeof cell.sparse !== 'boolean',
  )
  if (badCell) {
    throw new ArtifactError(
      'calendar',
      file,
      'every cell needs numeric terra_px, aqua_px and days plus a boolean sparse',
    )
  }
  const badAnnual = annual.find(
    (row) => !isRecord(row) || !Array.isArray(row.satellites),
  )
  if (badAnnual) {
    throw new ArtifactError('calendar', file, 'every annual row needs a satellites array')
  }
  const constellation = data.constellation
  if (
    !isRecord(constellation) ||
    !Array.isArray(constellation.modis) ||
    !Array.isArray(constellation.viirs) ||
    typeof constellation.aqua_from !== 'string' ||
    typeof constellation.viirs_from !== 'string' ||
    typeof constellation.note !== 'string'
  ) {
    throw new ArtifactError(
      'calendar',
      file,
      'constellation needs modis, aqua_from, viirs, viirs_from and note',
    )
  }
  if (!Array.isArray(data.non_comparable_years) || typeof data.non_comparable_note !== 'string') {
    throw new ArtifactError(
      'calendar',
      file,
      'non_comparable_years must be an array and non_comparable_note a string',
    )
  }
}

export async function loadCalendar(region: string): Promise<CalendarArtifact> {
  const path = `calendar/${region}.json`
  const data = await fetchJson(path, 'calendar')
  const record = requireRecord(data, 'calendar', path, 'fire-calendar/2', [
    'region', 'years', 'months', 'modes', 'harmonized_from', 'constellation',
    'baseline', 'cells', 'annual', 'series', 'non_comparable_years', 'non_comparable_note',
  ])
  requireCoverageFields(record, path)
  return record as unknown as CalendarArtifact
}

export async function loadGrid(region: string, year: number): Promise<GridArtifact> {
  const path = `grid/${region}/${year}.json`
  const data = await fetchJson(path, 'grid')
  requireRecord(data, 'grid', path, 'fire-grid/1', ['region', 'year', 'step_deg', 'cells', 'rows'])
  return data as unknown as GridArtifact
}

export async function loadModel(region: string): Promise<ModelArtifact> {
  const path = `model/${region}.json`
  const data = await fetchJson(path, 'model')
  requireRecord(data, 'model', path, 'fire-model/1', [
    'method', 'unit', 'estimate', 'multiplicity_bins', 'validation', 'caveats',
  ])
  return data as unknown as ModelArtifact
}

export async function loadMeta(region: string): Promise<MetaArtifact> {
  const path = `meta/${region}.json`
  const data = await fetchJson(path, 'meta')
  requireRecord(data, 'meta', path, 'fire-meta/1', ['generated_utc', 'region', 'rows', 'inputs'])
  return data as unknown as MetaArtifact
}

export async function loadRegions(): Promise<RegionEntry[]> {
  const path = 'regions.json'
  const data = await fetchJson(path, 'regions')
  if (!Array.isArray(data)) throw new ArtifactError('regions', path, 'expected an array')
  const regions = data.filter(
    (entry): entry is RegionEntry =>
      isRecord(entry) && typeof entry.code === 'string' && typeof entry.name === 'string',
  )
  if (regions.length !== data.length) {
    throw new ArtifactError('regions', path, 'every entry needs a string code and name')
  }
  return regions
}

export async function loadDensityIndex(): Promise<DensityIndex> {
  const path = 'density/index.json'
  const data = await fetchJson(path, 'density', publicDataUrl(path))
  if (!isRecord(data) || !Array.isArray(data.years)) {
    throw new ArtifactError('density', path, 'expected a years array')
  }
  return data as unknown as DensityIndex
}

export function hotspotsUrl(region: string, year: number): string {
  return artifactUrl(`hotspots/${region}-${year}.csv.gz`)
}
