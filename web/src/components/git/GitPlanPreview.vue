<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { Bbox, GitCommit, GitCommitCells } from '@/types/git'
import { chartTheme } from '@/lib/colors'
import { formatClock, formatDayYear } from '@/lib/git'
import { formatInteger } from '@/lib/format'

const props = defineProps<{
  commit: GitCommit
  bbox: Bbox
  cells: GitCommitCells | undefined
}>()

const PLAN_MAX_WIDTH_PX = 320
const PLAN_MAX_HEIGHT_PX = 220
const CELL_DEGREES = 0.01
const CELL_AREA = CELL_DEGREES * CELL_DEGREES
const CARD_MIN_WIDTH_PX = 240
/** p-2 plus the 1px border on each side; the plan is the only variable width. */
const CARD_CHROME_PX = 18

const canvas = ref<HTMLCanvasElement | null>(null)

const spans = computed(() => ({
  lon: Math.max(1e-6, props.bbox.lon1 - props.bbox.lon0),
  lat: Math.max(1e-6, props.bbox.lat1 - props.bbox.lat0),
}))

/** The plan keeps the AOI's aspect; the caps only shrink it, never stretch it. */
const box = computed(() => {
  const aspect = spans.value.lon / spans.value.lat
  let width = PLAN_MAX_WIDTH_PX
  let height = width / aspect
  if (height > PLAN_MAX_HEIGHT_PX) {
    height = PLAN_MAX_HEIGHT_PX
    width = height * aspect
  }
  return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) }
})

/**
 * Only cells whose centre falls inside the AOI count: `cells` holds every cell
 * of the pass, and the pass routinely extends far beyond the box (one 2023
 * pass near the default box carries 16,320 cells, 2,053 of them in the box).
 */
const coverage = computed(() => {
  const cells = props.cells
  const { lon, lat } = spans.value
  if (!cells) return { count: 0, percent: 0 }
  let count = 0
  for (let index = 0; index < cells.clat.length; index += 1) {
    const gx = (cells.clon[index] / 100 - props.bbox.lon0) / lon
    const gy = (props.bbox.lat1 - cells.clat[index] / 100) / lat
    if (gx >= 0 && gx <= 1 && gy >= 0 && gy <= 1) count += 1
  }
  const percent = ((count * CELL_AREA) / (lon * lat)) * 100
  return { count, percent }
})

const coverageText = computed(() => {
  const { count, percent } = coverage.value
  if (count === 0) return 'no detections in box'
  // One decimal cannot distinguish one cell in a 1° box (0.01 %) from zero.
  const share =
    percent < 0.05
      ? '<0.1 %'
      : `${percent < 9.95 ? percent.toFixed(1) : Math.round(percent)} %`
  return `${formatInteger(count)} ${count === 1 ? 'cell' : 'cells'} · ${share} of the box`
})

function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const { lon: lonSpan, lat: latSpan } = spans.value
  const lonStepPx = (0.25 / lonSpan) * width
  const latStepPx = (0.25 / latSpan) * height
  // The old preview drew a line every ~3px, which read as an empty table. A
  // quarter-degree reference only belongs here when it has room to be read.
  if (lonStepPx < 16 && latStepPx < 16) return
  ctx.beginPath()
  if (lonStepPx >= 16) {
    const firstLon = Math.ceil(props.bbox.lon0 / 0.25) * 0.25
    const steps = Math.floor((props.bbox.lon1 - firstLon) / 0.25)
    for (let step = 0; step <= steps; step += 1) {
      const x = Math.round(((firstLon + step * 0.25 - props.bbox.lon0) / lonSpan) * width) + 0.5
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
    }
  }
  if (latStepPx >= 16) {
    const firstLat = Math.ceil(props.bbox.lat0 / 0.25) * 0.25
    const steps = Math.floor((props.bbox.lat1 - firstLat) / 0.25)
    for (let step = 0; step <= steps; step += 1) {
      const y =
        Math.round(((props.bbox.lat1 - (firstLat + step * 0.25)) / latSpan) * height) + 0.5
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
    }
  }
  ctx.strokeStyle = chartTheme().grid
  ctx.lineWidth = 1
  ctx.stroke()
}

function draw(): void {
  const element = canvas.value
  if (!element) return
  const { width, height } = box.value
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  element.width = Math.round(width * dpr)
  element.height = Math.round(height * dpr)
  const ctx = element.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const theme = chartTheme()
  // Sunken, not panel: the card is panel, and cells need a clear step away from
  // whatever the plan is drawn on. Sensor colour at full opacity carries the
  // detections; the AOI frame is the only chrome left on the plot.
  ctx.fillStyle = theme.sunken
  ctx.fillRect(0, 0, width, height)

  const { count } = coverage.value
  if (count > 0) {
    drawGrid(ctx, width, height)
    const cells = props.cells
    const { lon: lonSpan, lat: latSpan } = spans.value
    const snap = (value: number): number => Math.round(value * dpr) / dpr
    // A 0.01° cell is 2.2px in a 1° box. Enlarge to 3 CSS px so an isolated
    // detection is a mark, not a smudge, and snap to device pixels to keep it
    // from being anti-aliased into the background.
    const cellW = snap(Math.max(3, (CELL_DEGREES / lonSpan) * width))
    const cellH = snap(Math.max(3, (CELL_DEGREES / latSpan) * height))
    if (cells) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, width, height)
      ctx.clip()
      ctx.fillStyle = props.commit.sensor === 'MODIS' ? theme.modis : theme.viirs
      for (let index = 0; index < cells.clat.length; index += 1) {
        const gx = (cells.clon[index] / 100 - props.bbox.lon0) / lonSpan
        const gy = (props.bbox.lat1 - cells.clat[index] / 100) / latSpan
        if (gx < 0 || gx > 1 || gy < 0 || gy > 1) continue
        // Keep a cell whose centre sits on the frame fully visible: clipping it
        // in half makes a row of edge detections look like one or two marks.
        const x = Math.max(0, Math.min(width - cellW, snap(gx * width - cellW / 2)))
        const y = Math.max(0, Math.min(height - cellH, snap(gy * height - cellH / 2)))
        ctx.fillRect(x, y, cellW, cellH)
      }
      ctx.restore()
    }
  }

  ctx.strokeStyle = theme.edgeStrong
  ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, Math.max(1, width - 1), Math.max(1, height - 1))
}

watch(
  () => [props.commit, props.bbox, props.cells, box.value],
  () => void nextTick(draw),
)

onMounted(() => void nextTick(draw))
</script>

<template>
  <article
    class="rounded-[var(--radius)] border border-edge-strong bg-panel p-2 shadow-lg"
    :style="{ width: `${Math.max(CARD_MIN_WIDTH_PX, box.width + CARD_CHROME_PX)}px` }"
  >
    <header class="flex items-baseline justify-between gap-2 font-mono text-2xs">
      <span :class="commit.sensor === 'MODIS' ? 'text-modis' : 'text-viirs'">
        {{ commit.sensor }}
      </span>
      <span class="text-faint">{{ commit.satellite }}</span>
    </header>
    <p class="mt-0.5 truncate font-mono text-[10px] text-faint">{{ commit.id }}</p>
    <p class="mt-0.5 whitespace-nowrap font-mono text-2xs text-muted tnum">
      {{ formatDayYear(commit.timestamp) }} · {{ formatClock(commit.timestamp) }} UTC
    </p>
    <div
      class="mt-1.5 mx-auto overflow-hidden rounded-[2px] bg-sunken"
      :style="{ width: `${box.width}px`, height: `${box.height}px` }"
    >
      <canvas
        ref="canvas"
        class="block"
        :style="{ width: `${box.width}px`, height: `${box.height}px` }"
      />
    </div>
    <p
      data-plan-coverage
      class="mt-1 font-mono text-2xs tnum"
      :class="coverage.count === 0 ? 'text-faint' : 'text-muted'"
    >
      {{ coverageText }}
    </p>
  </article>
</template>
