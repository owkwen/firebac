<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type {
  GitCommit,
  GitLog,
  GitPlanSize,
  TimelineDayEntry,
  TimelineGapEntry,
  TimelineRow,
} from '@/types/git'
import {
  GIT_ROW_HEIGHTS,
  buildTimeline,
  formatDayRange,
  gitGridStyle,
} from '@/lib/git'
import GitCommitCard from './GitCommitCard.vue'
import GitPlanCanvas from './GitPlanCanvas.vue'
import GitPlanPreview from './GitPlanPreview.vue'

const props = defineProps<{
  log: GitLog
  planSize: GitPlanSize
}>()

const PREVIEW_OFFSET_PX = 16
/** Widest plan (320) plus the card's padding and border. */
const PREVIEW_WIDTH_PX = 338
/** Tallest plan (220) plus the card's header, readout and padding. */
const PREVIEW_HEIGHT_PX = 314

const grid = computed(() => gitGridStyle(props.planSize))
const rowHeight = computed(() => GIT_ROW_HEIGHTS[props.planSize])
const layout = computed(() => buildTimeline(props.log.displayed, rowHeight.value))
const canvasGrid = computed(() => ({ ...grid.value, gridTemplateRows: '1fr' }))
const dayEntries = computed(() =>
  layout.value.entries.filter((entry): entry is TimelineDayEntry => entry.kind === 'day'),
)
const gapEntries = computed(() =>
  layout.value.entries.filter((entry): entry is TimelineGapEntry => entry.kind === 'gap'),
)

interface PreviewState {
  commit: GitCommit
  left: number
  top: number
}

const previewState = ref<PreviewState | null>(null)

function rowAt(y: number): TimelineRow | null {
  const rows = layout.value.rows
  let low = 0
  let high = rows.length - 1
  while (low <= high) {
    const mid = (low + high) >>> 1
    const row = rows[mid]
    if (y < row.y) high = mid - 1
    else if (y >= row.y + rowHeight.value) low = mid + 1
    else return row
  }
  return null
}

function onPlanMove(event: PointerEvent): void {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const row = rowAt(event.clientY - rect.top)
  if (!row) {
    previewState.value = null
    return
  }
  const left =
    event.clientX + PREVIEW_OFFSET_PX + PREVIEW_WIDTH_PX > window.innerWidth - 8
      ? event.clientX - PREVIEW_WIDTH_PX - PREVIEW_OFFSET_PX
      : event.clientX + PREVIEW_OFFSET_PX
  const top =
    event.clientY + PREVIEW_OFFSET_PX + PREVIEW_HEIGHT_PX > window.innerHeight - 8
      ? event.clientY - PREVIEW_HEIGHT_PX - PREVIEW_OFFSET_PX
      : event.clientY + PREVIEW_OFFSET_PX
  previewState.value = {
    commit: row.commit,
    left: Math.max(8, left),
    top: Math.max(8, top),
  }
}

function closePreview(): void {
  previewState.value = null
}

function onWindowKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') closePreview()
}

onMounted(() => window.addEventListener('keydown', onWindowKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onWindowKeydown))
</script>

<template>
  <div class="relative w-full" :style="{ height: `${layout.height}px`, minWidth: grid.minWidth }">
    <div class="absolute inset-0 grid" :style="canvasGrid">
      <div class="relative border-r border-edge">
        <div
          v-for="tick in layout.ticks"
          :key="tick.timestamp"
          class="absolute right-0 flex -translate-y-1/2 items-center gap-1"
          :style="{ top: `${tick.y}px` }"
        >
          <span
            v-if="tick.label"
            class="tnum font-mono text-[10px]"
            :class="tick.major ? 'text-muted' : 'text-faint'"
          >
            {{ tick.label }}
          </span>
          <span class="h-px w-2 bg-edge-strong" />
        </div>
      </div>
      <div />
      <div
        class="relative"
        @pointermove="onPlanMove"
        @pointerleave="closePreview"
      >
        <GitPlanCanvas
          :rows="layout.rows"
          :height="layout.height"
          :row-height="rowHeight"
          :bbox="log.bbox"
          :cells="log.cells"
          :sensor-max="log.sensorMax"
        />
      </div>
      <div />
    </div>

    <div class="pointer-events-none absolute inset-0">
      <div
        v-for="entry in dayEntries"
        :key="`day-${entry.date}`"
        data-timeline-day
        :data-date="entry.date"
        :data-passes="entry.passes"
        class="absolute left-0 right-0 flex items-center gap-2 border-t border-edge bg-raised/40 font-mono text-2xs"
        :style="{
          top: `${entry.y}px`,
          height: `${entry.height}px`,
          paddingInline: grid.paddingInline,
        }"
      >
        <span class="tnum text-ink">{{ entry.date }}</span>
        <span class="text-faint">· {{ entry.passes }} {{ entry.passes === 1 ? 'pass' : 'passes' }}</span>
      </div>
      <div
        v-for="entry in gapEntries"
        :key="`gap-${entry.from}-${entry.to}`"
        data-timeline-gap
        :data-days="entry.days"
        :data-from="entry.from"
        :data-to="entry.to"
        class="absolute left-0 right-0 flex items-center gap-2 font-mono text-[10px] text-faint"
        :style="{
          top: `${entry.y}px`,
          height: `${entry.height}px`,
          paddingInline: grid.paddingInline,
        }"
      >
        <span class="h-px flex-1 bg-edge" />
        <span class="whitespace-nowrap">
          {{ entry.days }} {{ entry.days === 1 ? 'day' : 'days' }} without detections ·
          {{ formatDayRange(entry.from, entry.to) }}
        </span>
        <span class="h-px flex-1 bg-edge" />
      </div>
    </div>

    <ol class="pointer-events-none absolute inset-0" aria-label="commit log, newest first">
      <li
        v-for="row in layout.rows"
        :key="row.commit.id"
        class="absolute left-0 right-0"
        :style="{ top: `${row.y}px` }"
      >
        <div
          class="grid items-center"
          :style="[grid, { height: `${rowHeight}px` }]"
        >
          <div class="border-r border-edge" />
          <div class="flex min-w-0 justify-end pr-1">
            <GitCommitCard
              v-if="row.commit.sensor === 'VIIRS'"
              :commit="row.commit"
              side="viirs"
            />
          </div>
          <div />
          <div class="flex min-w-0 justify-start pl-1">
            <GitCommitCard
              v-if="row.commit.sensor === 'MODIS'"
              :commit="row.commit"
              side="modis"
            />
          </div>
        </div>
      </li>
    </ol>

    <div
      v-if="previewState"
      data-plan-preview
      class="pointer-events-none fixed z-50"
      :style="{ left: `${previewState.left}px`, top: `${previewState.top}px` }"
      aria-hidden="true"
    >
      <GitPlanPreview
        :commit="previewState.commit"
        :bbox="log.bbox"
        :cells="log.cells.get(previewState.commit.id)"
      />
    </div>
  </div>
</template>
