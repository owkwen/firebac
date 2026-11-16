<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type {
  GeoExtent,
  LonLat,
  MapFit,
  MapHover,
  MapInteractive,
  MapLayer,
  MapSelection,
  MapSelectionMode,
  MapView,
  RasterLayer,
} from '@/types/map'
import type { MapCursor, MapInteraction } from '@/lib/map'
import { chartTheme } from '@/lib/colors'
import {
  AUTO_GRATICULE_SPAN_DEG,
  INSET_HEIGHT_PX,
  INSET_WIDTH_PX,
  MAP_CLICK_MS,
  MAP_CLICK_PX,
  MAP_DOUBLE_CLICK_FACTOR,
  MAP_HOVER_WIDTH_PX,
  MAP_PAN_FRACTION,
  MAP_WHEEL_RATE,
  MAP_ZOOM_STEP,
  RasterLayerPainter,
  clampView,
  drawEdgeLabels,
  drawGraticule,
  drawInset as paintInset,
  drawPoints,
  drawPolygons,
  drawSelection,
  fitBounds,
  mapCursor,
  panView,
  projectView,
  valueAtLayers,
  viewExtent,
  viewFromBounds,
  zoomView,
} from '@/lib/map'
import { circlePolygon, rectanglePolygon } from '@/lib/selection'

const props = withDefaults(
  defineProps<{
    layers: MapLayer[]
    view?: MapView
    /** Explicit fit target; already-padded extents pass fitPadding 0. */
    bounds?: GeoExtent
    fit?: MapFit
    fitPadding?: number
    selection?: MapSelection
    /** Drag behaviour and the cursor that advertises it. */
    interaction?: MapInteraction
    graticule?: boolean | 'auto'
    labels?: boolean
    inset?: boolean
    interactive?: MapInteractive
    minSpanDeg?: number
    maxSpanDeg?: number
    height?: number
    hoverFormat?: (hover: MapHover) => string | null
    /** Text drawn at the selection centroid; the page owns the wording. */
    selectionLabel?: string
  }>(),
  {
    view: undefined,
    bounds: undefined,
    fit: 'layer',
    fitPadding: 0.08,
    selection: () => ({ mode: 'none' }),
    interaction: () => ({ mode: 'pan' }),
    graticule: 'auto',
    labels: true,
    inset: false,
    interactive: () => ({ zoom: true, pan: true }),
    minSpanDeg: 0.05,
    maxSpanDeg: 180,
    height: undefined,
    hoverFormat: undefined,
    selectionLabel: undefined,
  },
)

const emit = defineEmits<{
  select: [polygon: LonLat[], mode: MapSelectionMode]
  probe: [point: LonLat]
  hover: [hover: MapHover | null]
  view: [view: MapView]
}>()

const root = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const insetCanvas = ref<HTMLCanvasElement | null>(null)
const size = ref({ width: 0, height: 0 })
const view = ref<MapView | null>(null)
const hover = ref<MapHover | null>(null)
const hoverAt = ref({ x: 0, y: 0 })
const preview = ref<LonLat[] | null>(null)
const dismissed = ref(false)
const panning = ref(false)
const altHeld = ref(false)
const rasterPainters = new WeakMap<RasterLayer, RasterLayerPainter>()
let drag: DragState | null = null
let observer: ResizeObserver | null = null
let frameId = 0
let lastSignature = ''
let emittedView = ''
let userAdjusted = false

/** Static classes so Tailwind keeps every cursor in the build. */
const CURSOR_CLASS: Record<MapCursor, string> = {
  grab: 'cursor-grab',
  grabbing: 'cursor-grabbing',
  crosshair: 'cursor-crosshair',
  pointer: 'cursor-pointer',
}

interface DragState {
  kind: 'pan' | 'select'
  startX: number
  startY: number
  startLon: number
  startLat: number
  lastX: number
  lastY: number
  started: number
  shift: boolean
  moved: boolean
  trace: LonLat[]
}

const showGraticule = computed(
  () =>
    props.graticule === true ||
    (props.graticule === 'auto' && view.value !== null && view.value.span <= AUTO_GRATICULE_SPAN_DEG),
)

const layerSummary = computed(() => {
  let raster = 0
  let points = 0
  let polygons = 0
  for (const layer of props.layers) {
    if (layer.kind === 'raster') raster += layer.cells.length
    else if (layer.kind === 'points') points += Math.min(layer.lat.length, layer.lon.length)
    else polygons += 1
  }
  return { raster, points, polygons }
})

const canvasLabel = computed(() => {
  const current = view.value
  if (!current) return 'Map. No view yet.'
  const lon = `${Math.abs(current.lon).toFixed(1)}°${current.lon >= 0 ? 'E' : 'W'}`
  const lat = `${Math.abs(current.lat).toFixed(1)}°${current.lat >= 0 ? 'N' : 'S'}`
  const { raster, points, polygons } = layerSummary.value
  const controls =
    props.interactive.zoom || props.interactive.pan
      ? ' Use plus and minus to zoom, arrow keys to pan, Escape to clear the selection.'
      : ''
  return `Map centred at ${lat}, ${lon}, showing ${current.span.toFixed(1)}° of longitude. ${raster} raster cells, ${points} points, ${polygons} shapes.${controls}`
})

const hoverText = computed(() => {
  if (!hover.value || !props.hoverFormat) return null
  return props.hoverFormat(hover.value)
})

const hoverStyle = computed(() => {
  const width = size.value.width
  const x = Math.min(Math.max(8, hoverAt.value.x + 12), Math.max(8, width - MAP_HOVER_WIDTH_PX))
  const y = Math.max(8, hoverAt.value.y + 12)
  return { left: `${x}px`, top: `${y}px` }
})

const rootStyle = computed(() => ({
  height: props.height === undefined ? '100%' : `${props.height}px`,
  touchAction: 'none',
}))

/** Exact centre and span; the aria label only rounds, QA needs the number the canvas uses. */
const viewSignature = computed(() => {
  const current = view.value
  return current
    ? `${current.lon.toFixed(5)},${current.lat.toFixed(5)},${current.span.toFixed(6)}`
    : ''
})

/**
 * The cursor is derived, never toggled by hand: pan reads as grab, a selection
 * drag as a crosshair, a selectable cell as a link, and Alt as the pan it
 * becomes. Held Alt changes it on keydown, not on the next pointer move.
 */
const cursorClass = computed(() => {
  const selectable = hover.value !== null && hover.value.value !== null
  // A map with neither pan nor zoom has nowhere to grab; only a cell gets a pointer.
  if (!props.interactive.pan && !props.interactive.zoom && !selectable) return 'cursor-default'
  return CURSOR_CLASS[
    mapCursor(props.interaction, {
      panning: panning.value,
      alt: altHeld.value,
      selectable,
    })
  ]
})

function selectionPolygon(): LonLat[] | null {
  if (preview.value) return preview.value
  if (dismissed.value) return null
  return props.selection.polygon ?? null
}

const fitSignature = computed(() => {
  const selection = props.fit === 'bbox' ? props.selection.polygon : undefined
  const bounds =
    props.bounds ?? (props.fit === 'none' ? null : fitBounds(props.layers, props.fit, selection))
  const rounded = bounds
    ? [bounds.minLat, bounds.maxLat, bounds.minLon, bounds.maxLon]
        .map((value) => Math.round(value * 100) / 100)
        .join(',')
    : 'none'
  const explicit = props.view
    ? [props.view.lon, props.view.lat, props.view.span].map((value) => value.toFixed(3)).join(',')
    : 'none'
  return `${props.fit}|${props.bounds ? 'bounds' : 'auto'}|${rounded}|${explicit}|${props.fitPadding}`
})

/** Report every view the canvas settles on, including the initial fit and a reset. */
function emitView(): void {
  const current = view.value
  if (!current) return
  const signature = viewSignature.value
  if (signature === emittedView) return
  emittedView = signature
  emit('view', current)
}

function ensureView(force = false): void {
  const key = fitSignature.value
  if (!force && view.value && key === lastSignature) return
  if (key !== lastSignature) userAdjusted = false
  lastSignature = key
  const minSpan = props.minSpanDeg
  const maxSpan = props.maxSpanDeg
  if (props.bounds) {
    view.value = viewFromBounds(props.bounds, size.value.width, size.value.height, props.fitPadding, minSpan, maxSpan)
  } else if (props.view) {
    view.value = clampView(props.view, size.value.width, size.value.height, minSpan, maxSpan)
  } else {
    const selection = props.fit === 'bbox' ? props.selection.polygon : undefined
    const bounds = fitBounds(props.layers, props.fit, selection)
    view.value = bounds
      ? viewFromBounds(bounds, size.value.width, size.value.height, props.fitPadding, minSpan, maxSpan)
      : { lon: 0, lat: 0, span: maxSpan }
  }
}

function projection(width: number, height: number) {
  const current = view.value
  return current ? projectView(current, width, height) : null
}

function scheduleDraw(): void {
  if (frameId) return
  frameId = requestAnimationFrame(draw)
}

function drawInset(): void {
  const element = insetCanvas.value
  const current = view.value
  if (!element || !current) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  element.width = Math.round(INSET_WIDTH_PX * dpr)
  element.height = Math.round(INSET_HEIGHT_PX * dpr)
  const context = element.getContext('2d')
  if (!context) return
  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  paintInset(
    context,
    INSET_WIDTH_PX,
    INSET_HEIGHT_PX,
    props.layers,
    viewExtent(current, size.value.width, size.value.height),
    chartTheme(),
  )
}

function draw(): void {
  frameId = 0
  const element = canvas.value
  const container = root.value
  if (!element || !container) return
  const width = Math.max(1, container.clientWidth)
  const height = Math.max(1, container.clientHeight)
  const wasEmpty = size.value.width <= 1 || size.value.height <= 1
  const resized = width !== size.value.width || height !== size.value.height
  size.value = { width, height }
  // A pane mounted while hidden (Git tabs) fits at 1×1; refit once it has a real size.
  if (wasEmpty && width > 1 && height > 1) lastSignature = ''
  // Old maps re-framed on resize; keep that until the reader chooses a zoom.
  else if (resized && !userAdjusted) lastSignature = ''
  ensureView()
  const dpr = window.devicePixelRatio || 1
  const pixelWidth = Math.round(width * dpr)
  const pixelHeight = Math.round(height * dpr)
  // Reassigning the size clears the surface, so only do it when it changed.
  if (element.width !== pixelWidth) element.width = pixelWidth
  if (element.height !== pixelHeight) element.height = pixelHeight
  const ctx = element.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const theme = chartTheme()
  ctx.fillStyle = theme.sunken
  ctx.fillRect(0, 0, width, height)
  const current = view.value
  const project = projection(width, height)
  if (!project || !current) return

  drawPolygons(ctx, props.layers, project)
  if (showGraticule.value) drawGraticule(ctx, project, width, height, theme)
  const signature = `${current.lon.toFixed(5)}|${current.lat.toFixed(5)}|${current.span.toFixed(6)}|${width}x${height}|${dpr}`
  for (const layer of props.layers) {
    if (layer.kind === 'raster') {
      let painter = rasterPainters.get(layer)
      if (!painter) {
        painter = new RasterLayerPainter()
        rasterPainters.set(layer, painter)
      }
      painter.draw(ctx, layer, project, width, height, dpr, signature)
    } else if (layer.kind === 'points') {
      drawPoints(ctx, layer, project)
    }
  }
  const polygon = selectionPolygon()
  if (polygon) drawSelection(ctx, polygon, project, theme, props.selectionLabel)
  drawInset()
  if (showGraticule.value && props.labels) drawEdgeLabels(ctx, project, width, height, theme)
  emitView()
}

function locate(event: { clientX: number; clientY: number }): { x: number; y: number; lon: number; lat: number } | null {
  const element = canvas.value
  const project = projection(size.value.width, size.value.height)
  if (!element || !project) return null
  const rect = element.getBoundingClientRect()
  const x = Math.min(rect.width, Math.max(0, event.clientX - rect.left))
  const y = Math.min(rect.height, Math.max(0, event.clientY - rect.top))
  return { x, y, lon: project.toLon(x), lat: project.toLat(y) }
}

function updateHover(hit: { x: number; y: number; lon: number; lat: number }): void {
  const value = valueAtLayers(props.layers, hit.lon, hit.lat)
  hover.value = { lat: hit.lat, lon: hit.lon, value }
  hoverAt.value = { x: hit.x, y: hit.y }
  emit('hover', hover.value)
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0 && event.button !== 1) return
  const hit = locate(event)
  if (!hit) return
  altHeld.value = event.altKey
  const box = props.interaction.mode === 'box'
  const altPan = props.interaction.altPan ?? true
  // Middle button and Alt always pan; otherwise only a pan-mode map pans on drag.
  const pan =
    props.interactive.pan &&
    (event.button === 1 || !box || (altPan && event.altKey))
  // Only a box map turns a drag into a selection; elsewhere an unpannable drag
  // is a click, so a static map cannot paint a phantom rectangle.
  const selecting = box && !pan
  event.preventDefault()
  canvas.value?.setPointerCapture(event.pointerId)
  dismissed.value = false
  preview.value = null
  panning.value = pan
  drag = {
    kind: selecting ? 'select' : 'pan',
    startX: hit.x,
    startY: hit.y,
    startLon: hit.lon,
    startLat: hit.lat,
    lastX: hit.x,
    lastY: hit.y,
    started: performance.now(),
    shift: event.shiftKey,
    moved: false,
    trace: [{ lon: hit.lon, lat: hit.lat }],
  }
}

function onPointerMove(event: PointerEvent): void {
  altHeld.value = event.altKey
  const hit = locate(event)
  if (!hit) return
  if (!drag) {
    updateHover(hit)
    return
  }
  const distance = Math.hypot(hit.x - drag.startX, hit.y - drag.startY)
  if (distance > MAP_CLICK_PX) drag.moved = true
  if (drag.kind === 'pan') {
    if (drag.moved && props.interactive.pan && view.value) {
      view.value = panView(
        view.value,
        hit.x - drag.lastX,
        hit.y - drag.lastY,
        size.value.width,
        size.value.height,
        props.minSpanDeg,
        props.maxSpanDeg,
      )
      userAdjusted = true
      emit('view', view.value)
    }
    drag.lastX = hit.x
    drag.lastY = hit.y
    scheduleDraw()
    return
  }
  if (drag.shift && props.selection.mode !== 'rect') {
    if (Math.hypot(hit.x - drag.lastX, hit.y - drag.lastY) >= 2) {
      drag.trace.push({ lon: hit.lon, lat: hit.lat })
      drag.lastX = hit.x
      drag.lastY = hit.y
      if (drag.trace.length >= 3) preview.value = drag.trace.slice()
    }
  } else if (drag.moved) {
    preview.value = rectanglePolygon(
      { lon: drag.startLon, lat: drag.startLat },
      { lon: hit.lon, lat: hit.lat },
    )
  }
  scheduleDraw()
}

function onPointerUp(event: PointerEvent): void {
  if (!drag) return
  const hit = locate(event)
  const finished = drag
  drag = null
  panning.value = false
  canvas.value?.releasePointerCapture(event.pointerId)
  if (!hit) {
    preview.value = null
    scheduleDraw()
    return
  }
  const distance = Math.hypot(hit.x - finished.startX, hit.y - finished.startY)
  const clicked = distance < MAP_CLICK_PX && performance.now() - finished.started < MAP_CLICK_MS
  preview.value = null

  if (clicked) {
    emit('probe', { lon: hit.lon, lat: hit.lat })
    if (finished.kind === 'select' && props.selection.mode === 'circle') {
      emit(
        'select',
        circlePolygon({ lon: hit.lon, lat: hit.lat }, props.selection.radiusKm ?? 5),
        'circle',
      )
    }
  } else if (finished.kind === 'select' && finished.shift && props.selection.mode !== 'rect') {
    if (finished.trace.length >= 3) emit('select', finished.trace.slice(), 'lasso')
  } else if (finished.kind === 'select' && distance >= MAP_CLICK_PX) {
    emit(
      'select',
      rectanglePolygon(
        { lon: finished.startLon, lat: finished.startLat },
        { lon: hit.lon, lat: hit.lat },
      ),
      'rect',
    )
  }
  scheduleDraw()
}

function onPointerCancel(): void {
  drag = null
  preview.value = null
  panning.value = false
  scheduleDraw()
}

function onPointerLeave(): void {
  if (drag) return
  hover.value = null
  emit('hover', null)
}

function zoomAt(factor: number, x: number, y: number): void {
  if (!view.value || !props.interactive.zoom) return
  view.value = zoomView(
    view.value,
    factor,
    { x, y },
    size.value.width,
    size.value.height,
    props.minSpanDeg,
    props.maxSpanDeg,
  )
  userAdjusted = true
  emit('view', view.value)
  scheduleDraw()
}

function onWheel(event: WheelEvent): void {
  if (!props.interactive.zoom) return
  event.preventDefault()
  const hit = locate(event)
  const x = hit?.x ?? size.value.width / 2
  const y = hit?.y ?? size.value.height / 2
  const delta = Math.min(240, Math.max(-240, event.deltaY))
  zoomAt(Math.exp(delta * MAP_WHEEL_RATE), x, y)
}

function onDoubleClick(event: MouseEvent): void {
  const hit = locate(event)
  if (!hit || !props.interactive.zoom) return
  zoomAt(MAP_DOUBLE_CLICK_FACTOR, hit.x, hit.y)
}

function zoomButton(factor: number): void {
  zoomAt(factor, size.value.width / 2, size.value.height / 2)
}

function resetView(): void {
  userAdjusted = false
  ensureView(true)
  scheduleDraw()
}

function panBy(fractionX: number, fractionY: number): void {
  if (!view.value) return
  view.value = panView(
    view.value,
    -fractionX * size.value.width,
    -fractionY * size.value.height,
    size.value.width,
    size.value.height,
    props.minSpanDeg,
    props.maxSpanDeg,
  )
  userAdjusted = true
  emit('view', view.value)
  scheduleDraw()
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    dismissed.value = true
    preview.value = null
    emit('select', [], 'none')
    scheduleDraw()
    event.preventDefault()
    return
  }
  if (!props.interactive.zoom && !props.interactive.pan) return
  const key = event.key
  if (key === '+' || key === '=') zoomButton(1 / MAP_ZOOM_STEP)
  else if (key === '-' || key === '_') zoomButton(MAP_ZOOM_STEP)
  else if (key === 'ArrowLeft') panBy(MAP_PAN_FRACTION, 0)
  else if (key === 'ArrowRight') panBy(-MAP_PAN_FRACTION, 0)
  else if (key === 'ArrowUp') panBy(0, MAP_PAN_FRACTION)
  else if (key === 'ArrowDown') panBy(0, -MAP_PAN_FRACTION)
  else return
  event.preventDefault()
}

/** Alt changes the promised gesture as soon as it is pressed, not on the next move. */
function onAltKey(event: KeyboardEvent): void {
  if (event.key !== 'Alt') return
  altHeld.value = event.type === 'keydown'
}

function onWindowBlur(): void {
  altHeld.value = false
}

watch(fitSignature, () => {
  lastSignature = ''
  dismissed.value = false
  scheduleDraw()
})
watch(
  () => props.selection.polygon,
  () => {
    dismissed.value = false
    scheduleDraw()
  },
)
watch(() => props.layers, scheduleDraw)

onMounted(() => {
  observer = new ResizeObserver(() => scheduleDraw())
  if (root.value) observer.observe(root.value)
  window.addEventListener('keydown', onAltKey)
  window.addEventListener('keyup', onAltKey)
  window.addEventListener('blur', onWindowBlur)
  scheduleDraw()
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
  if (frameId) cancelAnimationFrame(frameId)
  frameId = 0
  window.removeEventListener('keydown', onAltKey)
  window.removeEventListener('keyup', onAltKey)
  window.removeEventListener('blur', onWindowBlur)
})
</script>

<template>
  <div
    ref="root"
    data-map-canvas
    :data-map-view="viewSignature"
    class="relative overflow-hidden rounded-[var(--radius)] border border-edge bg-sunken"
    :style="rootStyle"
  >
    <canvas
      ref="canvas"
      data-map-surface
      role="img"
      tabindex="0"
      :aria-label="canvasLabel"
      class="block h-full w-full touch-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
      :class="cursorClass"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
      @pointerleave="onPointerLeave"
      @wheel="onWheel"
      @dblclick="onDoubleClick"
      @keydown="onKeydown"
    />

    <div
      v-if="interactive.zoom"
      data-map-controls
      class="absolute right-1.5 top-1.5 flex flex-col gap-0.5"
      @pointerdown.stop
      @wheel.stop
    >
      <button
        type="button"
        aria-label="Zoom in"
        class="grid h-6 w-6 place-items-center rounded-[2px] border border-edge bg-panel/90 font-mono text-xs text-muted hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
        @click="zoomButton(1 / MAP_ZOOM_STEP)"
      >
        +
      </button>
      <button
        type="button"
        aria-label="Zoom out"
        class="grid h-6 w-6 place-items-center rounded-[2px] border border-edge bg-panel/90 font-mono text-xs text-muted hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
        @click="zoomButton(MAP_ZOOM_STEP)"
      >
        −
      </button>
      <button
        type="button"
        aria-label="Reset view"
        class="grid h-6 w-6 place-items-center rounded-[2px] border border-edge bg-panel/90 font-mono text-[9px] text-muted hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
        @click="resetView"
      >
        ⟲
      </button>
    </div>

    <div
      v-if="hoverText"
      class="pointer-events-none absolute z-10 max-w-[260px] whitespace-pre-line rounded-[var(--radius)] border border-edge-strong bg-panel px-2 py-1 text-2xs text-ink"
      :style="hoverStyle"
    >
      {{ hoverText }}
    </div>

    <canvas
      v-if="inset"
      ref="insetCanvas"
      data-map-inset
      aria-hidden="true"
      class="pointer-events-none absolute bottom-2 right-2 h-24 w-[148px] rounded-[2px] border border-edge bg-panel"
    />
  </div>
</template>
