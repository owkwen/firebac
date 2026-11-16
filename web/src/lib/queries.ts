import type { Sensor } from '@/types/dataset'
import type { CellValue, DataRow, DetectionRow, SqlResult } from '@/types/detections'
import type { FilterState } from '@/types/filters'
import type {
  AreaBin,
  BrightnessSeries,
  ConfidenceData,
  ExploreData,
  FootprintPoint,
  FootprintSummary,
  HistogramBin,
  MapPoint,
  ScatterPoint,
  SensorBounds,
  SensorCount,
  SplitCount,
  TableData,
  ViirsCount,
} from '@/types/panels'
import {
  BRIGHTNESS_BIN_K,
  CO_LOCATION_DECIMALS,
  CO_LOCATION_WINDOW_MINUTES,
  FOOTPRINT_AREA_BIN_KM2,
  FOOTPRINT_AREA_CAP_KM2,
  FOOTPRINT_SAMPLE_CAP,
  MAP_SAMPLE_PER_SENSOR,
  MODIS_CONFIDENCE_STEP,
  SCATTER_SAMPLE_CAP,
  SQL_ROW_LIMIT,
  TABLE_ROW_LIMIT,
  VIIRS_SATURATION_K,
} from './constants'
import { queryResult, queryRows } from './duck'
import { viirsAllowedLevels } from './filters'
import { prepareReadOnlyQuery } from './sql'

interface WhereOptions {
  sensor?: Sensor
  includeConfidence?: boolean
}

function q(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function sensorClause(filters: FilterState, only?: Sensor): string {
  if (only) return filters.sensors.includes(only) ? `sensor = ${q(only)}` : 'FALSE'
  if (filters.sensors.length === 0) return 'FALSE'
  return `sensor IN (${filters.sensors.map(q).join(', ')})`
}

function confidenceClause(filters: FilterState, only?: Sensor): string {
  const parts: string[] = []
  const levels = viirsAllowedLevels(filters.viirsMin).map(q).join(', ')
  if ((!only || only === 'MODIS') && filters.sensors.includes('MODIS')) {
    parts.push(`(sensor = 'MODIS' AND conf_num >= ${filters.modisMin})`)
  }
  if ((!only || only === 'VIIRS') && filters.sensors.includes('VIIRS')) {
    parts.push(`(sensor = 'VIIRS' AND conf_level IN (${levels}))`)
  }
  return parts.length > 0 ? `(${parts.join(' OR ')})` : 'FALSE'
}

function detectionWhere(filters: FilterState, options: WhereOptions = {}): string {
  const clauses = [sensorClause(filters, options.sensor)]
  clauses.push(`acq_date BETWEEN DATE ${q(filters.dateFrom)} AND DATE ${q(filters.dateTo)}`)
  clauses.push(
    filters.types.length > 0
      ? `type IN (${filters.types.map((type) => Number(type)).join(', ')})`
      : 'FALSE',
  )
  if (options.includeConfidence !== false) {
    clauses.push(confidenceClause(filters, options.sensor))
  }
  return clauses.join(' AND ')
}

function asNumber(value: CellValue | undefined): number {
  if (value === null || value === undefined) return 0
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function asNullableNumber(value: CellValue | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function asText(value: CellValue | undefined): string {
  return value === null || value === undefined ? '' : String(value)
}

function asSensor(value: CellValue | undefined): Sensor | null {
  return value === 'MODIS' || value === 'VIIRS' ? value : null
}

function toDetectionRow(row: DataRow): DetectionRow {
  return {
    ...row,
    sensor: asText(row.sensor),
    acq_date: asText(row.acq_date),
    acq_time: asText(row.acq_time),
    lat: asNumber(row.lat),
    lon: asNumber(row.lon),
    brightness_k: asNullableNumber(row.brightness_k),
    confidence: asText(row.confidence),
    frp: asNullableNumber(row.frp),
    type: asNumber(row.type),
  }
}

function countsQuery(where: string): string {
  return `SELECT sensor, COUNT(*) AS n,
      CAST(MIN(acq_date) AS VARCHAR) AS first_day,
      CAST(MAX(acq_date) AS VARCHAR) AS last_day
    FROM detections WHERE ${where}
    GROUP BY sensor ORDER BY sensor`
}

function dailyQuery(where: string): string {
  return `SELECT sensor, CAST(acq_date AS VARCHAR) AS day, COUNT(*) AS n
    FROM detections WHERE ${where}
    GROUP BY 1, 2 ORDER BY 2, 1`
}

export async function runExploreQueries(filters: FilterState): Promise<ExploreData> {
  const where = detectionWhere(filters)
  const unrestricted = detectionWhere(filters, { includeConfidence: false })
  const bothSensors = filters.sensors.includes('MODIS') && filters.sensors.includes('VIIRS')
  const modisWhere = detectionWhere(filters, { sensor: 'MODIS' })
  const viirsWhere = detectionWhere(filters, { sensor: 'VIIRS' })

  const countsRows = queryRows(countsQuery(where))
  const dailyRows = queryRows(dailyQuery(where))
  const brightnessRows = queryRows(`SELECT sensor, band, bin, COUNT(*) AS n FROM (
      SELECT sensor, '4um' AS band, FLOOR(bright4 / ${BRIGHTNESS_BIN_K}) * ${BRIGHTNESS_BIN_K} AS bin
      FROM detections WHERE ${where} AND bright4 IS NOT NULL
      UNION ALL
      SELECT sensor, '11um' AS band, FLOOR(bright11 / ${BRIGHTNESS_BIN_K}) * ${BRIGHTNESS_BIN_K} AS bin
      FROM detections WHERE ${where} AND bright11 IS NOT NULL
    ) GROUP BY 1, 2, 3 ORDER BY 2, 1, 3`)
  const modisConfRows = queryRows(`SELECT FLOOR(conf_num / ${MODIS_CONFIDENCE_STEP}) * ${MODIS_CONFIDENCE_STEP} AS bin,
      COUNT(*) AS n
    FROM detections WHERE ${unrestricted} AND sensor = 'MODIS' AND conf_num IS NOT NULL
    GROUP BY 1 ORDER BY 1`)
  const viirsConfRows = queryRows(`SELECT conf_level, COUNT(*) AS n
    FROM detections WHERE ${unrestricted} AND sensor = 'VIIRS' AND conf_level IN ('l', 'n', 'h')
    GROUP BY 1 ORDER BY 1`)
  const splitRows = queryRows(`SELECT sensor, COUNT(*) AS total,
      SUM(CASE WHEN
        (sensor = 'MODIS' AND conf_num >= ${filters.modisMin})
        OR (sensor = 'VIIRS' AND conf_level IN (${viirsAllowedLevels(filters.viirsMin).map(q).join(', ')}))
        THEN 1 ELSE 0 END) AS passed
    FROM detections WHERE ${unrestricted} GROUP BY sensor ORDER BY sensor`)
  const scatterRows = bothSensors
    ? queryRows(`WITH modis AS (
        SELECT ROUND(lat, ${CO_LOCATION_DECIMALS}) AS cell_lat,
               ROUND(lon, ${CO_LOCATION_DECIMALS}) AS cell_lon,
               acq_date, epoch(acq_ts) AS ts, acq_time,
               brightness AS modis_brightness, lat, lon
        FROM detections WHERE ${modisWhere} AND brightness IS NOT NULL
      ), viirs AS (
        SELECT ROUND(lat, ${CO_LOCATION_DECIMALS}) AS cell_lat,
               ROUND(lon, ${CO_LOCATION_DECIMALS}) AS cell_lon,
               acq_date, epoch(acq_ts) AS ts, acq_time,
               bright_ti4, lat, lon
        FROM detections WHERE ${viirsWhere} AND bright_ti4 IS NOT NULL
      )
      SELECT m.modis_brightness AS modis, v.bright_ti4 AS viirs, m.lat, m.lon,
             COUNT(*) OVER () AS total_pairs
      FROM modis m JOIN viirs v USING (cell_lat, cell_lon, acq_date)
      WHERE ABS(m.ts - v.ts) <= ${CO_LOCATION_WINDOW_MINUTES * 60}
      ORDER BY m.acq_date, m.acq_time
      LIMIT ${SCATTER_SAMPLE_CAP}`)
    : Promise.resolve<DataRow[]>([])
  const footprintRows = queryRows(`SELECT sensor, scan, track FROM detections
    WHERE ${where} AND scan IS NOT NULL AND track IS NOT NULL AND scan > 0 AND track > 0
    ORDER BY hash(lat, lon, acq_ts) LIMIT ${FOOTPRINT_SAMPLE_CAP}`)
  const areaRows = queryRows(`SELECT sensor,
      ROUND(FLOOR(LEAST(scan * track, ${FOOTPRINT_AREA_CAP_KM2 - 0.001}) / ${FOOTPRINT_AREA_BIN_KM2})
        * ${FOOTPRINT_AREA_BIN_KM2}, 1) AS bin,
      COUNT(*) AS n
    FROM detections WHERE ${where} AND scan IS NOT NULL AND track IS NOT NULL
    GROUP BY 1, 2 ORDER BY 1, 2`)
  const footprintSummaryRows = queryRows(`SELECT sensor, COUNT(*) AS n,
      MEDIAN(scan) AS median_scan, MEDIAN(track) AS median_track,
      MEDIAN(scan * track) AS median_area
    FROM detections WHERE ${where} AND scan IS NOT NULL AND track IS NOT NULL
    GROUP BY sensor ORDER BY sensor`)
  const mapRows = queryRows(
    filters.sensors
      .map(
        (sensor) => `(SELECT sensor, lat, lon FROM detections
          WHERE ${detectionWhere(filters, { sensor })} AND lat IS NOT NULL AND lon IS NOT NULL
          ORDER BY hash(lat, lon, acq_ts) LIMIT ${MAP_SAMPLE_PER_SENSOR})`,
      )
      .join(' UNION ALL ') || `SELECT sensor, lat, lon FROM detections WHERE FALSE`,
  )
  const boundsRows = queryRows(`SELECT sensor, COUNT(*) AS n,
      MIN(lat) AS min_lat, MAX(lat) AS max_lat,
      MIN(lon) AS min_lon, MAX(lon) AS max_lon
    FROM detections WHERE ${where} AND lat IS NOT NULL AND lon IS NOT NULL
    GROUP BY sensor ORDER BY sensor`)
  const tableRows = queryRows(`SELECT sensor, CAST(acq_date AS VARCHAR) AS acq_date, acq_time,
      lat, lon, ROUND(bright4, 1) AS brightness_k, confidence, frp,
      ROUND(scan, 2) AS scan_km, ROUND(track, 2) AS track_km, type,
      COUNT(*) OVER () AS total_rows
    FROM detections WHERE ${where}
    ORDER BY acq_date DESC, acq_time DESC
    LIMIT ${TABLE_ROW_LIMIT}`)

  const [
    countData,
    dailyData,
    brightnessData,
    modisConfData,
    viirsConfData,
    splitData,
    scatterData,
    footprintData,
    areaData,
    footprintSummaryData,
    mapData,
    boundsData,
    tableData,
  ] = await Promise.all([
    countsRows,
    dailyRows,
    brightnessRows,
    modisConfRows,
    viirsConfRows,
    splitRows,
    scatterRows,
    footprintRows,
    areaRows,
    footprintSummaryRows,
    mapRows,
    boundsRows,
    tableRows,
  ])

  const bySensor: SensorCount[] = countData
    .map((row) => {
      const sensor = asSensor(row.sensor)
      return sensor
        ? {
            sensor,
            count: asNumber(row.n),
            firstDay: asText(row.first_day) || null,
            lastDay: asText(row.last_day) || null,
          }
        : null
    })
    .filter((row): row is SensorCount => row !== null)
  const daily = dailyData
    .map((row) => {
      const sensor = asSensor(row.sensor)
      return sensor ? { sensor, day: asText(row.day), count: asNumber(row.n) } : null
    })
    .filter((row): row is { sensor: Sensor; day: string; count: number } => row !== null)

  const fourMicron: BrightnessSeries[] = []
  const elevenMicron: BrightnessSeries[] = []
  for (const row of brightnessData) {
    const sensor = asSensor(row.sensor)
    if (!sensor) continue
    const series = asText(row.band) === '4um' ? fourMicron : elevenMicron
    let entry = series.find((item) => item.sensor === sensor)
    if (!entry) {
      entry = { sensor, points: [] }
      series.push(entry)
    }
    entry.points.push({ bin: asNumber(row.bin), count: asNumber(row.n) })
  }

  const confidence: ConfidenceData = {
    modisBins: modisConfData.map<HistogramBin>((row) => ({
      bin: asNumber(row.bin),
      count: asNumber(row.n),
    })),
    viirs: viirsConfData
      .map<ViirsCount | null>((row) => {
        const level = asText(row.conf_level)
        return level === 'l' || level === 'n' || level === 'h'
          ? { level, count: asNumber(row.n) }
          : null
      })
      .filter((row): row is ViirsCount => row !== null),
    split: splitData
      .map<SplitCount | null>((row) => {
        const sensor = asSensor(row.sensor)
        return sensor ? { sensor, passed: asNumber(row.passed), total: asNumber(row.total) } : null
      })
      .filter((row): row is SplitCount => row !== null),
    modisMin: filters.modisMin,
    viirsMin: filters.viirsMin,
  }

  const scatterPoints: ScatterPoint[] = scatterData.map((row) => ({
    modis: asNumber(row.modis),
    viirs: asNumber(row.viirs),
    lat: asNumber(row.lat),
    lon: asNumber(row.lon),
  }))
  const totalPairs = scatterData.length > 0 ? asNumber(scatterData[0].total_pairs) : 0

  const areaBins: AreaBin[] = areaData
    .map<AreaBin | null>((row) => {
      const sensor = asSensor(row.sensor)
      return sensor ? { sensor, bin: asNumber(row.bin), count: asNumber(row.n) } : null
    })
    .filter((row): row is AreaBin => row !== null)
  const summaries: FootprintSummary[] = footprintSummaryData
    .map<FootprintSummary | null>((row) => {
      const sensor = asSensor(row.sensor)
      return sensor
        ? {
            sensor,
            count: asNumber(row.n),
            medianScan: asNumber(row.median_scan),
            medianTrack: asNumber(row.median_track),
            medianArea: asNumber(row.median_area),
          }
        : null
    })
    .filter((row): row is FootprintSummary => row !== null)
  const footprintPoints: FootprintPoint[] = footprintData
    .map<FootprintPoint | null>((row) => {
      const sensor = asSensor(row.sensor)
      return sensor
        ? { sensor, scan: asNumber(row.scan), track: asNumber(row.track) }
        : null
    })
    .filter((row): row is FootprintPoint => row !== null)

  const mapPoints: MapPoint[] = mapData
    .map<MapPoint | null>((row) => {
      const sensor = asSensor(row.sensor)
      return sensor ? { sensor, lat: asNumber(row.lat), lon: asNumber(row.lon) } : null
    })
    .filter((row): row is MapPoint => row !== null)
  const bounds: SensorBounds[] = boundsData
    .map<SensorBounds | null>((row) => {
      const sensor = asSensor(row.sensor)
      return sensor
        ? {
            sensor,
            count: asNumber(row.n),
            minLat: asNumber(row.min_lat),
            maxLat: asNumber(row.max_lat),
            minLon: asNumber(row.min_lon),
            maxLon: asNumber(row.max_lon),
          }
        : null
    })
    .filter((row): row is SensorBounds => row !== null)

  const table: TableData = {
    rows: tableData.map(toDetectionRow),
    total: tableData.length > 0 ? asNumber(tableData[0].total_rows) : 0,
  }

  return {
    counts: { bySensor, daily, total: bySensor.reduce((sum, row) => sum + row.count, 0) },
    brightness: {
      fourMicron,
      elevenMicron,
      ceilingK: VIIRS_SATURATION_K,
    },
    scatter: {
      points: scatterPoints,
      totalPairs,
      cap: SCATTER_SAMPLE_CAP,
      windowMinutes: CO_LOCATION_WINDOW_MINUTES,
      ceilingK: VIIRS_SATURATION_K,
    },
    confidence,
    footprints: {
      points: footprintPoints,
      areaBins,
      summaries,
      areaCapKm2: FOOTPRINT_AREA_CAP_KM2,
    },
    map: {
      points: mapPoints,
      bounds,
      total: bounds.reduce((sum, row) => sum + row.count, 0),
      sampled: mapPoints.length,
    },
    table,
  }
}

export async function executeSql(sql: string): Promise<SqlResult> {
  const query = prepareReadOnlyQuery(sql)
  const started = performance.now()
  const countRows = await queryRows(`SELECT COUNT(*) AS n FROM (${query}) AS user_query`)
  const result = await queryResult(`SELECT * FROM (${query}) AS user_query LIMIT ${SQL_ROW_LIMIT}`)
  const totalRows = asNumber(countRows[0]?.n)
  return {
    columns: result.columns,
    rows: result.rows,
    elapsedMs: Math.round(performance.now() - started),
    totalRows,
    truncated: totalRows > result.rows.length,
    query,
  }
}

export async function fetchFilteredRows(
  filters: FilterState,
): Promise<{ columns: string[]; rows: DataRow[] }> {
  return queryResult(`SELECT sensor, CAST(acq_date AS VARCHAR) AS acq_date, acq_time,
      lat, lon, ROUND(bright4, 1) AS brightness_k, confidence, frp,
      ROUND(scan, 2) AS scan_km, ROUND(track, 2) AS track_km, type
    FROM detections WHERE ${detectionWhere(filters)}
    ORDER BY acq_date, acq_time`)
}


