<script setup lang="ts">
import { computed } from 'vue'
import EChart from '@/components/charts/EChart.vue'
import PanelShell from '@/components/PanelShell.vue'
import { buildScatterOption } from '@/lib/charts'
import { chartTheme } from '@/lib/colors'
import { formatInteger } from '@/lib/format'
import type { ScatterData } from '@/types/panels'

const props = defineProps<{ data: ScatterData | null; loading: boolean }>()

const option = computed(() => (props.data ? buildScatterOption(props.data, chartTheme()) : null))
const empty = computed(() => !props.data || props.data.points.length === 0)
const meta = computed(() => (props.data ? `${formatInteger(props.data.totalPairs)} co-located pairs` : ''))
const summary = computed(() => {
  if (!props.data) return ''
  return `MODIS brightness against VIIRS bright_ti4 for pairs in the same 0.01° cell-day within ±${props.data.windowMinutes} minutes. Showing ${formatInteger(props.data.points.length)} of ${formatInteger(props.data.totalPairs)} pairs (cap ${formatInteger(props.data.cap)}). The dashed ${props.data.ceilingK} K line is the VIIRS I4 saturation ceiling.`
})
</script>

<template>
  <PanelShell
    title="Co-located scatter"
    :meta="meta"
    :summary="summary"
    :loading="loading"
    :empty="empty"
    empty-message="No MODIS and VIIRS pairs match. Enable both sensors, widen the dates, or relax the confidence split."
  >
    <div class="h-64">
      <EChart
        v-if="option"
        :option="option"
        description="Scatter plot of co-located MODIS brightness against VIIRS bright_ti4, with the 367 kelvin ceiling line"
      />
    </div>
  </PanelShell>
</template>
