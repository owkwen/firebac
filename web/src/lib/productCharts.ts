import type { EChartsCoreOption } from 'echarts/core'
import type { SeriesMode } from '@/types/calendar'
import { MONTH_LABELS } from './constants'
import type { ChartTheme } from './colors'
import { formatCompact, formatInteger } from './format'

const DATA_FONT = "ui-monospace, 'SFMono-Regular', Menlo, monospace"

export interface SeasonInput {
  year: number
  mode: SeriesMode
  values: (number | null)[]
  p25: (number | null)[]
  p75: (number | null)[]
}

function dayMeta(year: number, count: number): { dates: string[]; monthLabels: string[] } {
  const dates: string[] = []
  const monthLabels: string[] = []
  for (let index = 0; index < count; index += 1) {
    const date = new Date(Date.UTC(year, 0, index + 1))
    dates.push(date.toISOString().slice(0, 10))
    monthLabels.push(date.getUTCDate() === 1 ? MONTH_LABELS[date.getUTCMonth()] : '')
  }
  return { dates, monthLabels }
}

export function buildSeasonOption(input: SeasonInput, theme: ChartTheme): EChartsCoreOption {
  const count = input.values.length
  const { dates, monthLabels } = dayMeta(input.year, count)
  const monthStarts = dates.filter((_, index) => monthLabels[index] !== '' && index > 0)
  const band = input.p25.map((low, index) => {
    const high = input.p75[index]
    return low === null || high === null ? null : high - low
  })
  const modeColor = input.mode === 'modis' ? theme.modis : theme.accent

  return {
    backgroundColor: 'transparent',
    animation: false,
    textStyle: { color: theme.ink, fontFamily: DATA_FONT, fontSize: 11 },
    grid: { left: 52, right: 16, top: 14, bottom: 30, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' },
    tooltip: {
      trigger: 'axis',
      backgroundColor: theme.panel,
      borderColor: theme.grid,
      textStyle: { color: theme.ink, fontSize: 11 },
      confine: true,
      formatter: (params: { dataIndex: number }[]) => {
        const index = params[0]?.dataIndex ?? 0
        const low = input.p25[index]
        const high = input.p75[index]
        const value = input.values[index]
        const bandText =
          low === null || high === null
            ? 'baseline band: no record'
            : `baseline p25–p75: ${formatInteger(low)}–${formatInteger(high)}`
        return [
          dates[index],
          `${input.mode}: ${value === null ? 'no value' : formatInteger(value)} cell-days`,
          bandText,
        ].join('<br/>')
      },
    },
    xAxis: {
      type: 'category',
      data: dates,
      axisLine: { lineStyle: { color: theme.grid } },
      axisTick: { show: false },
      axisLabel: {
        color: theme.muted,
        fontSize: 10,
        interval: (index: number) => monthLabels[index] !== '',
        formatter: (_value: string, index: number) => monthLabels[index] ?? '',
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      name: 'cell-days / day',
      nameLocation: 'middle',
      nameGap: 40,
      nameTextStyle: { color: theme.muted, fontSize: 10 },
      min: 0,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: theme.muted, fontSize: 10, formatter: formatCompact },
      splitLine: { lineStyle: { color: theme.grid, type: 'dashed' } },
    },
    series: [
      {
        name: 'p25',
        type: 'line',
        stack: 'band',
        data: input.p25,
        showSymbol: false,
        silent: true,
        lineStyle: { opacity: 0 },
        itemStyle: { opacity: 0 },
      },
      {
        name: 'p25–p75',
        type: 'line',
        stack: 'band',
        data: band,
        showSymbol: false,
        silent: true,
        lineStyle: { color: theme.band, width: 1, type: 'dashed', opacity: 0.9 },
        areaStyle: { color: theme.band, opacity: 0.34 },
      },
      {
        name: input.mode,
        type: 'line',
        data: input.values,
        showSymbol: false,
        connectNulls: false,
        lineStyle: { color: modeColor, width: 1.6 },
        itemStyle: { color: modeColor },
        markLine: {
          symbol: 'none',
          silent: true,
          animation: false,
          label: { show: false },
          lineStyle: { color: theme.grid, width: 1, type: 'solid' },
          data: monthStarts.map((date) => ({ xAxis: date })),
        },
      },
    ],
  }
}
