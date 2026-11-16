<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { SeriesMode, SeriesRow, SystemMark } from '@/types/calendar'
import { chartTheme } from '@/lib/colors'
import type { ChartTheme } from '@/lib/colors'
import {
  SERIES_LABELS,
  SYSTEM_MARK_INSET_PX,
  SYSTEM_MARK_SIZE_PX,
} from '@/lib/constants'
import {
  DAILY_CELL_HEIGHT,
  DAILY_COLUMNS,
  DAILY_PAD_LEFT,
  DAILY_PAD_RIGHT,
  DAILY_PAD_TOP,
  DAILY_ROW_HEIGHT,
  dailyCellWidth,
  dailyHeight,
  dailyScale,
  dateAtColumn,
  dayDescription,
  drawDailyHeatmap,
  firstColumnOfMonth,
  isoDay,
  resolveColumn,
  stepColumn,
} from '@/lib/dailyHeatmap'
import type { DailyCellPosition, DayDescription } from '@/lib/dailyHeatmap'
import HeatmapLegend from './HeatmapLegend.vue'

const props = defineProps<{
  rows: readonly SeriesRow[]
  series: SeriesMode
  harmonizedFrom: number
  systemMarks: readonly SystemMark[]
  selected: { year: number; month: number }
}>()

const emit = defineEmits<{ select: [year: number, month: number]; 'update:series': [series: SeriesMode] }>()

interface Hover {
  left: number
  top: number
  year: number
  column: number
}

function initialCursor(): DailyCellPosition {
  const row = props.rows.find((candidate) => candidate.year === props.selected.year) ?? props.rows[0]
  if (!row) return { year: props.selected.year, column: 0 }
  return { year: row.year, column: firstColumnOfMonth(props.selected.month) }
}

const frame = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const focused = ref(false)
const frameWidth = ref(0)
const cursor = ref<DailyCellPosition>(initialCursor())
const hover = ref<Hover | null>(null)
let observer: ResizeObserver | null = null

const height = computed(() => dailyHeight(props.rows.length))
const scale = computed(() => dailyScale(props.rows, props.series, props.harmonizedFrom))
/** Rows this sensor cannot cover: the same hatch the canvas paints for harmonized. */
const hatchRows = computed(() =>
  props.series !== 'viirs'
    ? []
    : props.rows
        .map((row, index) => ({ year: row.year, top: DAILY_PAD_TOP + index * DAILY_ROW_HEIGHT }))
        .filter((row) => row.year < props.harmonizedFrom),
)
/**
 * Both and VIIRS have no complete series before `harmonizedFrom`, so those rows
 * carry one note band. It spans the same years and the same cell area as the
 * monthly band, leaving the year labels in the canvas gutter untouched.
 */
const earlyBand = computed(() => {
  if (props.series === 'modis') return null
  const early = props.rows
    .map((row, index) => ({ year: row.year, index }))
    .filter((row) => row.year < props.harmonizedFrom)
  const first = early[0]
  const last = early[early.length - 1]
  if (!first || !last) return null
  const harmonized = props.series === 'harmonized'
  return {
    top: DAILY_PAD_TOP + first.index * DAILY_ROW_HEIGHT,
    height: (last.index - first.index) * DAILY_ROW_HEIGHT + DAILY_CELL_HEIGHT,
    note: harmonized
      ? `MODIS only before ${props.harmonizedFrom}`
      : `VIIRS starts in ${props.harmonizedFrom}`,
    switchable: harmonized,
  }
})
/**
 * The corner badges explain platform availability, so MODIS mode shows all
 * three. Both and VIIRS begin with the completed series, so their MODIS-era
 * badges would only annotate hatched rows: keep the VIIRS badge, which marks
 * where those series start.
 */
const visibleMarks = computed(() =>
  props.series === 'modis'
    ? props.systemMarks
    : props.systemMarks.filter((mark) => mark.sensor === 'VIIRS'),
)
const marksByKey = computed(
  () => new Map(visibleMarks.value.map((mark) => [mark.key, mark])),
)

/** Only the first day of a system's first month carries the corner badge. */
function markAt(year: number, column: number): SystemMark | null {
  const day = dateAtColumn(year, column)
  if (!day || day.day !== 1) return null
  return marksByKey.value.get(`${year}-${day.month}`) ?? null
}

function describe(year: number, column: number): DayDescription | null {
  if (props.series !== 'modis' && year < props.harmonizedFrom) {
    const calendarDay = dateAtColumn(year, column)
    if (!calendarDay) return null
    const date = isoDay(year, calendarDay.dayIndex)
    return {
      date,
      month: calendarDay.month,
      value: null,
      count: 'no second sensor',
      summary: `${date}: no second sensor, VIIRS starts ${props.harmonizedFrom}`,
    }
  }
  return dayDescription(props.rows, year, column, props.series, props.harmonizedFrom)
}

const focusSummary = computed(() => {
  const description = describe(cursor.value.year, cursor.value.column)
  const mark = markAt(cursor.value.year, cursor.value.column)
  const summary = description?.summary ?? 'No daily cell'
  return mark ? `${summary} · ${mark.label}` : summary
})
const hoverInfo = computed(() => {
  const current = hover.value
  return current ? describe(current.year, current.column) : null
})
const hoverMark = computed(() => {
  const current = hover.value
  return current ? markAt(current.year, current.column) : null
})
const canvasLabel = computed(() => {
  const first = props.rows[0]?.year
  const last = props.rows[props.rows.length - 1]?.year
  return `Daily burning days, ${first} to ${last}, ${SERIES_LABELS[props.series]}. Arrow keys move, Enter selects the month.`
})

watch(
  () => [props.selected.year, props.selected.month] as const,
  ([year, month]) => {
    const current = cursor.value
    if (current.year === year && dateAtColumn(year, current.column)?.month === month) return
    const row = props.rows.find((candidate) => candidate.year === year) ?? props.rows[0]
    if (!row) return
    cursor.value = { year: row.year, column: firstColumnOfMonth(month) }
  },
)

watch(
  () => [
    props.series,
    props.harmonizedFrom,
    props.systemMarks,
    props.selected.year,
    props.selected.month,
    props.rows,
    cursor.value,
    focused.value,
    scale.value,
  ],
  () => void nextTick(draw),
)

function draw(): void {
  const canvasEl = canvas.value
  const frameEl = frame.value
  if (!canvasEl || !frameEl) return
  const width = Math.max(1, frameEl.clientWidth)
  const heightPx = height.value
  const dpr = window.devicePixelRatio || 1
  canvasEl.width = Math.round(width * dpr)
  canvasEl.height = Math.round(heightPx * dpr)
  canvasEl.style.width = `${width}px`
  canvasEl.style.height = `${heightPx}px`
  frameWidth.value = width

  const ctx = canvasEl.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const theme = chartTheme()
  drawDailyHeatmap({
    ctx,
    width,
    rows: props.rows,
    series: props.series,
    harmonizedFrom: props.harmonizedFrom,
    selected: props.selected,
    cursor: cursor.value,
    focused: focused.value,
    scale: scale.value,
    theme,
  })
  drawSystemMarks(ctx, width, theme)
}

/** The panel ring keeps the dot legible over any ramp stop. */
function drawSystemMarks(ctx: CanvasRenderingContext2D, width: number, theme: ChartTheme): void {
  const cellWidth = dailyCellWidth(width)
  const radius = SYSTEM_MARK_SIZE_PX / 2
  for (const mark of visibleMarks.value) {
    const rowIndex = props.rows.findIndex((row) => row.year === mark.year)
    if (rowIndex < 0) continue
    const centreX = DAILY_PAD_LEFT + firstColumnOfMonth(mark.month) * cellWidth + SYSTEM_MARK_INSET_PX + radius
    const centreY = DAILY_PAD_TOP + rowIndex * DAILY_ROW_HEIGHT + SYSTEM_MARK_INSET_PX + radius
    ctx.beginPath()
    ctx.arc(centreX, centreY, radius + 1, 0, Math.PI * 2)
    ctx.fillStyle = theme.panel
    ctx.fill()
    ctx.beginPath()
    ctx.arc(centreX, centreY, radius, 0, Math.PI * 2)
    ctx.fillStyle = mark.sensor === 'MODIS' ? theme.modis : theme.viirs
    ctx.fill()
  }
}

interface Hit {
  year: number
  month: number
  x: number
  y: number
  column: number
}

function locate(event: PointerEvent): Hit | null {
  const canvasEl = canvas.value
  if (!canvasEl) return null
  const rect = canvasEl.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  if (x < DAILY_PAD_LEFT || x >= rect.width - DAILY_PAD_RIGHT || y < DAILY_PAD_TOP) return null
  const rowIndex = Math.floor((y - DAILY_PAD_TOP) / DAILY_ROW_HEIGHT)
  const row = props.rows[rowIndex]
  if (!row) return null
  const column = Math.floor((x - DAILY_PAD_LEFT) / dailyCellWidth(rect.width))
  const calendarDay = dateAtColumn(row.year, column)
  if (!calendarDay) return null
  return { year: row.year, month: calendarDay.month, x, y, column }
}

function onPointerMove(event: PointerEvent): void {
  const hit = locate(event)
  if (!hit || !describe(hit.year, hit.column)) {
    hover.value = null
    return
  }
  hover.value = {
    left: Math.max(8, Math.min(hit.x + 12, Math.max(8, frameWidth.value - 220))),
    top: Math.max(8, Math.min(hit.y + 12, Math.max(8, height.value - 64))),
    year: hit.year,
    column: hit.column,
  }
}

function onPointerLeave(): void {
  hover.value = null
}

function selectAt(position: DailyCellPosition): void {
  const calendarDay = dateAtColumn(position.year, position.column)
  if (calendarDay) emit('select', position.year, calendarDay.month)
}

function onClick(event: PointerEvent): void {
  const hit = locate(event)
  if (!hit) return
  cursor.value = { year: hit.year, column: hit.column }
  canvas.value?.focus({ preventScroll: true })
  selectAt(cursor.value)
}

function onKeyDown(event: KeyboardEvent): void {
  const current = cursor.value
  const rowIndex = props.rows.findIndex((row) => row.year === current.year)
  if (rowIndex < 0) return
  let next = current
  let handled = true

  switch (event.key) {
    case 'ArrowLeft':
    case 'ArrowRight': {
      const column = stepColumn(current.year, current.column, event.key === 'ArrowLeft' ? -1 : 1)
      if (column !== null) next = { year: current.year, column }
      break
    }
    case 'ArrowUp':
    case 'ArrowDown': {
      const target = props.rows[rowIndex + (event.key === 'ArrowUp' ? -1 : 1)]
      if (target) {
        next = {
          year: target.year,
          column: resolveColumn(target.year, current.column),
        }
      }
      break
    }
    case 'Home':
      next = { year: current.year, column: 0 }
      break
    case 'End':
      next = { year: current.year, column: DAILY_COLUMNS - 1 }
      break
    case 'Enter':
    case ' ':
      selectAt(current)
      break
    default:
      handled = false
  }

  if (!handled) return
  event.preventDefault()
  if (next.year !== current.year || next.column !== current.column) cursor.value = next
}

watch(frame, (element) => {
  observer?.disconnect()
  if (element) observer?.observe(element)
})

onMounted(() => {
  observer = new ResizeObserver(() => draw())
  if (frame.value) observer.observe(frame.value)
  void nextTick(draw)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})
</script>

<template>
  <div class="scroll-thin overflow-x-auto px-3 py-2">
    <div ref="frame" class="relative min-w-[760px]">
      <canvas
        ref="canvas"
        role="application"
        aria-roledescription="daily heatmap"
        :aria-label="canvasLabel"
        aria-describedby="daily-heatmap-help"
        tabindex="0"
        class="block w-full cursor-crosshair rounded-[2px] outline-none"
        :style="{ height: `${height}px` }"
        @pointermove="onPointerMove"
        @pointerleave="onPointerLeave"
        @click="onClick"
        @keydown="onKeyDown"
        @focus="focused = true"
        @blur="focused = false"
      />
      <div
        v-for="row in hatchRows"
        :key="`viirs-hatch-${row.year}`"
        class="daily-hatch pointer-events-none absolute"
        :style="{
          top: `${row.top}px`,
          left: `${DAILY_PAD_LEFT}px`,
          right: `${DAILY_PAD_RIGHT}px`,
          height: `${DAILY_CELL_HEIGHT}px`,
        }"
      />
      <div
        v-if="earlyBand"
        class="pre-viirs-band"
        :style="{
          top: `${earlyBand.top}px`,
          left: `${DAILY_PAD_LEFT}px`,
          right: `${DAILY_PAD_RIGHT}px`,
          height: `${earlyBand.height}px`,
        }"
      >
        <div class="pre-viirs-pill">
          <p role="note" class="whitespace-nowrap text-xs text-muted">{{ earlyBand.note }}</p>
          <button
            v-if="earlyBand.switchable"
            type="button"
            class="pointer-events-auto whitespace-nowrap text-xs text-ink underline decoration-edge-strong underline-offset-2 transition-colors duration-[90ms] hover:decoration-ink"
            @click="emit('update:series', 'modis')"
          >
            switch to MODIS
          </button>
        </div>
      </div>
      <div
        v-if="hover && hoverInfo"
        class="pointer-events-none absolute z-10 max-w-56 rounded-[var(--radius)] border border-edge-strong bg-panel px-2 py-1 text-2xs text-ink shadow-lg"
        :style="{ left: `${hover.left}px`, top: `${hover.top}px` }"
      >
        <p class="font-mono tnum">{{ hoverInfo.date }}</p>
        <p class="tnum">{{ hoverInfo.count }}</p>
        <p class="text-faint">{{ SERIES_LABELS[series] }}</p>
        <p v-if="hoverMark" class="text-muted">{{ hoverMark.label }}</p>
      </div>
      <p id="daily-heatmap-help" class="sr-only">
        One row per year. Arrow keys move between days and years; Home and End jump to the start and
        end of a row; Enter selects the month.
      </p>
      <p class="sr-only" aria-live="polite">{{ focusSummary }}</p>
    </div>

    <HeatmapLegend
      metric="counts"
      :series="series"
      resolution="day"
      :harmonized-from="harmonizedFrom"
      :counts-min="scale.min"
      :counts-max="scale.max"
      :z-limit="1"
    />
  </div>
</template>

<style scoped>
.daily-hatch {
  background-color: var(--raised);
  background-image: repeating-linear-gradient(135deg, var(--edge-strong) 0 1px, transparent 1px 5px);
}

/*
 * The pre-2012 boundary in Both and VIIRS, over the cell area only. The tint is
 * translucent so the canvas hatch keeps reading through it; the padded note sits
 * mid-block, clear of the year labels.
 */
.pre-viirs-band {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-inline: 6px;
  pointer-events: none;
  background-color: color-mix(in srgb, var(--ink) 4%, transparent);
  border-block: 1px solid color-mix(in srgb, var(--edge-strong) 55%, transparent);
}

.pre-viirs-pill {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 20px 16px;
  border-radius: var(--radius);
  background-color: color-mix(in srgb, var(--panel) 92%, transparent);
}
</style>
