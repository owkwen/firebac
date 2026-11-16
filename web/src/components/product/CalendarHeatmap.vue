<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type {
  CalendarCell,
  MetricMode,
  ResolutionMode,
  SeriesMode,
  SeriesRow,
  SystemMark,
} from '@/types/calendar'
import {
  CALENDAR_TIP_HEIGHT_PX,
  CALENDAR_TIP_WIDTH_PX,
  MONTH_LABELS,
  SERIES_NOTES,
  SYSTEM_MARK_INSET_PX,
  SYSTEM_MARK_SIZE_PX,
} from '@/lib/constants'
import { buildHeatRows, heatScale, nextCell } from '@/lib/heatmap'
import type { HeatCell } from '@/lib/heatmap'
import DailyHeatmap from './DailyHeatmap.vue'
import HeatmapControls from './HeatmapControls.vue'
import HeatmapLegend from './HeatmapLegend.vue'

const props = defineProps<{
  cells: readonly CalendarCell[]
  years: readonly number[]
  months: readonly number[]
  series: SeriesMode
  metric: MetricMode
  resolution: ResolutionMode
  seriesRows: readonly SeriesRow[]
  harmonizedFrom: number
  nonComparableNote: string
  partialYears: string
  systemMarks: readonly SystemMark[]
  selected: { year: number; month: number }
}>()

const emit = defineEmits<{
  select: [year: number, month: number]
  'update:series': [series: SeriesMode]
  'update:metric': [metric: MetricMode]
  'update:resolution': [resolution: ResolutionMode]
}>()

/** The year gutter is a fixed column; the 2px column gap is the `gap-0.5` on every row. */
const GUTTER_PX = 56
const COLUMN_GAP_PX = 2
const columns = computed(() => `${GUTTER_PX}px repeat(${props.months.length}, minmax(0, 1fr))`)
const bandInset = `${GUTTER_PX + COLUMN_GAP_PX}px`
const scale = computed(() => heatScale(props.cells, props.series))
const rows = computed(() =>
  buildHeatRows({
    cells: props.cells,
    years: props.years,
    months: props.months,
    series: props.series,
    metric: props.metric,
    harmonizedFrom: props.harmonizedFrom,
  }),
)
const heatmapTitle = computed(() => (props.resolution === 'day' ? 'Year × day' : 'Year × month'))
/** One line under the grid: what the modes count, and which years are partial. */
const footerNote = computed(() => {
  const partial = props.partialYears ? ` · ${props.partialYears}, z and ratio withheld` : ''
  return `${SERIES_NOTES[props.series]}${partial}`
})

interface MarkedCell extends HeatCell {
  mark: SystemMark | null
}

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
const marks = computed(
  () => new Map(visibleMarks.value.map((mark) => [mark.key, mark])),
)
const gridRows = computed(() =>
  rows.value.map((row) => ({
    ...row,
    cells: row.cells.map(
      (cell): MarkedCell => ({ ...cell, mark: marks.value.get(cell.key) ?? null }),
    ),
  })),
)

/**
 * Both and VIIRS have no complete series before `harmonizedFrom`, so those rows
 * are a boundary, not missing data: one note band names it. MODIS covers every
 * year, so it gets no band. Only Both can switch sensor to recover the years.
 */
const earlyBand = computed(() => {
  if (props.series === 'modis') return null
  if (props.series === 'harmonized') {
    return {
      note: `MODIS only before ${props.harmonizedFrom}`,
      switchable: true,
    }
  }
  return { note: `VIIRS starts in ${props.harmonizedFrom}`, switchable: false }
})

/**
 * The band groups the rows it explains under one rowgroup: the same years in
 * both the monthly grid and the daily canvas.
 */
const rowBlocks = computed(() => {
  const all = gridRows.value
  if (!earlyBand.value) return [{ key: 'all', band: false, rows: all }]
  const early = all.filter((row) => row.year < props.harmonizedFrom)
  if (early.length === 0) return [{ key: 'all', band: false, rows: all }]
  return [
    { key: 'early', band: true, rows: early },
    { key: 'late', band: false, rows: all.filter((row) => row.year >= props.harmonizedFrom) },
  ].filter((block) => block.rows.length > 0)
})

interface Tip {
  text: string
  mark: string
  left: number
  top: number
}

const tip = ref<Tip | null>(null)

function showTip(event: Event, cell: MarkedCell): void {
  if (!cell.mark) return
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  tip.value = {
    text: cell.title,
    mark: cell.mark.label,
    left: Math.max(8, Math.min(rect.left, window.innerWidth - CALENDAR_TIP_WIDTH_PX - 8)),
    top: Math.min(rect.bottom + 4, window.innerHeight - CALENDAR_TIP_HEIGHT_PX),
  }
}

function hideTip(): void {
  tip.value = null
}

const focused = ref(resolveFocus())
watch(
  () => props.selected,
  () => {
    focused.value = resolveFocus()
  },
)

function resolveFocus(): { year: number; month: number } {
  const present = props.cells.some(
    (cell) => cell.y === props.selected.year && cell.m === props.selected.month,
  )
  const first = props.cells[0]
  if (present || !first) return { ...props.selected }
  return { year: first.y, month: first.m }
}

function select(year: number, month: number): void {
  focused.value = { year, month }
  if (year !== props.selected.year || month !== props.selected.month) emit('select', year, month)
}

function onCellFocus(event: FocusEvent, cell: MarkedCell): void {
  select(cell.year, cell.month)
  showTip(event, cell)
}

function selectDay(year: number, month: number): void {
  emit('select', year, month)
}

function focusCell(key: string): void {
  // preventScroll keeps keyboard traversal from moving the page as focus walks the grid.
  document.querySelector<HTMLElement>(`[data-heatmap="${key}"]`)?.focus({ preventScroll: true })
}

function onKey(event: KeyboardEvent): void {
  const step = {
    ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
  }[event.key]
  if (!step) return
  event.preventDefault()
  const has = (year: number, month: number): boolean =>
    props.cells.some((cell) => cell.y === year && cell.m === month)
  const target = nextCell(props.years, props.months, focused.value, step[0], step[1], has)
  if (!target) return
  select(target.year, target.month)
  void nextTick(() => focusCell(`${target.year}-${target.month}`))
}
</script>

<template>
  <section class="rounded-[var(--radius)] border border-edge bg-panel" aria-labelledby="heatmap-title">
    <header class="flex flex-wrap items-center justify-between gap-2 border-b border-edge px-3 py-1.5">
      <h2 id="heatmap-title" class="text-2xs font-semibold uppercase tracking-[0.14em] text-ink">{{ heatmapTitle }}</h2>
      <HeatmapControls
        :series="series"
        :metric="metric"
        :resolution="resolution"
        @update:series="emit('update:series', $event)"
        @update:metric="emit('update:metric', $event)"
        @update:resolution="emit('update:resolution', $event)"
      />
    </header>

    <DailyHeatmap
      v-if="resolution === 'day'"
      :rows="seriesRows"
      :series="series"
      :harmonized-from="harmonizedFrom"
      :system-marks="systemMarks"
      :selected="selected"
      @select="selectDay"
      @update:series="emit('update:series', $event)"
    />

    <div v-else class="scroll-thin overflow-x-auto px-3 py-2">
      <div
        role="grid"
        :aria-rowcount="years.length + 1"
        :aria-colcount="months.length + 1"
        aria-label="Burning days by year and month"
        class="min-w-[720px]"
        :style="{
          '--mark-size': `${SYSTEM_MARK_SIZE_PX}px`,
          '--mark-inset': `${SYSTEM_MARK_INSET_PX}px`,
          '--heatmap-band-inset': bandInset,
        }"
      >
        <div role="row" class="grid gap-0.5 pb-1" :style="{ gridTemplateColumns: columns }">
          <div role="columnheader" class="text-2xs text-faint">year</div>
          <div v-for="(month, index) in months" :key="month" role="columnheader" class="text-center text-2xs text-faint">
            {{ MONTH_LABELS[index] }}
          </div>
        </div>

        <div v-for="block in rowBlocks" :key="block.key" role="rowgroup" class="relative">
          <div
            v-for="row in block.rows"
            :key="row.year"
            role="row"
            class="grid gap-0.5 pb-0.5"
            :style="{ gridTemplateColumns: columns }"
          >
            <div
              role="rowheader"
              class="flex h-[22px] items-center gap-1 font-mono text-2xs text-muted tnum"
            >
              <span>{{ row.year }}</span>
            </div>
            <div
              v-for="cell in row.cells"
              :key="cell.key"
              role="gridcell"
              :data-heatmap="cell.key"
              :data-sparse="cell.sparse ? 'true' : undefined"
              :tabindex="focused.year === cell.year && focused.month === cell.month ? 0 : -1"
              :aria-selected="selected.year === cell.year && selected.month === cell.month"
              :aria-label="cell.mark ? `${cell.title} · ${cell.mark.label}` : cell.title"
              :title="cell.mark ? undefined : cell.title"
              class="relative flex h-[22px] cursor-pointer items-center justify-center rounded-[2px] text-2xs tnum"
              :class="[
                cell.empty ? 'border border-dashed border-edge text-faint' : cell.hatch ? 'hatch text-faint' : '',
                cell.sparse ? 'sparse' : '',
              ]"
              :style="{ backgroundColor: cell.background, color: cell.ink }"
              @pointerenter="showTip($event, cell)"
              @pointerleave="hideTip"
              @focus="onCellFocus($event, cell)"
              @blur="hideTip"
              @click="select(cell.year, cell.month); focusCell(cell.key)"
              @keydown="onKey"
              @keydown.enter.prevent="select(cell.year, cell.month)"
              @keydown.space.prevent="select(cell.year, cell.month)"
            >
              {{ cell.label }}
              <span
                v-if="cell.mark"
                class="badge"
                :class="cell.mark.sensor === 'MODIS' ? 'badge-modis' : 'badge-viirs'"
                aria-hidden="true"
              />
            </div>
          </div>

          <div v-if="block.band && earlyBand" class="pre-viirs-band">
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
        </div>
      </div>

      <HeatmapLegend
        :metric="metric"
        :series="series"
        :resolution="resolution"
        :harmonized-from="harmonizedFrom"
        :counts-max="scale.countsMax"
        :z-limit="scale.zLimit"
      />
    </div>

    <div
      v-if="tip"
      class="pointer-events-none fixed z-50 w-60 rounded-[var(--radius)] border border-edge-strong bg-panel px-2 py-1 text-2xs text-ink shadow-lg"
      :style="{ left: `${tip.left}px`, top: `${tip.top}px` }"
    >
      <p class="font-mono tnum">{{ tip.text }}</p>
      <p class="text-muted">{{ tip.mark }}</p>
    </div>

    <div v-if="footerNote" class="border-t border-edge/60 px-3 py-1.5">
      <p class="text-2xs text-faint" :title="nonComparableNote">{{ footerNote }}</p>
    </div>
  </section>
</template>

<style scoped>
.hatch {
  background-image: repeating-linear-gradient(135deg, var(--edge-strong) 0 1px, transparent 1px 5px);
}

/*
 * The pre-2012 boundary in Both and VIIRS. The tint is translucent so the hatch
 * keeps reading through it; the padded note sits mid-block, clear of the year
 * gutter (--heatmap-band-inset), so the labels stay readable.
 */
.pre-viirs-band {
  position: absolute;
  inset-block: 0;
  left: var(--heatmap-band-inset);
  right: 0;
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

/* A corner dot, inset from the value text; the ring keeps it legible on any ramp stop. */
.badge {
  position: absolute;
  top: var(--mark-inset);
  left: var(--mark-inset);
  width: var(--mark-size);
  height: var(--mark-size);
  border-radius: 50%;
  box-shadow: 0 0 0 1px var(--panel);
  pointer-events: none;
}

.badge-modis {
  background-color: var(--modis);
}

.badge-viirs {
  background-color: var(--viirs);
}

/* Dots, not a hatch: the pre-2012 hatch already owns diagonal lines. */
.sparse::after {
  content: '';
  position: absolute;
  inset: 2px;
  border-radius: 1px;
  background-image: radial-gradient(circle, var(--accent) 0 0.8px, transparent 1px);
  background-size: 4px 4px;
  opacity: 0.65;
  pointer-events: none;
}
</style>
