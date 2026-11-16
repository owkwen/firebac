<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { DensityYear, DetailRaster } from '@/types/detections'
import type { GeoCollection } from '@/types/geo'
import type {
  GeoExtent,
  LonLat,
  MapHover,
  MapLayer,
  MapSelection,
  MapSelectionMode,
  MapView,
  RasterLayer,
} from '@/types/map'
import type { Selection } from '@/lib/selection'
import { chartTheme, COUNT_RAMP } from '@/lib/colors'
import { RAW_MAP_HEIGHT_PX, densityValue, scopedDensity } from '@/lib/raw'
import { formatInteger } from '@/lib/format'
import {
  BIN_FACTOR,
  binRasterCells,
  grainLabel,
  outlineLayers,
  rasterValue,
  viewExtent,
  type MapLod,
} from '@/lib/map'
import SegmentedControl from '@/components/product/SegmentedControl.vue'
import MapCanvas from '@/components/map/MapCanvas.vue'
import RegionMapLegend from '@/components/region/RegionMapLegend.vue'

const props = defineProps<{
  density: DensityYear | null
  detail: DetailRaster | null
  lod: MapLod
  detailLoading: boolean
  detailMissing: string[]
  detailError: string | null
  outline: GeoCollection | null
  extent: GeoExtent
  selection: Selection | null
  radiusKm: number
  year: number
  scope: string | null
  loading: boolean
  error: string | null
}>()

const emit = defineEmits<{
  select: [selection: Selection]
  painted: [year: number]
  viewport: [extent: GeoExtent, span: number]
  'update:radiusKm': [value: number]
}>()

const RADIUS_OPTIONS = [
  { value: '1', label: '1 km' },
  { value: '5', label: '5 km' },
  { value: '10', label: '10 km' },
  { value: '25', label: '25 km' },
] as const

const frame = ref<HTMLElement | null>(null)
const probe = ref<{ lat: number; lon: number; value: number | null } | null>(null)
let paintedFrame = 0
let currentView: MapView | null = null
let observer: ResizeObserver | null = null

const tiled = computed(() => props.lod !== 'wide')
const detailActive = computed(() => tiled.value && props.detail !== null)

/** The 0.01° tiles at full grain, or 3×3-binned to 0.03° on the client. */
const detailGrain = computed(() => {
  const detail = props.detail
  if (!detail) return null
  if (props.lod !== 'mid') return { cellDeg: detail.cellDeg, cells: detail.cells, max: detail.max }
  return binRasterCells(detail.cells, detail.cellDeg, BIN_FACTOR)
})

const scoped = computed(() =>
  props.density ? scopedDensity(props.density, props.scope) : { max: 0, cells: 0 },
)

const raster = computed<RasterLayer | null>(() => {
  const grain = detailGrain.value
  if (detailActive.value && grain) {
    return {
      kind: 'raster',
      cellDeg: grain.cellDeg,
      cells: grain.cells,
      ramp: COUNT_RAMP,
      scale: 'log',
      max: Math.max(1, grain.max),
    }
  }
  const density = props.density
  if (!density) return null
  const cells: Array<[number, number, number]> = []
  for (let i = 0; i < density.count; i += 1) {
    const value = densityValue(density, i, props.scope)
    if (value > 0) cells.push([density.cells.lat[i], density.cells.lon[i], value])
  }
  if (cells.length === 0) return null
  return {
    kind: 'raster',
    cellDeg: density.stepDeg,
    cells,
    ramp: COUNT_RAMP,
    scale: 'log',
    max: Math.max(1, scoped.value.max),
  }
})

/** The grain that is actually on screen, which lags the target while tiles load. */
const grain = computed(() => (raster.value ? grainLabel(raster.value.cellDeg) : '0.1°'))

const layers = computed<MapLayer[]>(() => {
  const theme = chartTheme()
  const list: MapLayer[] = outlineLayers(props.outline, theme.edgeStrong, theme.raised)
  if (raster.value) list.push(raster.value)
  return list
})

const mapSelection = computed<MapSelection>(() => ({
  mode: 'circle',
  radiusKm: props.radiusKm,
  polygon: props.selection?.polygon,
}))

const overlayLabel = computed(() => {
  const selection = props.selection
  if (!selection || selection.mode !== 'circle') return undefined
  return `${Math.round(selection.radiusKm ?? props.radiusKm)} km`
})

const detailNotice = computed(() => {
  if (!tiled.value || props.detailLoading) return null
  if (props.detailError) return `no detail for this tile · ${props.detailError}`
  if (props.detailMissing.length > 0) return `no detail for this tile · ${props.detailMissing.length} skipped`
  if (!props.detail) return 'no detail for this tile'
  return null
})

const legend = computed(() => ({
  max: raster.value?.max ?? 0,
  cells: raster.value?.cells.length ?? 0,
  detections: detailActive.value && props.detail ? props.detail.detections : null,
  grain: grain.value,
}))

function reportViewport(view: MapView): void {
  currentView = view
  const width = frame.value?.clientWidth ?? 0
  if (width <= 0) return
  emit('viewport', viewExtent(view, width, RAW_MAP_HEIGHT_PX), view.span)
}

function onView(view: MapView): void {
  reportViewport(view)
}

function onSelect(polygon: LonLat[], mode: MapSelectionMode): void {
  if (mode === 'none' || polygon.length < 3) return
  const shape: Selection['mode'] = mode === 'rect' ? 'rectangle' : mode === 'lasso' ? 'lasso' : 'circle'
  emit('select', {
    polygon,
    mode: shape,
    radiusKm: shape === 'circle' ? props.radiusKm : undefined,
  })
}

function onProbe(point: LonLat): void {
  const layer = raster.value
  probe.value = {
    lat: point.lat,
    lon: point.lon,
    value: layer ? rasterValue(layer, point.lon, point.lat) : null,
  }
}

function onHover(hover: MapHover | null): void {
  if (!hover) return
  probe.value = { lat: hover.lat, lon: hover.lon, value: hover.value }
}

watch(
  () => props.density,
  (density) => {
    if (!density) return
    cancelAnimationFrame(paintedFrame)
    paintedFrame = requestAnimationFrame(() => {
      paintedFrame = requestAnimationFrame(() => emit('painted', props.year))
    })
  },
)

onMounted(() => {
  observer = new ResizeObserver(() => {
    if (currentView) reportViewport(currentView)
  })
  if (frame.value) observer.observe(frame.value)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(paintedFrame)
  observer?.disconnect()
  observer = null
})
</script>

<template>
  <section aria-labelledby="raw-map-heading">
    <div class="flex flex-wrap items-end justify-between gap-2 pb-1">
      <div>
        <h2 id="raw-map-heading" class="text-sm font-semibold text-ink">
          Raw detections · {{ grain }} bins
        </h2>
        <p class="font-mono text-2xs text-muted tnum" aria-live="polite">
          <template v-if="probe">
            {{ probe.lat.toFixed(2) }}°, {{ probe.lon.toFixed(2) }}° ·
            {{ probe.value === null ? `no ${grain} bin` : `${formatInteger(probe.value)} detections` }}
          </template>
        </p>
      </div>
      <SegmentedControl
        label="radius"
        :model-value="String(radiusKm)"
        :options="RADIUS_OPTIONS"
        @update:model-value="emit('update:radiusKm', Number($event))"
      />
    </div>

    <div ref="frame" class="w-full">
      <div
        v-if="loading"
        class="grid w-full place-items-center rounded-[var(--radius)] border border-edge bg-sunken font-mono text-xs text-muted"
        :style="{ height: `${RAW_MAP_HEIGHT_PX}px` }"
      >
        loading {{ year }} density…
      </div>
      <p
        v-else-if="error"
        role="alert"
        class="grid w-full place-items-center rounded-[var(--radius)] border border-edge bg-sunken px-4 text-center text-xs text-muted"
        :style="{ height: `${RAW_MAP_HEIGHT_PX}px` }"
      >
        {{ error }}
      </p>
      <div
        v-else-if="!raster"
        class="grid w-full place-items-center rounded-[var(--radius)] border border-dashed border-edge px-4 text-center text-xs text-muted"
        :style="{ height: `${RAW_MAP_HEIGHT_PX}px` }"
      >
        No density raster for {{ year }}.
      </div>
      <MapCanvas
        v-else
        :layers="layers"
        :bounds="extent"
        :fit-padding="0"
        :selection="mapSelection"
        :selection-label="overlayLabel"
        :interaction="{ mode: 'box', altPan: true }"
        :graticule="false"
        :labels="false"
        :height="RAW_MAP_HEIGHT_PX"
        @select="onSelect"
        @probe="onProbe"
        @hover="onHover"
        @view="onView"
      />
    </div>

    <RegionMapLegend
      v-if="raster"
      :max="legend.max"
      :cells="legend.cells"
      :detections="legend.detections"
      :grain="legend.grain"
      :loading="tiled && detailLoading"
      :notice="detailNotice"
    />
    <p v-if="raster && !detailActive && (scope === 'Terra' || scope === 'Aqua')" class="mt-1 text-2xs text-warn">
      0.1° raster is MODIS-level.
    </p>
    <p v-if="raster" class="mt-1 text-2xs text-faint">
      Arctic detections above 70°N are counted in the totals but lie outside this frame.
    </p>
  </section>
</template>
