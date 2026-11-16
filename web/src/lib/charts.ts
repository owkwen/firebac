import type { EChartsCoreOption } from 'echarts/core'
import type { Sensor } from '@/types/dataset'
import type {
  AreaBin,
  BrightnessSeries,
  DailyCount,
  FootprintPoint,
  MapData,
  SensorBounds,
  ScatterData,
  ViirsCount,
} from '@/types/panels'
import type { ChartTheme } from './colors'
import { prefersReducedMotion, sensorColor } from './colors'
import { formatCompact, formatInteger } from './format'

const DATA_FONT = "ui-monospace, 'SFMono-Regular', Menlo, monospace"
const LABEL_BOUNDS = { outerBoundsMode: 'same' as const, outerBoundsContain: 'axisLabel' as const }

function tooltipBase(theme: ChartTheme) {
  return {
    trigger: 'item' as const,
    backgroundColor: theme.panel,
    borderColor: theme.grid,
    textStyle: { color: theme.ink, fontSize: 11 },
    confine: true,
  }
}

function base(theme: ChartTheme, grid: Record<string, number> = {}): EChartsCoreOption {
  return {
    backgroundColor: 'transparent',
    animation: !prefersReducedMotion(),
    textStyle: { color: theme.ink, fontFamily: DATA_FONT, fontSize: 11 },
    grid: { left: 46, right: 14, top: 28, bottom: 34, ...LABEL_BOUNDS, ...grid },
    tooltip: tooltipBase(theme),
    legend: {
      top: 0,
      left: 0,
      textStyle: { color: theme.muted, fontSize: 11 },
      itemWidth: 10,
      itemHeight: 8,
      icon: 'roundRect',
    },
  }
}

function valueAxis(theme: ChartTheme, name: string, extra: Record<string, unknown> = {}) {
  return {
    type: 'value' as const,
    name,
    nameLocation: 'middle' as const,
    nameGap: 26,
    nameTextStyle: { color: theme.muted, fontSize: 10 },
    axisLine: { lineStyle: { color: theme.grid } },
    axisTick: { show: false },
    axisLabel: { color: theme.muted, fontSize: 10, formatter: formatCompact },
    splitLine: { lineStyle: { color: theme.grid, type: 'dashed' as const } },
    ...extra,
  }
}

function categoryAxis(theme: ChartTheme, name: string, data: string[], extra: Record<string, unknown> = {}) {
  return {
    type: 'category' as const,
    name,
    data,
    nameLocation: 'middle' as const,
    nameGap: 26,
    nameTextStyle: { color: theme.muted, fontSize: 10 },
    axisLine: { lineStyle: { color: theme.grid } },
    axisTick: { show: false },
    axisLabel: { color: theme.muted, fontSize: 10, hideOverlap: true },
    ...extra,
  }
}

function sensorSeries(sensor: Sensor, theme: ChartTheme) {
  const color = sensorColor(sensor, theme)
  return {
    name: sensor,
    color,
    itemStyle: { color },
    lineStyle: { color, width: 1.6, type: sensor === 'VIIRS' ? ('dashed' as const) : ('solid' as const) },
  }
}

function binsOf(series: BrightnessSeries[]): number[] {
  const bins = new Set<number>()
  for (const entry of series) for (const point of entry.points) bins.add(point.bin)
  return [...bins].sort((a, b) => a - b)
}

function binMap(series: BrightnessSeries): Map<number, number> {
  return new Map(series.points.map((point) => [point.bin, point.count]))
}

export function buildDailyOption(daily: DailyCount[], theme: ChartTheme): EChartsCoreOption {
  const days = [...new Set(daily.map((row) => row.day))].sort()
  const sensors = [...new Set(daily.map((row) => row.sensor))]
  const totals = new Map(daily.map((row) => [`${row.sensor}|${row.day}`, row.count]))
  return {
    ...base(theme),
    tooltip: { ...tooltipBase(theme), trigger: 'axis' },
    xAxis: categoryAxis(theme, 'acquisition date (UTC)', days, {
      axisLabel: { color: theme.muted, fontSize: 10, formatter: (value: string) => value.slice(5) },
    }),
    yAxis: valueAxis(theme, 'detections / day', {
      axisLabel: { color: theme.muted, fontSize: 10, formatter: formatCompact },
    }),
    series: sensors.map((sensor) => ({
      ...sensorSeries(sensor, theme),
      type: 'line' as const,
      showSymbol: false,
      connectNulls: true,
      data: days.map((day) => totals.get(`${sensor}|${day}`) ?? null),
    })),
  }
}

export function buildBrightnessOption(
  series: BrightnessSeries[],
  band: '4um' | '11um',
  ceilingK: number,
  theme: ChartTheme,
): EChartsCoreOption {
  const bins = binsOf(series)
  const minBin = bins.length > 0 ? bins[0] : 0
  const maxBin = bins.length > 0 ? bins[bins.length - 1] : 1
  const maxCount = Math.max(1, ...series.flatMap((entry) => entry.points.map((point) => point.count)))
  const markLine =
    band === '4um'
      ? {
          markLine: {
            symbol: 'none',
            silent: true,
            lineStyle: { color: theme.ceiling, type: 'dashed' as const, width: 1 },
            label: {
              formatter: `${ceilingK} K ceiling`,
              color: theme.ceiling,
              fontSize: 10,
              position: 'insideEndTop' as const,
            },
            data: [{ xAxis: ceilingK }],
          },
        }
      : {}
  return {
    ...base(theme),
    tooltip: { ...tooltipBase(theme), trigger: 'axis' },
    xAxis: valueAxis(theme, 'brightness temperature (K)', {
      min: Math.floor(minBin / 10) * 10,
      max: Math.ceil(Math.max(maxBin, band === '4um' ? ceilingK : maxBin) / 10) * 10,
      axisLabel: { color: theme.muted, fontSize: 10, formatter: (value: number) => formatInteger(value) },
    }),
    yAxis: valueAxis(theme, 'detections', { min: 0, max: Math.ceil(maxCount * 1.1) }),
    series: series.map((entry, index) => {
      const counts = binMap(entry)
      return {
        ...sensorSeries(entry.sensor, theme),
        type: 'bar' as const,
        barGap: '-100%',
        barWidth: 3,
        opacity: 0.72,
        data: bins.map((bin) => [bin, counts.get(bin) ?? 0]),
        ...(index === 0 ? markLine : {}),
      }
    }),
  }
}

export function buildScatterOption(data: ScatterData, theme: ChartTheme): EChartsCoreOption {
  return {
    ...base(theme),
    legend: { show: false },
    grid: { left: 52, right: 18, top: 14, bottom: 42, ...LABEL_BOUNDS },
    xAxis: valueAxis(theme, 'MODIS 4 µm (K)', { min: 260, max: 400 }),
    yAxis: valueAxis(theme, 'VIIRS I4 (K)', { min: 260, max: Math.max(380, data.ceilingK + 10) }),
    series: [
      {
        name: 'co-located pairs',
        type: 'scatter',
        symbolSize: 3,
        large: true,
        largeThreshold: 2000,
        itemStyle: { color: theme.accent, opacity: 0.4 },
        data: data.points.map((point) => [point.modis, point.viirs]),
        markLine: {
          symbol: 'none',
          silent: true,
          lineStyle: { color: theme.ceiling, type: 'dashed' as const, width: 1 },
          label: {
            formatter: `${data.ceilingK} K ceiling`,
            color: theme.ceiling,
            fontSize: 10,
            position: 'insideEndTop' as const,
          },
          data: [{ yAxis: data.ceilingK }],
        },
      },
    ],
  }
}

export function buildModisConfidenceOption(
  bins: { bin: number; count: number }[],
  threshold: number,
  theme: ChartTheme,
): EChartsCoreOption {
  const maxCount = Math.max(1, ...bins.map((bin) => bin.count))
  const labels = bins.map((bin) => String(bin.bin))
  return {
    ...base(theme),
    legend: { show: false },
    grid: { left: 46, right: 12, top: 12, bottom: 34, ...LABEL_BOUNDS },
    xAxis: categoryAxis(theme, 'MODIS confidence (%)', labels, {
      axisLabel: { color: theme.muted, fontSize: 10, interval: 3 },
    }),
    yAxis: valueAxis(theme, 'detections', { min: 0, max: Math.ceil(maxCount * 1.1) }),
    series: [
      {
        name: 'MODIS',
        type: 'bar',
        barWidth: '70%',
        itemStyle: { color: theme.modis, opacity: 0.8 },
        data: bins.map((bin) => bin.count),
        markLine: {
          symbol: 'none',
          silent: true,
          lineStyle: { color: theme.accent, type: 'dashed' as const, width: 1 },
          label: { formatter: `split ${threshold}`, color: theme.accent, fontSize: 10 },
          data: labels.includes(String(threshold)) ? [{ xAxis: String(threshold) }] : [],
        },
      },
    ],
  }
}

export function buildViirsConfidenceOption(counts: ViirsCount[], theme: ChartTheme): EChartsCoreOption {
  const labels = ['low (l)', 'nominal (n)', 'high (h)']
  const lookup = new Map(counts.map((row) => [row.level, row.count]))
  return {
    ...base(theme),
    legend: { show: false },
    grid: { left: 46, right: 12, top: 12, bottom: 34, ...LABEL_BOUNDS },
    xAxis: categoryAxis(theme, 'VIIRS confidence', labels),
    yAxis: valueAxis(theme, 'detections', {
      min: 0,
      max: Math.ceil(Math.max(1, ...counts.map((row) => row.count)) * 1.1),
    }),
    series: [
      {
        name: 'VIIRS',
        type: 'bar',
        barWidth: 28,
        itemStyle: { color: theme.viirs, opacity: 0.8 },
        data: ['l', 'n', 'h'].map((level) => lookup.get(level as 'l' | 'n' | 'h') ?? 0),
      },
    ],
  }
}

export function buildFootprintOption(points: FootprintPoint[], theme: ChartTheme): EChartsCoreOption {
  const sensors = [...new Set(points.map((point) => point.sensor))]
  const maxScan = points.reduce((max, point) => Math.max(max, point.scan), 0)
  const maxTrack = points.reduce((max, point) => Math.max(max, point.track), 0)
  const scanMax = Math.max(0.5, Math.ceil(maxScan / 0.5) * 0.5)
  const trackMax = Math.max(0.5, Math.ceil(maxTrack / 0.5) * 0.5)
  return {
    ...base(theme),
    grid: { left: 50, right: 14, top: 26, bottom: 38, ...LABEL_BOUNDS },
    xAxis: valueAxis(theme, 'scan (km)', { min: 0, max: scanMax }),
    yAxis: valueAxis(theme, 'track (km)', { min: 0, max: trackMax }),
    series: sensors.map((sensor) => ({
      ...sensorSeries(sensor, theme),
      type: 'scatter' as const,
      symbolSize: 2.5,
      large: true,
      largeThreshold: 1500,
      itemStyle: { color: sensorColor(sensor, theme), opacity: 0.45 },
      data: points.filter((point) => point.sensor === sensor).map((point) => [point.scan, point.track]),
    })),
  }
}

export function buildAreaOption(
  bins: AreaBin[],
  capKm2: number,
  theme: ChartTheme,
): EChartsCoreOption {
  const sensors = [...new Set(bins.map((row) => row.sensor))]
  const labels = [...new Set(bins.map((row) => row.bin))].sort((a, b) => a - b)
  const lookup = new Map(bins.map((row) => [`${row.sensor}|${row.bin}`, row.count]))
  return {
    ...base(theme),
    tooltip: { ...tooltipBase(theme), trigger: 'axis' },
    grid: { left: 46, right: 12, top: 26, bottom: 38, ...LABEL_BOUNDS },
    xAxis: categoryAxis(
      theme,
      `footprint area (km², ≥${capKm2.toFixed(1)} capped)`,
      labels.map((bin) => (bin >= capKm2 - 0.1 ? '≥6' : bin.toFixed(1))),
    ),
    yAxis: valueAxis(theme, 'detections'),
    series: sensors.map((sensor) => ({
      ...sensorSeries(sensor, theme),
      type: 'bar' as const,
      barGap: '-100%',
      barWidth: '70%',
      opacity: 0.72,
      data: labels.map((bin) => lookup.get(`${sensor}|${bin}`) ?? 0),
    })),
  }
}

export function mapExtent(bounds: SensorBounds[]): {
  minLon: number
  maxLon: number
  minLat: number
  maxLat: number
} | null {
  if (bounds.length === 0) return null
  return {
    minLon: Math.min(...bounds.map((row) => row.minLon)),
    maxLon: Math.max(...bounds.map((row) => row.maxLon)),
    minLat: Math.min(...bounds.map((row) => row.minLat)),
    maxLat: Math.max(...bounds.map((row) => row.maxLat)),
  }
}

export function buildMapOption(data: MapData, theme: ChartTheme): EChartsCoreOption {
  const extent = mapExtent(data.bounds)
  const padLon = extent ? Math.max(0.2, (extent.maxLon - extent.minLon) * 0.02) : 1
  const padLat = extent ? Math.max(0.2, (extent.maxLat - extent.minLat) * 0.02) : 1
  const sensors = [...new Set(data.points.map((point) => point.sensor))]
  return {
    ...base(theme),
    animation: false,
    grid: { left: 52, right: 14, top: 10, bottom: 38, ...LABEL_BOUNDS },
    xAxis: valueAxis(theme, 'longitude (°)', {
      min: extent ? extent.minLon - padLon : undefined,
      max: extent ? extent.maxLon + padLon : undefined,
      splitNumber: 3,
      axisLabel: {
        color: theme.muted,
        fontSize: 9,
        hideOverlap: true,
        formatter: (value: number) => value.toFixed(1),
      },
      splitLine: { lineStyle: { color: theme.grid, type: 'dashed' as const } },
    }),
    yAxis: valueAxis(theme, 'latitude (°)', {
      min: extent ? extent.minLat - padLat : undefined,
      max: extent ? extent.maxLat + padLat : undefined,
      axisLabel: { color: theme.muted, fontSize: 9, formatter: (value: number) => value.toFixed(1) },
    }),
    series: sensors.map((sensor) => ({
      name: sensor,
      type: 'scatter' as const,
      symbolSize: 1.6,
      large: true,
      largeThreshold: 1500,
      itemStyle: { color: sensorColor(sensor, theme), opacity: 0.42 },
      data: data.points
        .filter((point) => point.sensor === sensor)
        .map((point) => [point.lon, point.lat]),
    })),
  }
}
