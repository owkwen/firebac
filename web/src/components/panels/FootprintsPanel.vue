<script setup lang="ts">
import { computed } from 'vue'
import EChart from '@/components/charts/EChart.vue'
import PanelShell from '@/components/PanelShell.vue'
import { buildAreaOption, buildFootprintOption } from '@/lib/charts'
import { chartTheme } from '@/lib/colors'
import { formatDecimal, formatInteger } from '@/lib/format'
import type { FootprintData } from '@/types/panels'

const props = defineProps<{ data: FootprintData | null; loading: boolean }>()

const scatterOption = computed(() => (props.data ? buildFootprintOption(props.data.points, chartTheme()) : null))
const areaOption = computed(() =>
  props.data ? buildAreaOption(props.data.areaBins, props.data.areaCapKm2, chartTheme()) : null,
)
const empty = computed(() => !props.data || props.data.points.length === 0)
const meta = computed(() => (props.data ? `${formatInteger(props.data.points.length)} sampled footprints` : ''))
const summary = computed(() => {
  if (!props.data) return ''
  const parts = props.data.summaries.map(
    (row) =>
      `${row.sensor} median ${formatDecimal(row.medianScan, 2)} × ${formatDecimal(row.medianTrack, 2)} km (${formatDecimal(row.medianArea, 2)} km²)`,
  )
  const note = `Area histogram caps at ${props.data.areaCapKm2} km²; larger areas fold into the last bin.`
  return `scan × track estimates the ground footprint; area is their product. ${parts.join(' · ')}. Scatter and histogram use a sample; medians use all matching rows. ${note}`
})
</script>

<template>
  <PanelShell
    title="Footprints"
    :meta="meta"
    :summary="summary"
    :loading="loading"
    :empty="empty"
  >
    <div class="grid gap-3 md:grid-cols-2">
      <div>
        <h3 class="mb-1 font-mono text-2xs text-muted">scan × track (km)</h3>
        <div class="h-48">
          <EChart
            v-if="scatterOption"
            :option="scatterOption"
            description="Scatter plot of scan against track footprint dimensions in kilometres for MODIS and VIIRS"
          />
        </div>
      </div>
      <div>
        <h3 class="mb-1 font-mono text-2xs text-muted">footprint area (km²)</h3>
        <div class="h-48">
          <EChart
            v-if="areaOption"
            :option="areaOption"
            description="Histogram of footprint area in square kilometres for MODIS and VIIRS"
          />
        </div>
      </div>
    </div>
  </PanelShell>
</template>
