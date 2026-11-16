<script setup lang="ts">
import { computed } from 'vue'
import EChart from '@/components/charts/EChart.vue'
import PanelShell from '@/components/PanelShell.vue'
import { buildModisConfidenceOption, buildViirsConfidenceOption } from '@/lib/charts'
import { chartTheme } from '@/lib/colors'
import { formatInteger, formatPercent } from '@/lib/format'
import type { ConfidenceData } from '@/types/panels'

const props = defineProps<{ data: ConfidenceData | null; loading: boolean }>()

const modisOption = computed(() =>
  props.data ? buildModisConfidenceOption(props.data.modisBins, props.data.modisMin, chartTheme()) : null,
)
const viirsOption = computed(() =>
  props.data ? buildViirsConfidenceOption(props.data.viirs, chartTheme()) : null,
)
const empty = computed(() => {
  if (!props.data) return true
  return props.data.modisBins.length === 0 && props.data.viirs.length === 0
})
const modisSplit = computed(() => props.data?.split.find((row) => row.sensor === 'MODIS') ?? null)
const viirsSplit = computed(() => props.data?.split.find((row) => row.sensor === 'VIIRS') ?? null)
const summary = computed(() => {
  if (!props.data) return ''
  const parts = props.data.split.map(
    (row) => `${row.sensor} ${formatInteger(row.passed)} of ${formatInteger(row.total)} pass (${formatPercent(row.passed, row.total)})`,
  )
  return `Histograms show sensor, date and type matches before the confidence split. Under the chosen split: ${parts.join(' · ')}. MODIS confidence is 0–100%; VIIRS is ordinal l/n/h and the two scales are not the same measurement.`
})
</script>

<template>
  <PanelShell
    title="Confidence"
    meta="split applied live"
    :summary="summary"
    :loading="loading"
    :empty="empty"
  >
    <div class="grid gap-3 md:grid-cols-2">
      <div>
        <div class="mb-1 flex items-baseline justify-between gap-2">
          <h3 class="font-mono text-2xs text-muted">MODIS 0–100</h3>
          <span class="font-mono text-2xs text-ink tnum">
            ≥ {{ data?.modisMin }}: {{ formatInteger(modisSplit?.passed ?? 0) }}/{{ formatInteger(modisSplit?.total ?? 0) }}
          </span>
        </div>
        <div class="h-40">
          <EChart
            v-if="modisOption"
            :option="modisOption"
            description="Histogram of MODIS confidence from zero to one hundred percent with the chosen minimum marked"
          />
        </div>
      </div>
      <div>
        <div class="mb-1 flex items-baseline justify-between gap-2">
          <h3 class="font-mono text-2xs text-muted">VIIRS l/n/h</h3>
          <span class="font-mono text-2xs text-ink tnum">
            ≥ {{ data?.viirsMin }}: {{ formatInteger(viirsSplit?.passed ?? 0) }}/{{ formatInteger(viirsSplit?.total ?? 0) }}
          </span>
        </div>
        <div class="h-40">
          <EChart
            v-if="viirsOption"
            :option="viirsOption"
            description="Bar chart of VIIRS detections by low, nominal and high confidence"
          />
        </div>
      </div>
    </div>
  </PanelShell>
</template>
