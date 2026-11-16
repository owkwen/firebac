<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Bbox, GitCommitCells, GitSensor, TimelineRow } from '@/types/git'
import type { ChartTheme } from '@/lib/colors'
import { chartTheme } from '@/lib/colors'
import { formatBbox } from '@/lib/git'
import { formatInteger } from '@/lib/format'

const props = defineProps<{
  rows: readonly TimelineRow[]
  height: number
  rowHeight: number
  bbox: Bbox
  cells: Map<string, GitCommitCells>
  sensorMax: Record<GitSensor, number>
}>()

const frame = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
let observer: ResizeObserver | null = null

const label = computed(
  () =>
    `${props.rows.length} pass plans inside ${formatBbox(props.bbox)}; 0.01° cells, MODIS max ${formatInteger(props.sensorMax.MODIS)} MW, VIIRS max ${formatInteger(props.sensorMax.VIIRS)} MW.`,
)

interface Rgb {
  r: number
  g: number
  b: number
}

function hexToRgb(hex: string): Rgb {
  const value = hex.trim().replace('#', '')
  if (value.length !== 6) return { r: 0, g: 0, b: 0 }
  const numeric = Number.parseInt(value, 16)
  return { r: (numeric >> 16) & 255, g: (numeric >> 8) & 255, b: numeric & 255 }
}

function blend(from: Rgb, to: Rgb, fraction: number): Rgb {
  return {
    r: Math.round(from.r + (to.r - from.r) * fraction),
    g: Math.round(from.g + (to.g - from.g) * fraction),
    b: Math.round(from.b + (to.b - from.b) * fraction),
  }
}

const LEVELS = 64

function palette(background: Rgb, sensor: Rgb): Uint8ClampedArray {
  const stops = new Uint8ClampedArray(LEVELS * 3)
  for (let level = 0; level < LEVELS; level += 1) {
    const fraction = 0.22 + 0.78 * (level / (LEVELS - 1))
    const rgb = blend(background, sensor, fraction)
    stops[level * 3] = rgb.r
    stops[level * 3 + 1] = rgb.g
    stops[level * 3 + 2] = rgb.b
  }
  return stops
}

function draw(): void {
  const element = frame.value
  const elementCanvas = canvas.value
  if (!element || !elementCanvas || props.height <= 0) return
  const width = Math.max(1, element.clientWidth)
  // A canvas is capped in height; long logs render at 1× rather than silently truncate.
  const dpr = props.height > 8000 ? 1 : Math.min(window.devicePixelRatio || 1, 2)
  elementCanvas.width = Math.round(width * dpr)
  elementCanvas.height = Math.round(props.height * dpr)
  elementCanvas.style.width = `${width}px`
  elementCanvas.style.height = `${props.height}px`
  const ctx = elementCanvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, props.height)

  const theme: ChartTheme = chartTheme()
  // A plan sits on `panel`, not `sunken`, so a single-cell pass is not a black
  // rectangle against a black timeline.
  const background = hexToRgb(theme.panel)
  const sensors: Record<GitSensor, Rgb> = {
    MODIS: hexToRgb(theme.modis),
    VIIRS: hexToRgb(theme.viirs),
  }
  const palettes: Record<GitSensor, Uint8ClampedArray> = {
    MODIS: palette(background, sensors.MODIS),
    VIIRS: palette(background, sensors.VIIRS),
  }

  const lonSpan = Math.max(1e-6, props.bbox.lon1 - props.bbox.lon0)
  const latSpan = Math.max(1e-6, props.bbox.lat1 - props.bbox.lat0)
  const maxH = Math.min(50, props.rowHeight - 6)
  const maxW = Math.max(16, Math.min(200, width - 16))
  const aspect = lonSpan / latSpan
  let boxW = maxW
  let boxH = maxW / aspect
  if (boxH > maxH) {
    boxH = maxH
    boxW = maxH * aspect
  }
  boxW = Math.max(6, boxW)
  const boxX = (width - boxW) / 2
  const boxYOffset = (props.rowHeight - boxH) / 2

  const pw = Math.max(1, Math.round(boxW * dpr))
  const ph = Math.max(1, Math.round(boxH * dpr))
  const image = new ImageData(pw, ph)
  const backdrop = new Uint8ClampedArray(pw * ph * 4)
  for (let index = 0; index < pw * ph; index += 1) {
    const offset = index * 4
    backdrop[offset] = background.r
    backdrop[offset + 1] = background.g
    backdrop[offset + 2] = background.b
    backdrop[offset + 3] = 255
  }
  const intensity = new Float32Array(pw * ph)
  // A 0.01° cell is sub-pixel in a 1° AOI; stamp at least two CSS pixels so an
  // isolated detection is never a single dark image pixel.
  const stamp = Math.max(1, Math.ceil(2 * dpr))
  const stampHalf = Math.floor(stamp / 2)

  for (const row of props.rows) {
    const cells = props.cells.get(row.commit.id)
    image.data.set(backdrop)
    if (cells && cells.clat.length > 0) {
      intensity.fill(0)
      for (let index = 0; index < cells.clat.length; index += 1) {
        const gx = (cells.clon[index] / 100 - props.bbox.lon0) / lonSpan
        const gy = (props.bbox.lat1 - cells.clat[index] / 100) / latSpan
        if (gx < 0 || gx > 1 || gy < 0 || gy > 1) continue
        const px = Math.min(pw - 1, Math.max(0, Math.floor(gx * pw)))
        const py = Math.min(ph - 1, Math.max(0, Math.floor(gy * ph)))
        const startX = Math.min(Math.max(0, pw - stamp), Math.max(0, px - stampHalf))
        const startY = Math.min(Math.max(0, ph - stamp), Math.max(0, py - stampHalf))
        for (let dy = 0; dy < stamp && startY + dy < ph; dy += 1) {
          const rowOffset = (startY + dy) * pw
          for (let dx = 0; dx < stamp && startX + dx < pw; dx += 1) {
            const offset = rowOffset + startX + dx
            if (cells.frp[index] > intensity[offset]) intensity[offset] = cells.frp[index]
          }
        }
      }
      const max = props.sensorMax[row.commit.sensor]
      const stops = palettes[row.commit.sensor]
      for (let index = 0; index < intensity.length; index += 1) {
        const value = intensity[index]
        if (value <= 0) continue
        const ratio = max > 0 ? Math.min(1, value / max) : 1
        const level = Math.min(LEVELS - 1, Math.max(0, Math.round(Math.sqrt(ratio) * (LEVELS - 1))))
        const offset = index * 4
        image.data[offset] = stops[level * 3]
        image.data[offset + 1] = stops[level * 3 + 1]
        image.data[offset + 2] = stops[level * 3 + 2]
        image.data[offset + 3] = 255
      }
    }

    const x = Math.round(boxX * dpr)
    const y = Math.round((row.y + boxYOffset) * dpr)
    const top = row.y + boxYOffset
    ctx.putImageData(image, x, y)

    const lonStepPx = (0.25 / lonSpan) * boxW
    const latStepPx = (0.25 / latSpan) * boxH
    if (lonStepPx >= 3 || latStepPx >= 3) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(boxX, top, boxW, boxH)
      ctx.clip()
      ctx.beginPath()
      if (lonStepPx >= 3) {
        const firstLon = Math.ceil(props.bbox.lon0 / 0.25) * 0.25
        const steps = Math.floor((props.bbox.lon1 - firstLon) / 0.25)
        for (let step = 0; step <= steps; step += 1) {
          const lon = firstLon + step * 0.25
          const gx = Math.round(boxX + ((lon - props.bbox.lon0) / lonSpan) * boxW) + 0.5
          ctx.moveTo(gx, top)
          ctx.lineTo(gx, top + boxH)
        }
      }
      if (latStepPx >= 3) {
        const firstLat = Math.ceil(props.bbox.lat0 / 0.25) * 0.25
        const steps = Math.floor((props.bbox.lat1 - firstLat) / 0.25)
        for (let step = 0; step <= steps; step += 1) {
          const lat = firstLat + step * 0.25
          const gy = Math.round(top + ((props.bbox.lat1 - lat) / latSpan) * boxH) + 0.5
          ctx.moveTo(boxX, gy)
          ctx.lineTo(boxX + boxW, gy)
        }
      }
      ctx.strokeStyle = theme.grid
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.restore()
    }

    ctx.globalAlpha = 0.7
    ctx.strokeStyle = row.commit.sensor === 'MODIS' ? theme.modis : theme.viirs
    ctx.lineWidth = 1
    ctx.strokeRect(boxX + 0.5, top + 0.5, Math.max(1, boxW - 1), Math.max(1, boxH - 1))
    ctx.globalAlpha = 1
  }
}

watch(
  () => [props.rows, props.height, props.rowHeight, props.bbox, props.cells, props.sensorMax],
  () => void nextTick(draw),
)
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
  <div ref="frame" class="relative w-full" :style="{ height: `${height}px` }">
    <canvas ref="canvas" role="img" :aria-label="label" class="pointer-events-none block" />
  </div>
</template>
