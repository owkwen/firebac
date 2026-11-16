<script setup lang="ts">
import { computed } from 'vue'
import EChart from '@/components/charts/EChart.vue'
import { chartTheme } from '@/lib/colors'
import { buildSeasonOption } from '@/lib/productCharts'
import type { SeriesMode } from '@/types/calendar'
import { BASELINE_LABEL } from '@/lib/constants'

const props = defineProps<{
  year: number
  mode: SeriesMode
  values: (number | null)[]
  p25: (number | null)[]
  p75: (number | null)[]
  noSensor: boolean
}>()

const option = computed(() =>
  buildSeasonOption(
    { year: props.year, mode: props.mode, values: props.values, p25: props.p25, p75: props.p75 },
    chartTheme(),
  ),
)

const description = computed(
  () => `Daily cell-days for ${props.year}; band is the p25–p75 of the ${BASELINE_LABEL}.`,
)

const caption = `daily cell-days · p25–p75 band: ${BASELINE_LABEL}`
</script>

<template>
  <div class="flex h-full flex-col">
    <div v-if="noSensor" class="grid h-[400px] place-items-center rounded border border-dashed border-edge px-4 text-center text-xs text-muted">
      No daily series for {{ year }}; VIIRS starts in 2012.
    </div>
    <div v-else class="h-[400px] px-1 pt-1">
      <EChart :option="option" :description="description" />
    </div>
    <p v-if="!noSensor" class="mt-1 border-t border-edge/60 pt-1.5 text-2xs leading-4 text-muted">{{ caption }}</p>
  </div>
</template>
