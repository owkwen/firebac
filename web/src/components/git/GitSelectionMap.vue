<script setup lang="ts">
import { computed } from 'vue'
import type { GeoCollection } from '@/types/geo'
import type { Bbox } from '@/types/git'
import type {
  LonLat,
  MapLayer,
  MapSelection,
  MapSelectionMode,
  RasterLayer,
} from '@/types/map'
import { chartTheme } from '@/lib/colors'
import { GIT_MAP_MIN_SPAN_DEG, normaliseBbox } from '@/lib/git'
import { outlineLayers } from '@/lib/map'
import { rectanglePolygon } from '@/lib/selection'
import MapCanvas from '@/components/map/MapCanvas.vue'

const props = defineProps<{
  outline: GeoCollection | null
  bbox: Bbox | null
  density: RasterLayer | null
  busy: boolean
}>()

const emit = defineEmits<{ 'update:bbox': [bbox: Bbox] }>()

const layers = computed<MapLayer[]>(() => {
  const theme = chartTheme()
  // Context raster only: no hover format and no DOM, so it cannot intercept a
  // drag. It is listed first because it is background, not a data product.
  const list: MapLayer[] = []
  if (props.density) list.push(props.density)
  list.push(...outlineLayers(props.outline, theme.edgeStrong, theme.raised))
  return list
})

const selection = computed<MapSelection>(() => ({
  mode: 'rect',
  polygon: props.bbox
    ? rectanglePolygon(
        { lon: props.bbox.lon0, lat: props.bbox.lat0 },
        { lon: props.bbox.lon1, lat: props.bbox.lat1 },
      )
    : undefined,
}))

function onSelect(polygon: LonLat[], mode: MapSelectionMode): void {
  if (mode !== 'rect' || polygon.length < 4) return
  const lats = polygon.map((point) => point.lat)
  const lons = polygon.map((point) => point.lon)
  const rounded = normaliseBbox(
    Number(Math.min(...lats).toFixed(3)),
    Number(Math.max(...lats).toFixed(3)),
    Number(Math.min(...lons).toFixed(3)),
    Number(Math.max(...lons).toFixed(3)),
  )
  if (rounded.lat1 > rounded.lat0 && rounded.lon1 > rounded.lon0) emit('update:bbox', rounded)
}
</script>

<template>
  <div class="relative h-full w-full">
    <MapCanvas
      :layers="layers"
      :fit="'outline'"
      :fit-padding="0.03"
      :selection="selection"
      :interaction="{ mode: 'box', altPan: true }"
      :graticule="true"
      :labels="true"
      :min-span-deg="GIT_MAP_MIN_SPAN_DEG"
      @select="onSelect"
    />
    <span
      v-if="busy"
      class="pointer-events-none absolute inset-0 grid place-items-center bg-sunken/70 font-mono text-2xs text-muted"
    >
      loading…
    </span>
  </div>
</template>
