<script setup lang="ts">
import { computed } from 'vue'
import EChart from '@/components/charts/EChart.vue'
import PanelShell from '@/components/PanelShell.vue'
import { buildMapOption, mapExtent } from '@/lib/charts'
import { chartTheme } from '@/lib/colors'
import { MAP_FRAME_HEIGHT_PX, MAP_FRAME_MAX_WIDTH_PX } from '@/lib/constants'
import { formatInteger } from '@/lib/format'
import type { MapData } from '@/types/panels'

const props = defineProps<{ data: MapData | null; loading: boolean }>()

const extent = computed(() => (props.data ? mapExtent(props.data.bounds) : null))
const option = computed(() => (props.data ? buildMapOption(props.data, chartTheme()) : null))
const empty = computed(() => !props.data || props.data.points.length === 0)
const meta = computed(() =>
  props.data ? `${formatInteger(props.data.sampled)} of ${formatInteger(props.data.total)} sampled` : '',
)
const frameStyle = computed<Record<string, string>>(() => {
  if (!extent.value) return { height: `${MAP_FRAME_HEIGHT_PX}px`, width: '100%' }
  const spanLon = Math.max(0.5, extent.value.maxLon - extent.value.minLon)
  const spanLat = Math.max(0.5, extent.value.maxLat - extent.value.minLat)
  const ratio = spanLon / spanLat
  const width = Math.min(MAP_FRAME_HEIGHT_PX * ratio, MAP_FRAME_MAX_WIDTH_PX)
  return { width: `${Math.round(width)}px`, height: `${Math.round(width / ratio)}px` }
})
const summary = computed(() => {
  if (!props.data || !extent.value) return ''
  return `${formatInteger(props.data.total)} detections inside lon ${extent.value.minLon.toFixed(2)}…${extent.value.maxLon.toFixed(2)}° and lat ${extent.value.minLat.toFixed(2)}…${extent.value.maxLat.toFixed(2)}°; ${formatInteger(props.data.sampled)} points drawn. Equal degree aspect, no basemap. Points are pixel centres, downsampled per sensor.`
})
</script>

<template>
  <PanelShell title="Map" :meta="meta" :summary="summary" :loading="loading" :empty="empty">
    <div class="flex justify-center">
      <div :style="frameStyle">
        <EChart
          v-if="option"
          :option="option"
          description="Map of downsampled detection pixel centres by longitude and latitude, coloured by sensor"
        />
      </div>
    </div>
  </PanelShell>
</template>
