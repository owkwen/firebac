<script setup lang="ts">
import { computed } from 'vue'
import type { GridArtifact } from '@/types/grid'
import type { SeriesMode } from '@/types/calendar'
import type { GeoCollection } from '@/types/geo'
import type { GeoExtent, LonLat, MapHover, MapLayer, RasterLayer } from '@/types/map'
import { mapCells } from '@/lib/aggregate'
import { chartTheme, COUNT_RAMP } from '@/lib/colors'
import {
  CALENDAR_MAP_FRAME_HEIGHT_PX,
  CALENDAR_MAP_PADDING_DEG,
  MONTH_NAMES,
  SERIES_LABELS,
} from '@/lib/constants'
import { formatInteger } from '@/lib/format'
import { outlineLayers, rasterValue } from '@/lib/map'
import MapCanvas from '@/components/map/MapCanvas.vue'

const props = defineProps<{
  grid: GridArtifact | null
  year: number
  month: number
  series: SeriesMode
  loading: boolean
  error: string | null
  noSensor: boolean
  outline: GeoCollection | null
}>()

const emit = defineEmits<{ select: [month: number] }>()

interface PaintCell {
  key: string
  lat: number
  lon: number
  value: number
}

const painted = computed<Array<[number, number, number]> | null>(() => {
  const grid = props.grid
  if (!grid || props.noSensor) return null
  const cells = mapCells(grid, props.month, props.series).filter((cell) => cell.value > 0)
  if (cells.length === 0) return null
  return cells.map((cell) => [cell.lat, cell.lon, cell.value] as [number, number, number])
})

const max = computed(() => {
  const cells = painted.value
  return cells ? Math.max(1, ...cells.map((cell) => cell[2])) : 0
})

const raster = computed<RasterLayer | null>(() => {
  const cells = painted.value
  const grid = props.grid
  if (!cells || !grid) return null
  return {
    kind: 'raster',
    cellDeg: grid.step_deg,
    cells,
    ramp: COUNT_RAMP,
    scale: 'log',
    max: max.value,
  }
})

/** Framed on the painted cells, padded. The region's own extent — never a fixed country. */
const bounds = computed<GeoExtent | null>(() => {
  const cells = painted.value
  const grid = props.grid
  if (!cells || !grid) return null
  const half = grid.step_deg / 2
  let minLat = Number.POSITIVE_INFINITY
  let maxLat = Number.NEGATIVE_INFINITY
  let minLon = Number.POSITIVE_INFINITY
  let maxLon = Number.NEGATIVE_INFINITY
  for (const [lat, lon] of cells) {
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
    if (lon < minLon) minLon = lon
    if (lon > maxLon) maxLon = lon
  }
  if (!Number.isFinite(minLat)) return null
  return {
    minLat: minLat - half - CALENDAR_MAP_PADDING_DEG,
    maxLat: maxLat + half + CALENDAR_MAP_PADDING_DEG,
    minLon: minLon - half - CALENDAR_MAP_PADDING_DEG,
    maxLon: maxLon + half + CALENDAR_MAP_PADDING_DEG,
  }
})

const layers = computed<MapLayer[]>(() => {
  const theme = chartTheme()
  const list: MapLayer[] = outlineLayers(props.outline, theme.edgeStrong, theme.raised)
  if (raster.value) list.push(raster.value)
  return list
})

const topCells = computed<PaintCell[]>(() => {
  const cells = painted.value ?? []
  return cells
    .map(([lat, lon, value]) => ({ key: `${lat}:${lon}`, lat, lon, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)
})

const seriesLabel = computed(() => SERIES_LABELS[props.series])
const monthName = computed(() => MONTH_NAMES[props.month - 1])

function hoverText(hover: MapHover): string | null {
  if (hover.value === null) return null
  return `${hover.lat.toFixed(2)}°, ${hover.lon.toFixed(2)}°\n${formatInteger(hover.value)} burning days · ${monthName.value} ${props.year}`
}

/** A click only selects the month when it lands on a painted cell. */
function onProbe(point: LonLat): void {
  const layer = raster.value
  if (layer && rasterValue(layer, point.lon, point.lat) !== null) emit('select', props.month)
}
</script>

<template>
  <div data-map-root class="flex h-full flex-col">
    <h3 class="pb-1 text-2xs font-semibold tracking-[0.04em] text-ink">Map · burning days, 0.25°</h3>
    <div v-if="loading" class="grid w-full place-items-center rounded border border-edge bg-sunken font-mono text-xs text-muted" :style="{ height: `${CALENDAR_MAP_FRAME_HEIGHT_PX}px` }">
      loading
    </div>
    <p v-else-if="error" role="alert" class="grid w-full place-items-center rounded border border-edge bg-sunken px-4 text-center text-xs text-muted" :style="{ height: `${CALENDAR_MAP_FRAME_HEIGHT_PX}px` }">
      No map for {{ year }} — reload to retry.
    </p>
    <div v-else-if="noSensor" class="grid w-full place-items-center rounded border border-dashed border-edge px-4 text-center text-xs text-muted" :style="{ height: `${CALENDAR_MAP_FRAME_HEIGHT_PX}px` }">
      VIIRS starts in 2012.
    </div>
    <div v-else-if="!painted" class="grid w-full place-items-center rounded border border-dashed border-edge px-4 text-center text-xs text-muted" :style="{ height: `${CALENDAR_MAP_FRAME_HEIGHT_PX}px` }">
      No detections in {{ monthName }} {{ year }}.
    </div>
    <MapCanvas
      v-else
      :layers="layers"
      :bounds="bounds ?? undefined"
      :fit-padding="0"
      :selection="{ mode: 'point' }"
      :interaction="{ mode: 'pan' }"
      :interactive="{ zoom: false, pan: false }"
      :graticule="false"
      :labels="false"
      :height="CALENDAR_MAP_FRAME_HEIGHT_PX"
      :hover-format="hoverText"
      @probe="onProbe"
    />

    <div v-if="painted" class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted">
      <span class="flex">
        <span
          v-for="step in COUNT_RAMP"
          :key="step"
          class="h-2.5 w-4"
          :style="{ backgroundColor: step }"
        />
      </span>
      <span class="tnum">0 → {{ formatInteger(max) }} burning days · log scale</span>
      <span class="tnum">{{ painted.length.toLocaleString('en-US') }} cells</span>
      <span class="text-faint">· {{ seriesLabel }}</span>
    </div>

    <p v-if="painted" class="mt-1 text-2xs text-faint">
      southern Canada only · under 0.1% of the record is above 70 °N
    </p>

    <details v-if="painted" class="mt-1.5">
      <summary class="cursor-pointer text-2xs text-muted">Top cells in {{ monthName }} {{ year }}</summary>
      <table class="mt-1 w-full border-collapse text-left text-2xs tnum">
        <caption class="sr-only">Top 10 map cells by burning days</caption>
        <thead>
          <tr class="border-b border-edge-strong text-faint">
            <th scope="col" class="py-1 pr-3 font-normal uppercase tracking-[0.12em]">lat</th>
            <th scope="col" class="py-1 pr-3 font-normal uppercase tracking-[0.12em]">lon</th>
            <th scope="col" class="py-1 text-right font-normal uppercase tracking-[0.12em]">burning days</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="cell in topCells" :key="cell.key" class="border-b border-edge/60">
            <td class="py-1 pr-3 font-mono text-muted">{{ cell.lat.toFixed(2) }}°</td>
            <td class="py-1 pr-3 font-mono text-muted">{{ cell.lon.toFixed(2) }}°</td>
            <td class="py-1 text-right font-mono text-ink">{{ formatInteger(cell.value) }}</td>
          </tr>
        </tbody>
      </table>
    </details>
  </div>
</template>
