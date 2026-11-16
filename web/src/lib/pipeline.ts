import { formatInteger, formatSignedPercent } from '@/lib/format'
import type {
  FlowDirection,
  FlowEdge,
  FlowLayout,
  FlowNode,
  PipelineInput,
  PipelineModel,
  PipelineStage,
  SensorTone,
  StageStatus,
} from '@/types/pipeline'

export const NOT_PUBLISHED = 'not published'

export const STAGE_STATUS_LABELS: Record<StageStatus, string> = {
  live: 'live',
  validation: 'validation-only',
  rejected: 'rejected',
}

const EN_DASH = '\u2013'

function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return NOT_PUBLISHED
  if (bytes < 1_000_000) return `${Math.round(bytes / 1_000)} KB`
  const mb = bytes / 1_000_000
  return `${mb >= 100 ? formatInteger(Math.round(mb)) : mb.toFixed(1)} MB`
}

function count(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? formatInteger(value) : NOT_PUBLISHED
}

function span(years: readonly number[]): string {
  if (years.length === 0) return NOT_PUBLISHED
  const first = years[0]
  const last = years[years.length - 1]
  return first === last ? String(first) : `${first}${EN_DASH}${last}`
}

function yearsOf(files: readonly { file: string }[]): number[] {
  const years = new Set<number>()
  for (const input of files) {
    const match = /_(\d{4})_/.exec(input.file)
    if (match) years.add(Number(match[1]))
  }
  return [...years].sort((a, b) => a - b)
}

function sensorFiles<T extends { file: string }>(inputs: readonly T[], prefix: string): T[] {
  return inputs.filter((input) => input.file.startsWith(prefix))
}

function sumRows(files: readonly { rows: number }[]): number {
  return files.reduce((total, file) => total + file.rows, 0)
}

function windowLabel(value: { start: number; end: number } | undefined): string {
  return value ? `${value.start}${EN_DASH}${value.end}` : NOT_PUBLISHED
}

function logLossLine(input: PipelineInput): string {
  const model = input.model
  const scores = model?.validation.log_loss_canada_2023
  if (!model || !scores) return `${NOT_PUBLISHED}: model/${input.region}.json is missing`
  return (
    `FRP only ${scores.frp.toFixed(4)} → multiplicity only ${scores.multiplicity.toFixed(4)} ` +
    `→ FRP + multiplicity ${scores.frp_multiplicity.toFixed(4)}. Geometry adds 0.0003 nats ` +
    `once multiplicity is known (F6); expected calibration error ${model.validation.ece.toFixed(4)}.`
  )
}

function binTable(input: PipelineInput): PipelineStage['table'] {
  const model = input.model
  if (!model) return undefined
  return {
    caption: `Published multiplicity calibration, ${windowLabel(input.calendar?.calibration)}`,
    columns: ['VIIRS pixels', 'P(M|V,n)', '1 / P', '95% CI', 'events'],
    rows: model.multiplicity_bins.map((bin) => [
      bin.label,
      bin.p.toFixed(4),
      `${bin.correction.toFixed(2)}×`,
      `${bin.ci[0].toFixed(4)}${EN_DASH}${bin.ci[1].toFixed(4)}`,
      formatInteger(bin.events),
    ]),
  }
}

export function buildPipeline(input: PipelineInput): PipelineModel {
  const { meta, calendar, model, density, regions } = input
  const inputs = meta?.inputs ?? []
  const modisFiles = sensorFiles(inputs, 'modis_')
  const viirsFiles = sensorFiles(inputs, 'viirs-')
  const modisYears = yearsOf(modisFiles)
  const viirsYears = yearsOf(viirsFiles)
  const buildYears = calendar?.years ?? []
  const calibration = windowLabel(calendar?.calibration)
  const baseline = windowLabel(calendar?.baseline)
  const terraFrom = calendar?.constellation.terra_from ?? NOT_PUBLISHED
  const aquaFrom = calendar?.constellation.aqua_from ?? NOT_PUBLISHED
  const viirsFrom = calendar?.constellation.viirs_from ?? NOT_PUBLISHED
  const lastYear = buildYears.length > 0 ? buildYears[buildYears.length - 1] : NOT_PUBLISHED
  const seriesSlots = calendar?.series[0]?.modis.length
  const firstBin = model?.multiplicity_bins[0]
  const lastBin = model?.multiplicity_bins[model.multiplicity_bins.length - 1]
  const correctionRange =
    firstBin && lastBin
      ? `${firstBin.correction.toFixed(2)}× for bin ${firstBin.label} down to ${lastBin.correction.toFixed(2)}× for bin ${lastBin.label}`
      : NOT_PUBLISHED
  const inputBytes = inputs.reduce((total, file) => total + file.bytes, 0)
  const inputRows = sumRows(inputs)
  const regionName = regions.find((entry) => entry.code === (meta?.region ?? input.region))?.name ?? input.region
  const firstInput = inputs[0]?.file ?? NOT_PUBLISHED
  const lastInput = inputs[inputs.length - 1]?.file ?? NOT_PUBLISHED

  const densityYears = density?.years ?? []
  const aoiYears = densityYears.map((year) => year.year)
  const densityCells = densityYears.length
    ? densityYears.reduce((total, year) => total + year.density_cells, 0)
    : null
  const densityBytes = densityYears.length
    ? densityYears.reduce((total, year) => total + year.density_bytes, 0)
    : null
  const celldaysBytes = densityYears.length
    ? densityYears.reduce((total, year) => total + year.celldays_bytes, 0)
    : null
  const aoiCellDays = densityYears.length
    ? densityYears.reduce((total, year) => total + year.cell_days, 0)
    : null

  const peakYear = calendar?.peak.year ?? null
  const peak = peakYear === null ? null : calendar?.annual.find((row) => row.year === peakYear) ?? null
  const peakLine =
    peak && peak.harmonized !== null
      ? `${peak.year}: ${formatInteger(peak.modis)} MODIS cell-days → ${formatInteger(Math.round(peak.harmonized))} harmonised (${formatSignedPercent(peak.harmonized / peak.modis - 1)}).`
      : NOT_PUBLISHED

  const raw: PipelineStage = {
    id: 'raw',
    title: 'NASA FIRMS archive',
    oneLine: 'One CSV per sensor and year, downloaded once.',
    lane: 'build',
    status: 'live',
    sensor: 'shared',
    diagram: { label: 'NASA FIRMS archive', sub: `${formatInteger(inputs.length)} CSVs · ${formatBytes(inputBytes)}` },
    findings: ['F13'],
    what: 'NASA FIRMS publishes MODIS and VIIRS active-fire detections as country-year CSV files; the build reads that archive.',
    inOut: [
      {
        label: 'in',
        value: 'NASA FIRMS country archive',
        note: 'firms.modaps.eosdis.nasa.gov/data/country',
      },
      {
        label: 'out',
        value: `${formatInteger(inputs.length)} CSV files · ${formatBytes(inputBytes)}`,
        note: meta ? `${firstInput} … ${lastInput}` : NOT_PUBLISHED,
      },
      {
        label: 'rows',
        value: `${formatInteger(inputRows)} raw detections`,
        note: 'before the type and FRP filters; every file has a sha256 in meta',
      },
    ],
    maths: [],
    code: ['src/firms/fetch.py', 'src/firms/config.py'],
    note: `The archive ends with the ${lastYear} files; "to the present" means to the end of ${lastYear}.`,
  }

  const modis: PipelineStage = {
    id: 'modis',
    title: `MODIS ${EN_DASH} Terra + Aqua`,
    oneLine: `A 1 km active-fire product merged across two platforms: Terra from ${terraFrom}, Aqua from ${aquaFrom}.`,
    lane: 'build',
    status: 'live',
    sensor: 'modis',
    diagram: { label: 'MODIS', sub: `${formatInteger(modisFiles.length)} files, ${span(modisYears)}` },
    findings: ['F11'],
    what: 'Terra and Aqua are merged into one MODIS series; the calendar keeps their pixel counts separate.',
    inOut: [
      {
        label: 'in',
        value: `${formatInteger(modisFiles.length)} MODIS CSVs · ${span(modisYears)}`,
        note: 'modis_{year}_{country}.csv',
      },
      {
        label: 'rows',
        value: `${formatInteger(sumRows(modisFiles))} detections`,
      },
    ],
    maths: [
      {
        label: 'reference sensor',
        text: 'MODIS is the reference: a MODIS cell-day is counted once, at 1.0, and is never corrected upward.',
      },
    ],
    code: ['src/firms/config.py', 'src/firms/fetch.py'],
    note: '2000 and the first half of 2002 are Terra-only, so those years look quieter per day; the 2012–2022 baseline skips them.',
  }

  const viirs: PipelineStage = {
    id: 'viirs',
    title: 'VIIRS — Suomi NPP',
    oneLine: `375 m active-fire detections from ${viirsFrom} to ${lastYear}: Suomi NPP only.`,
    lane: 'build',
    status: 'live',
    sensor: 'viirs',
    diagram: { label: 'VIIRS', sub: `${formatInteger(viirsFiles.length)} files, ${span(viirsYears)}` },
    findings: ['F13', 'F8'],
    what: 'Suomi NPP only: merging a second VIIRS platform would move every multiplicity bin.',
    inOut: [
      {
        label: 'in',
        value: `${formatInteger(viirsFiles.length)} VIIRS CSVs · ${span(viirsYears)}`,
        note: 'viirs-snpp_{year}_{country}.csv',
      },
      {
        label: 'rows',
        value: `${formatInteger(sumRows(viirsFiles))} detections`,
        note: 'I4 brightness is censored at 367 K, so brightness is not compared across sensors',
      },
    ],
    maths: [
      {
        label: 'what is published',
        text: 'NOAA-20 is fetched and validated but kept out of the record; NOAA-21 is not in the country archive.',
      },
    ],
    code: ['src/firms/config.py', 'src/firms/fetch.py'],
    note: 'Suomi NPP stopped delivering on 2 November 2026. The record can continue on NOAA-20 only with the bins recalibrated (F8, F13).',
  }

  const normalise: PipelineStage = {
    id: 'normalise',
    title: 'Normalise',
    oneLine: 'Keep vegetation fires with positive FRP and put both sensors in one table.',
    lane: 'build',
    status: 'live',
    sensor: 'shared',
    diagram: { label: 'Normalise', sub: 'type=0 · FRP>0' },
    findings: [],
    what: 'One table from forty CSVs; the sensor comes from the filename, not from a column.',
    inOut: [
      { label: 'in', value: `${formatInteger(inputRows)} raw detections` },
      {
        label: 'out',
        value: 'normalised detection rows',
        note: `${NOT_PUBLISHED} as a row count: meta records the raw and cell-day counts only`,
      },
      {
        label: 'filters',
        value: 'type = 0 · FRP > 0',
        note: 'industrial and offshore fires are excluded',
      },
    ],
    maths: [
      {
        label: 'acq_time',
        text: 'acq_time is HHMM text, not minutes: minutes = floor(v / 100) × 60 + v mod 100.',
      },
      {
        label: 'sensor',
        text: 'Satellite codes are N, N20 and N21.',
      },
    ],
    code: ['src/firms/artifacts.py', 'src/firms/detections.py'],
    note: 'The AOI tables apply the same filter, so raw rows and aggregates describe the same detections.',
  }

  const cellDays: PipelineStage = {
    id: 'cell-days',
    title: '0.01° cell-days',
    oneLine: 'Every detection of one sensor on one date in one 0.01° cell becomes one counted event.',
    lane: 'build',
    status: 'live',
    sensor: 'shared',
    diagram: { label: '0.01° cell-days', sub: `${count(meta?.rows.cell_days)} cell-days` },
    findings: ['F1', 'F16'],
    what: 'A cell-day is one cell, one date and one sensor: the unit every published count is built from.',
    inOut: [
      {
        label: 'in',
        value: 'normalised detection rows',
        note: `post-filter count not published; the raw input is ${count(meta?.rows.detections)} rows`,
      },
      { label: 'out', value: `${count(meta?.rows.cell_days)} cell-days`, note: 'meta/CA.json rows.cell_days' },
      { label: 'grid', value: '0.01°', note: '0.25° is the map grid; this is the storage grid' },
    ],
    maths: [
      {
        label: 'cell',
        text: 'clat = round(latitude / 0.01); clon = round(longitude / 0.01). Negative longitude is west.',
      },
      {
        label: 'count',
        text: 'n_modis is the number of MODIS pixels in that cell-day; n_viirs is the same for VIIRS.',
      },
      {
        label: 'why',
        text: 'A long pass, a wider footprint or repeated looks at the same fire cannot inflate a cell-day count.',
      },
    ],
    code: ['src/firms/artifacts.py'],
  }

  const calibrationStage: PipelineStage = {
    id: 'model',
    title: `Calibration ${EN_DASH} P(M | V, n)`,
    oneLine: 'MODIS\'s chance of also seeing a VIIRS cell-day, split by how many VIIRS pixels the cell-day contained.',
    lane: 'build',
    status: 'live',
    sensor: 'shared',
    diagram: { label: 'Calibration', sub: `P(M|V,n) · ${calibration}` },
    findings: ['F5', 'F6', 'F7'],
    what: `How often MODIS also saw a VIIRS cell-day in ${calibration}, per multiplicity bin, held fixed afterwards.`,
    inOut: [
      {
        label: 'in',
        value: `${count(model?.multiplicity_bins.reduce((total, bin) => total + bin.events, 0))} VIIRS cell-days`,
        note: `calibration window ${calibration}`,
      },
      {
        label: 'out',
        value: `${count(model?.multiplicity_bins.length)} bins · P and 95% CI`,
        note: 'model/CA.json',
      },
      {
        label: 'bins',
        value: '1 · 2–3 · 4–7 · 8+',
        note: 'counted in VIIRS pixels inside the cell-day',
      },
    ],
    maths: [
      {
        label: 'P',
        text: 'P is hits / events inside each bin: how often MODIS was present when VIIRS was. 1 / P is how many VIIRS-only cell-days that bin stands for.',
      },
      {
        label: 'interval',
        text: 'The 95% interval is a Wilson score interval, not the normal approximation, so it stays inside [0, 1] for the sparse bin.',
      },
      { label: 'validation', text: logLossLine(input) },
    ],
    table: binTable(input),
    code: ['src/firms/artifacts.py', 'private notebooks (draft)'],
    note: `${model?.validation.transfer ?? NOT_PUBLISHED}. ${model?.validation.shape ?? NOT_PUBLISHED}.`,
  }

  const harmonised: PipelineStage = {
    id: 'harmonised',
    title: 'Harmonised estimate',
    oneLine: 'The combined count is an expected number of cell-days, not a count of detections.',
    lane: 'build',
    status: 'live',
    sensor: 'shared',
    diagram: { label: 'Harmonised', sub: 'MODIS + expected VIIRS' },
    findings: ['F9', 'F10'],
    what: 'Every MODIS cell-day keeps unit weight; every VIIRS-only cell-day is replaced by its bin probability.',
    inOut: [
      {
        label: 'in',
        value: 'MODIS cell-days + VIIRS-only cell-days',
        note: 'one row per 0.01° cell-day',
      },
      {
        label: 'out',
        value: peakLine,
        note: peakYear === null ? 'calendar artifact is missing' : `peak year ${peakYear} from calendar/CA.json`,
      },
      {
        label: 'range',
        value: calendar ? `${calendar.harmonized_from}${EN_DASH}${calendar.years[calendar.years.length - 1]}` : NOT_PUBLISHED,
        note: 'null before the first year with a second sensor, never zero',
      },
    ],
    maths: [
      {
        label: 'sum',
        text: 'H = Σ 1[MODIS present] + Σ P(bin) over every VIIRS-only cell-day. A MODIS cell-day is never corrected upward.',
      },
      {
        label: 'correction',
        text: `1 / P runs from ${correctionRange}, so no single factor fits both ends.`,
      },
      {
        label: 'boundary',
        text: `Pre-${calendar?.harmonized_from ?? NOT_PUBLISHED} has no second sensor, so the gap is shown and not filled.`,
      },
    ],
    code: ['src/firms/artifacts.py'],
    note: 'P is calibrated on 2012–2022 and held fixed, so 2023–2025 are out of sample.',
  }

  const grid: PipelineStage = {
    id: 'grid',
    title: '0.25° grid · daily series',
    oneLine: 'The same cell-days regrained to a 0.25° map, a daily series and monthly z-scores.',
    lane: 'build',
    status: 'live',
    sensor: 'shared',
    diagram: { label: '0.25° grid', sub: 'daily series · z' },
    findings: ['F10', 'F12'],
    what: `Cell-days are regrouped to 0.25° by month and by day, then z-scored against the ${baseline} baseline.`,
    inOut: [
      { label: 'in', value: `${count(meta?.rows.cell_days)} cell-days` },
      {
        label: 'out',
        value: calendar ? `${calendar.years.length} grid files · calendar + daily series` : NOT_PUBLISHED,
        note: 'grid/CA/{year}.json and calendar/CA.json',
      },
      {
        label: 'map',
        value: `${calendar?.map_deg ?? meta?.map_deg ?? NOT_PUBLISHED}°`,
        note: 'equal-degree aspect, no basemap',
      },
    ],
    maths: [
      {
        label: 'map cell',
        text: 'mlat = round(clat × 0.01 / 0.25); a map row is [cell, month, modis, harmonised, viirs].',
      },
      {
        label: 'z',
        text: `z = (log1p(count) ${EN_DASH} mean of log1p in the month) / sd, over the ${baseline} baseline; negative means below normal.`,
      },
      {
        label: 'series',
        text: `Every year has ${count(seriesSlots)} slots, leap day included, and a day with no detection is a zero.`,
      },
    ],
    code: ['src/firms/artifacts.py'],
    note: 'March 2002 is flagged sparse rather than read as a quiet month: one detection on one day is an archive gap the CSV cannot settle (F12).',
  }

  const artifacts: PipelineStage = {
    id: 'artifacts',
    title: 'artifacts/*.json',
    oneLine: 'Calendar, grid, model, meta, hotspots, density and the AOI tables.',
    lane: 'build',
    status: 'live',
    sensor: 'shared',
    diagram: { label: 'artifacts/*.json', sub: 'calendar · grid · model' },
    findings: ['F9', 'F10'],
    what: 'One family per question, written at build time, so a view reads a file instead of scanning detections.',
    inOut: [
      {
        label: 'in',
        value: `${formatInteger(inputs.length)} CSVs · ${count(meta?.rows.cell_days)} cell-days`,
        note: 'plus the calibration table',
      },
      {
        label: 'out',
        value: 'calendar · grid · model · meta · hotspots · density · celldays · detections',
      },
      {
        label: '0.1° raster',
        value: `${count(densityCells)} cells · ${formatBytes(densityBytes)}`,
        note: `density/index.json, ${span(aoiYears)}; sums are exact for detections, not for cell-days`,
      },
      {
        label: 'cell-day tables',
        value: formatBytes(celldaysBytes),
        note: `celldays/, ${count(aoiCellDays)} cell-days over ${span(aoiYears)}`,
      },
    ],
    maths: [
      {
        label: 'no recomputation',
        text: 'The correction, the anomaly and the baseline are applied here, not at read time.',
      },
    ],
    code: ['src/firms/artifacts.py', 'src/firms/density.py', 'src/firms/detections.py'],
    note: `Built ${meta?.generated_utc ?? NOT_PUBLISHED} with DuckDB ${meta?.software.duckdb ?? NOT_PUBLISHED} and pandas ${meta?.software.pandas ?? NOT_PUBLISHED}.`,
  }

  const app: PipelineStage = {
    id: 'web-app',
    title: 'Static Vue app',
    oneLine: 'Vue 3 and Vite, no backend: the bundle fetches JSON and Parquet.',
    lane: 'build',
    status: 'live',
    sensor: 'shared',
    diagram: { label: 'Static Vue app', sub: 'Vue · no backend' },
    findings: [],
    what: 'A static bundle; a fresh clone serves the calendar, timeline and data pages without Python.',
    inOut: [
      { label: 'in', value: 'artifacts · density · celldays · detections', note: 'all under public/' },
      { label: 'out', value: 'dist/', note: 'static files; no calls after the asset load' },
      { label: 'rule', value: 'science stays in Python', note: 'the browser never refits P or recomputes the anomaly' },
    ],
    maths: [],
    code: ['src/lib/artifacts.ts', 'src/views/CalendarView.vue', 'src/views/RegionView.vue'],
  }

  const surfaces: PipelineStage = {
    id: 'surfaces',
    title: 'Calendar · Region · Timeline · Data · About',
    oneLine: 'Five routes over one set of artifacts: calendar, region, timeline, data, about.',
    lane: 'build',
    status: 'live',
    sensor: 'shared',
    diagram: { label: 'Calendar · Region', sub: 'Timeline · Data · About' },
    findings: [],
    what: 'Each route answers a different question; /data records where each number came from.',
    inOut: [
      { label: 'out', value: '/ · /region · /timeline · /data · /about', note: 'Region is also reached from the calendar' },
      { label: 'state', value: 'region and dates in the URL', note: 'the URL is the source of truth' },
    ],
    maths: [],
    code: ['src/router.ts'],
  }

  const aoiParquet: PipelineStage = {
    id: 'aoi-parquet',
    title: 'Per-year Parquet',
    oneLine: 'Raw detections and exact 0.01° cell-days, one file per year.',
    lane: 'aoi',
    status: 'live',
    sensor: 'shared',
    diagram: { label: 'Per-year Parquet', sub: `${formatInteger(aoiYears.length)} years · exact cell-days` },
    findings: [],
    what: 'One row per raw detection, and one row per published cell-day, split by year.',
    inOut: [
      {
        label: 'in',
        value: `raw CSVs · ${span(aoiYears)}`,
        note: 'published sensors only',
      },
      {
        label: 'out · detections',
        value: 'detections/{region}-{year}.parquet',
        note: 'one raw detection per row',
      },
      {
        label: 'out · cell-days',
        value: 'celldays/{region}-{year}.parquet',
        note: `${count(aoiCellDays)} cell-days · ${formatBytes(celldaysBytes)}`,
      },
    ],
    maths: [
      {
        label: 'order',
        text: 'Sorted by clat, clon, so a bounding box skips row groups instead of scanning a year.',
      },
    ],
    code: ['src/firms/detections.py', 'src/firms/density.py'],
    note: 'The calendar is an aggregate over the country; a selection is any box inside it.',
  }

  const aoiDuckdb: PipelineStage = {
    id: 'aoi-duckdb',
    title: 'DuckDB-WASM in the browser',
    oneLine: 'The selection is queried in the tab; no request leaves the browser.',
    lane: 'aoi',
    status: 'live',
    sensor: 'shared',
    diagram: { label: 'DuckDB-WASM', sub: 'SQL in the browser' },
    findings: [],
    what: 'DuckDB-WASM runs in a Web Worker over the selected Parquet files.',
    inOut: [
      { label: 'in', value: 'celldays/{region}-{year}.parquet', note: 'loaded on demand' },
      { label: 'out', value: 'SQL result rows', note: 'counts, bins and raw points' },
    ],
    maths: [],
    code: ['src/lib/duck.ts', 'src/lib/raw.ts'],
  }

  const aoiSelection: PipelineStage = {
    id: 'aoi-selection',
    title: 'Selection',
    oneLine: 'A box or polygon filters exact cell-days; counts and the published correction stay in separate columns.',
    lane: 'aoi',
    status: 'live',
    sensor: 'shared',
    diagram: { label: 'Selection', sub: 'cell-days + raw rows' },
    findings: [],
    what: 'A coarse 0.1° raster paints first; every number comes from the exact 0.01° cell-days.',
    inOut: [
      { label: 'in', value: 'a user box or polygon', note: 'and a year' },
      { label: 'out', value: 'cell-days · raw rows · expected count', note: 'the correction is applied from the same model bins' },
    ],
    maths: [
      {
        label: 'three grains',
        text: '0.1° bins paint the map, 0.01° cell-days answer how many burning days are in the box, and raw rows fill the table.',
      },
    ],
    code: ['src/views/RegionView.vue'],
  }

  const singleRatio: PipelineStage = {
    id: 'single-ratio',
    title: 'A single global ratio',
    oneLine: 'One correction constant for both sensors, everywhere.',
    lane: 'rejected',
    status: 'rejected',
    sensor: 'shared',
    diagram: { label: 'Single ratio', sub: 'one factor for every fire' },
    findings: ['F1', 'F2'],
    what: 'One factor for every VIIRS detection is wrong at both ends: a lone pixel and a dense cluster.',
    inOut: [
      { label: 'in', value: 'one ratio' },
      { label: 'out', value: 'one number', note: 'rejected' },
    ],
    maths: [
      {
        label: 'region',
        text: 'The raw VIIRS/MODIS ratio is 3.21 in Argentina and about 5.0 in Canada, so a global constant is already wrong across two regions.',
      },
      {
        label: 'unit',
        text: 'At cell-day grain the Argentina ratio is 2.08, not 3.21: half the raw disagreement is double counting.',
      },
    ],
    code: ['src/firms/artifacts.py', 'private notebooks (draft)'],
    note: `The published model replaces this with four probabilities; 1/P falls from ${firstBin?.correction.toFixed(2) ?? NOT_PUBLISHED}× to ${lastBin?.correction.toFixed(2) ?? NOT_PUBLISHED}× as multiplicity rises.`,
  }

  const footprint: PipelineStage = {
    id: 'footprint',
    title: 'Footprint area',
    oneLine: 'Explain the sensor gap with scan × track geometry.',
    lane: 'rejected',
    status: 'rejected',
    sensor: 'shared',
    diagram: { label: 'Footprint', sub: 'scan × track geometry' },
    findings: ['F3', 'F19'],
    what: 'A larger MODIS pixel was the first explanation for why it sees fewer cell-days than VIIRS.',
    inOut: [
      { label: 'in', value: 'scan × track, a view-angle proxy', note: 'added to FRP' },
      { label: 'out', value: '+0.0015 nats', note: '+0.0012 in the second region' },
    ],
    maths: [
      {
        label: 'coefficient',
        text: 'The fitted coefficient is −0.22 logit per log-km², too large to be a footprint effect.',
      },
      {
        label: 'scale',
        text: 'Mean pixel area is 1.43 km² for MODIS and 0.20 km² for VIIRS, a 7.2× ratio, but the raw detection ratio is 3.21×: geometry does not predict the count.',
      },
    ],
    code: ['private notebooks (draft)'],
    note: 'Acquisition times were averaged per cell-day, and about 7% of VIIRS cell-days mix a day and a night overpass; correcting that halved the gain.',
  }

  const solar: PipelineStage = {
    id: 'solar-zenith',
    title: 'Solar zenith',
    oneLine: 'Normalise the count by sun angle as the level mechanism.',
    lane: 'rejected',
    status: 'validation',
    sensor: 'shared',
    diagram: { label: 'Solar zenith', sub: 'sun angle as the mechanism' },
    findings: ['F4'],
    what: 'Sun angle is a real but tiny covariate: it shifts the level and does not improve ranking.',
    inOut: [
      { label: 'in', value: 'solar zenith at the detected pixel', note: 'out of region' },
      { label: 'out', value: '+0.0063 and +0.0103 nats', note: 'does not reproduce in region (+0.0014)' },
    ],
    maths: [
      {
        label: 'ranking',
        text: 'AUC moves 0.7091 → 0.7103 while the mean predicted probability moves toward the truth.',
      },
      {
        label: 'confound',
        text: 'Solar zenith is inseparable from overpass time here (ρ 0.88–0.95), so the coefficient cannot carry the mechanism on its own.',
      },
    ],
    code: ['private notebooks (draft)'],
    note: 'Validation-only: it is not in the published correction.',
  }

  const noaa: PipelineStage = {
    id: 'noaa20',
    title: 'NOAA-20 in the published record',
    oneLine: 'Merge a second VIIRS platform to extend the record.',
    lane: 'rejected',
    status: 'validation',
    sensor: 'shared',
    diagram: { label: 'NOAA-20', sub: 'second VIIRS platform' },
    findings: ['F8', 'F13'],
    what: 'NOAA-20 is in the archive for 2018–2025; merging it would move every multiplicity bin.',
    inOut: [
      { label: 'in', value: 'viirs-jpss1 · 2018–2025', note: 'downloaded for validation' },
      { label: 'out', value: 'not in the published series', note: 'the published sensors are MODIS and Suomi NPP' },
    ],
    maths: [
      {
        label: 'stability',
        text: 'NOAA-20 versus Suomi NPP, 2018–2022: maximum Δ 0.0073 at any bin (F8).',
      },
      {
        label: 'condition',
        text: 'The curve is stable on the same landscape; continuing on NOAA-20 still needs the bins recalibrated.',
      },
    ],
    code: ['src/firms/config.py', 'research/cross-platform.md'],
    note: 'NOAA-21 is in the FIRMS map and API but not in the country archive: every path tested returns 404.',
  }

  const burnedArea: PipelineStage = {
    id: 'burned-area',
    title: 'Burned area as a movement signal',
    oneLine: "Use MCD64A1's per-pixel day of burn to check a corridor's timeline.",
    lane: 'rejected',
    status: 'validation',
    sensor: 'shared',
    diagram: { label: 'Burned area', sub: 'day-of-burn as a check' },
    findings: ['F23'],
    what: 'MCD64A1 C6 carries a 500 m day of burn: enough for a timeline, not an overpass time.',
    inOut: [
      { label: 'in', value: 'MCD64A1 C6 burn date · 500 m', note: 'sourced, not downloaded' },
      { label: 'out', value: 'a candidate check', note: 'no result yet' },
    ],
    maths: [
      {
        label: 'limit',
        text: 'A monthly composite with a burn date can constrain a timeline to a few days; it cannot place a fire at an overpass time.',
      },
    ],
    code: ['not built'],
    note: 'Validation-only: documented as a possible check, not used in any published number.',
  }

  const buildStages = [
    raw,
    modis,
    viirs,
    normalise,
    cellDays,
    calibrationStage,
    harmonised,
    grid,
    artifacts,
    app,
    surfaces,
  ]
  const aoiStages = [aoiParquet, aoiDuckdb, aoiSelection]
  const rejectedStages = [singleRatio, footprint, solar, noaa, burnedArea]

  return {
    counts: {
      region: meta?.region ?? input.region,
      regionName,
      inputs: inputs.length,
      inputRows,
      inputBytes,
      detections: meta?.rows.detections ?? 0,
      cellDays: meta?.rows.cell_days ?? 0,
      densityCells,
      densityBytes,
      celldaysBytes,
      aoiCellDays,
      aoiYears,
      buildYears,
      generatedUtc: meta?.generated_utc ?? '',
    },
    buildStages,
    aoiStages,
    rejectedStages,
    allStages: [...buildStages, ...aoiStages, ...rejectedStages],
  }
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (candidate.length <= maxChars || !line) {
      line = candidate
    } else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

function ortho(points: readonly [number, number][]): string {
  return points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x} ${y}`).join(' ')
}

function edge(points: readonly [number, number][], sensor: SensorTone): FlowEdge {
  return { d: ortho(points), sensor }
}

function charsFor(width: number): number {
  return Math.max(12, Math.floor((width - 16) / 5.6))
}

function makeNode(stage: PipelineStage, x: number, y: number, w: number, h: number, maxLines: number): FlowNode {
  const detail = wrapText(stage.diagram.sub, charsFor(w)).slice(0, maxLines)
  return {
    id: stage.id,
    x,
    y,
    w,
    h,
    label: stage.diagram.label,
    detail,
    meta: stage.lane === 'rejected' ? stage.findings.join(' · ') || NOT_PUBLISHED : null,
    sensor: stage.sensor,
    status: stage.status,
    dashed: stage.status !== 'live',
  }
}

function literalNode(
  id: string,
  label: string,
  detail: string[],
  x: number,
  y: number,
  w: number,
  h: number,
): FlowNode {
  return {
    id,
    x,
    y,
    w,
    h,
    label,
    detail,
    meta: null,
    sensor: 'shared',
    status: 'live',
    dashed: false,
  }
}

export function buildFlow(stages: readonly PipelineStage[], direction: FlowDirection): FlowLayout {
  const byId = new Map(stages.map((stage) => [stage.id, stage]))
  const stage = (id: string): PipelineStage | null => byId.get(id) ?? null

  if (direction === 'horizontal') {
    const nodes: FlowNode[] = []
    const add = (id: string, geo: readonly [number, number, number, number], lines = 2): void => {
      const found = stage(id)
      if (found) nodes.push(makeNode(found, geo[0], geo[1], geo[2], geo[3], lines))
    }

    add('raw', [10, 54, 140, 52])
    add('modis', [170, 18, 120, 48])
    add('viirs', [170, 98, 120, 48])
    add('normalise', [320, 54, 140, 52])
    add('cell-days', [490, 54, 145, 52])
    add('model', [665, 18, 145, 52])
    add('harmonised', [840, 18, 145, 52])
    add('grid', [665, 154, 145, 52])
    add('artifacts', [840, 116, 145, 52])
    add('web-app', [840, 218, 145, 52])
    add('surfaces', [840, 308, 145, 52])

    nodes.push(literalNode('raw', 'raw CSVs', ['2012–2025 · same archive'], 12, 418, 200, 52))
    add('aoi-parquet', [258, 418, 200, 52])
    add('aoi-duckdb', [504, 418, 200, 52])
    add('aoi-selection', [750, 418, 200, 52])

    for (const [index, rejected] of stages.filter((item) => item.lane === 'rejected').entries()) {
      nodes.push(makeNode(rejected, 10 + index * 200, 532, 180, 68, 3))
    }

    const edges: FlowEdge[] = [
      edge([[150, 80], [160, 80], [160, 42], [170, 42]], 'modis'),
      edge([[150, 80], [160, 80], [160, 122], [170, 122]], 'viirs'),
      edge([[290, 42], [300, 42], [300, 72], [320, 72]], 'modis'),
      edge([[290, 122], [300, 122], [300, 88], [320, 88]], 'viirs'),
      edge([[460, 80], [490, 80]], 'shared'),
      edge([[562, 54], [562, 44], [665, 44]], 'shared'),
      edge([[810, 44], [840, 44]], 'shared'),
      edge([[635, 80], [650, 80], [650, 180], [665, 180]], 'shared'),
      edge([[912, 70], [912, 116]], 'shared'),
      edge([[810, 180], [825, 180], [825, 142], [840, 142]], 'shared'),
      edge([[912, 168], [912, 218]], 'shared'),
      edge([[912, 266], [912, 308]], 'shared'),
      edge([[212, 444], [258, 444]], 'shared'),
      edge([[458, 444], [504, 444]], 'shared'),
      edge([[704, 444], [750, 444]], 'shared'),
    ]

    return {
      id: 'horizontal',
      width: 1000,
      height: 616,
      nodes,
      edges,
      labels: [
        { x: 10, y: 12, text: 'BUILD TIME · PYTHON' },
        { x: 12, y: 402, text: 'AOI PAGE · CLIENT-SIDE PATH' },
        { x: 10, y: 516, text: 'TRIED, NOT USED · DASHED' },
      ],
    }
  }

  const nodes: FlowNode[] = []
  const add = (id: string, geo: readonly [number, number, number, number], lines = 2): void => {
    const found = stage(id)
    if (found) nodes.push(makeNode(found, geo[0], geo[1], geo[2], geo[3], lines))
  }

  add('raw', [190, 24, 180, 52])
  add('modis', [30, 104, 180, 52])
  add('viirs', [350, 104, 180, 52])
  add('normalise', [190, 184, 180, 52])
  add('cell-days', [190, 264, 180, 52])
  add('model', [30, 344, 210, 52])
  add('grid', [320, 344, 210, 52])
  add('harmonised', [175, 424, 210, 52])
  add('artifacts', [175, 504, 210, 52])
  add('web-app', [175, 584, 210, 52])
  add('surfaces', [175, 664, 210, 52])

  nodes.push(literalNode('raw', 'raw CSVs', ['2012–2025 · same archive'], 175, 756, 210, 52))
  add('aoi-parquet', [175, 836, 210, 52])
  add('aoi-duckdb', [175, 916, 210, 52])
  add('aoi-selection', [175, 996, 210, 52])

  stages
    .filter((item) => item.lane === 'rejected')
    .forEach((rejected, index) => {
      const column = index % 2
      const row = Math.floor(index / 2)
      nodes.push(makeNode(rejected, 40 + column * 270, 1098 + row * 82, 210, 68, 3))
    })

  const edges: FlowEdge[] = [
    edge([[280, 76], [280, 88], [120, 88], [120, 104]], 'modis'),
    edge([[280, 76], [280, 88], [440, 88], [440, 104]], 'viirs'),
    edge([[120, 156], [120, 168], [255, 168], [255, 184]], 'modis'),
    edge([[440, 156], [440, 168], [305, 168], [305, 184]], 'viirs'),
    edge([[280, 236], [280, 264]], 'shared'),
    edge([[280, 316], [280, 330], [135, 330], [135, 344]], 'shared'),
    edge([[280, 316], [280, 330], [425, 330], [425, 344]], 'shared'),
    edge([[135, 396], [135, 410], [265, 410], [265, 424]], 'shared'),
    edge([[425, 396], [425, 410], [295, 410], [295, 424]], 'shared'),
    edge([[280, 476], [280, 504]], 'shared'),
    edge([[280, 556], [280, 584]], 'shared'),
    edge([[280, 636], [280, 664]], 'shared'),
    edge([[280, 808], [280, 836]], 'shared'),
    edge([[280, 888], [280, 916]], 'shared'),
    edge([[280, 968], [280, 996]], 'shared'),
  ]

  return {
    id: 'vertical',
    width: 560,
    height: 1344,
    nodes,
    edges,
    labels: [
      { x: 12, y: 12, text: 'BUILD TIME · PYTHON' },
      { x: 12, y: 744, text: 'AOI PAGE · CLIENT-SIDE PATH' },
      { x: 12, y: 1086, text: 'TRIED, NOT USED' },
    ],
  }
}
