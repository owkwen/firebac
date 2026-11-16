import type { AsyncDuckDB, AsyncDuckDBConnection, DuckDBBundles } from '@duckdb/duckdb-wasm'
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url'
import mvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url'
import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url'
import ehWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'
import type { DatasetInfo } from '@/types/dataset'
import type { CellValue, DataRow } from '@/types/detections'
import { fetchCsvBytes } from './data'

interface SourceView {
  bufferName: string
  viewName: string
}

const BUNDLES: DuckDBBundles = {
  mvp: { mainModule: mvpWasm, mainWorker: mvpWorker },
  eh: { mainModule: ehWasm, mainWorker: ehWorker },
}

let database: AsyncDuckDB | null = null
let connection: AsyncDuckDBConnection | null = null
let opening: Promise<void> | null = null
const sources = new Map<string, SourceView>()
let sourceCounter = 0
let activeSelection = ''

// DuckDB-WASM serialises statements per connection. Keeping one connection and a
// promise chain avoids "connection busy" races when panels refresh together.
let queryChain: Promise<unknown> = Promise.resolve()

function serialise<T>(task: () => Promise<T>): Promise<T> {
  const next = queryChain.then(task, task)
  queryChain = next.catch(() => undefined)
  return next
}

async function open(): Promise<void> {
  if (connection) return
  const duckdb = await import('@duckdb/duckdb-wasm')
  const bundle = await duckdb.selectBundle(BUNDLES)
  if (!bundle.mainWorker) throw new Error('DuckDB worker bundle unavailable')
  const worker = new Worker(bundle.mainWorker)
  database = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING), worker)
  await database.instantiate(bundle.mainModule, bundle.pthreadWorker)
  connection = await database.connect()
}

export async function initDuck(): Promise<void> {
  if (!opening) opening = open()
  await opening
}

function normalise(value: unknown): CellValue {
  if (value === null || value === undefined) return null
  if (typeof value === 'bigint') return Number(value)
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
    return value
  }
  return String(value)
}

export async function queryResult(sql: string): Promise<{ columns: string[]; rows: DataRow[] }> {
  await initDuck()
  return serialise(async () => {
    if (!connection) throw new Error('DuckDB connection is not ready')
    const table = await connection.query(sql)
    const columns = table.schema.fields.map((field: { name: string }) => field.name)
    const rows = table.toArray().map((row: unknown) => {
      const record = row as Record<string, unknown>
      const output: DataRow = {}
      for (const column of columns) output[column] = normalise(record[column])
      return output
    })
    return { columns, rows }
  })
}

export async function queryRows(sql: string): Promise<DataRow[]> {
  return (await queryResult(sql)).rows
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function sourceSelect(source: DatasetInfo, bufferName: string): string {
  const isModis = source.sensor === 'MODIS'
  const brightness = isModis
    ? `CAST(brightness AS DOUBLE) AS brightness,
       CAST(bright_t31 AS DOUBLE) AS bright_t31,
       CAST(NULL AS DOUBLE) AS bright_ti4,
       CAST(NULL AS DOUBLE) AS bright_ti5,
       CAST(brightness AS DOUBLE) AS bright4,
       CAST(bright_t31 AS DOUBLE) AS bright11`
    : `CAST(NULL AS DOUBLE) AS brightness,
       CAST(NULL AS DOUBLE) AS bright_t31,
       CAST(bright_ti4 AS DOUBLE) AS bright_ti4,
       CAST(bright_ti5 AS DOUBLE) AS bright_ti5,
       CAST(bright_ti4 AS DOUBLE) AS bright4,
       CAST(bright_ti5 AS DOUBLE) AS bright11`
  const confidence = isModis
    ? `CAST(confidence AS VARCHAR) AS confidence,
       TRY_CAST(confidence AS SMALLINT) AS conf_num,
       CAST(NULL AS VARCHAR) AS conf_level`
    : `LOWER(CAST(confidence AS VARCHAR)) AS confidence,
       CAST(NULL AS SMALLINT) AS conf_num,
       LOWER(CAST(confidence AS VARCHAR)) AS conf_level`

  return `SELECT
      ${quoteLiteral(source.sensor)} AS sensor,
      ${quoteLiteral(source.file)} AS dataset,
      CAST(latitude AS DOUBLE) AS lat,
      CAST(longitude AS DOUBLE) AS lon,
      acq_d AS acq_date,
      acq_time4 AS acq_time,
      acq_d + to_minutes(minutes) AS acq_ts,
      minutes,
      ${brightness},
      CAST(scan AS DOUBLE) AS scan,
      CAST(track AS DOUBLE) AS track,
      ${confidence},
      CAST(frp AS DOUBLE) AS frp,
      CAST(daynight AS VARCHAR) AS daynight,
      CAST(type AS SMALLINT) AS type,
      CAST(satellite AS VARCHAR) AS satellite,
      CAST(instrument AS VARCHAR) AS instrument,
      CAST(version AS VARCHAR) AS version
    FROM (
      SELECT *,
        CAST(acq_date AS DATE) AS acq_d,
        CAST(SUBSTR(acq_time4, 1, 2) AS INTEGER) * 60
          + CAST(SUBSTR(acq_time4, 3, 2) AS INTEGER) AS minutes
      FROM (
        SELECT *, LPAD(CAST(acq_time AS VARCHAR), 4, '0') AS acq_time4
        FROM read_csv_auto(${quoteLiteral(bufferName)}, header = true)
      )
    ) AS raw`
}

const EMPTY_SELECT = `SELECT
  CAST(NULL AS VARCHAR) AS sensor, CAST(NULL AS VARCHAR) AS dataset,
  CAST(NULL AS DOUBLE) AS lat, CAST(NULL AS DOUBLE) AS lon,
  CAST(NULL AS DATE) AS acq_date, CAST(NULL AS VARCHAR) AS acq_time,
  CAST(NULL AS TIMESTAMP) AS acq_ts, CAST(NULL AS INTEGER) AS minutes,
  CAST(NULL AS DOUBLE) AS brightness, CAST(NULL AS DOUBLE) AS bright_t31,
  CAST(NULL AS DOUBLE) AS bright_ti4, CAST(NULL AS DOUBLE) AS bright_ti5,
  CAST(NULL AS DOUBLE) AS bright4, CAST(NULL AS DOUBLE) AS bright11,
  CAST(NULL AS DOUBLE) AS scan, CAST(NULL AS DOUBLE) AS track,
  CAST(NULL AS VARCHAR) AS confidence, CAST(NULL AS SMALLINT) AS conf_num,
  CAST(NULL AS VARCHAR) AS conf_level, CAST(NULL AS DOUBLE) AS frp,
  CAST(NULL AS VARCHAR) AS daynight, CAST(NULL AS SMALLINT) AS type,
  CAST(NULL AS VARCHAR) AS satellite, CAST(NULL AS VARCHAR) AS instrument,
  CAST(NULL AS VARCHAR) AS version
WHERE FALSE`

export async function loadDetections(datasets: DatasetInfo[]): Promise<void> {
  await initDuck()
  const ordered = [...datasets].sort(
    (a, b) => a.sensor.localeCompare(b.sensor) || a.file.localeCompare(b.file),
  )
  const key = ordered.map((dataset) => dataset.file).join('|')
  if (key === activeSelection) return

  await serialise(async () => {
    if (!database || !connection) throw new Error('DuckDB connection is not ready')
    for (const dataset of ordered) {
      if (sources.has(dataset.file)) continue
      const bytes = await fetchCsvBytes(dataset.file)
      const bufferName = `dataset_${sourceCounter++}.csv`
      const viewName = `src_${sourceCounter}`
      await database.registerFileBuffer(bufferName, bytes)
      await connection.query(
        `CREATE OR REPLACE VIEW ${viewName} AS ${sourceSelect(dataset, bufferName)}`,
      )
      sources.set(dataset.file, { bufferName, viewName })
    }

    const views = ordered
      .map((dataset) => sources.get(dataset.file))
      .filter((source): source is SourceView => source !== undefined)
    const union =
      views.length > 0
        ? views.map((source) => `SELECT * FROM ${source.viewName}`).join(' UNION ALL ')
        : EMPTY_SELECT
    await connection.query(`CREATE OR REPLACE VIEW detections AS ${union}`)
    activeSelection = key
  })
}
