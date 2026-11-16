<script setup lang="ts">
import { computed } from 'vue'
import EChart from '@/components/charts/EChart.vue'
import PanelShell from '@/components/PanelShell.vue'
import { buildBrightnessOption } from '@/lib/charts'
import { chartTheme } from '@/lib/colors'
import { BRIGHTNESS_BIN_K, VIIRS_SATURATION_K } from '@/lib/constants'
import type { BrightnessData } from '@/types/panels'

const props = defineProps<{ data: BrightnessData | null; loading: boolean }>()

const fourOption = computed(() =>
  props.data ? buildBrightnessOption(props.data.fourMicron, '4um', props.data.ceilingK, chartTheme()) : null,
)
const elevenOption = computed(() =>
  props.data ? buildBrightnessOption(props.data.elevenMicron, '11um', props.data.ceilingK, chartTheme()) : null,
)
const empty = computed(() => {
  if (!props.data) return true
  const series = [...props.data.fourMicron, ...props.data.elevenMicron]
  return series.every((entry) => entry.points.length === 0)
})
const summary = computed(() => {
  const ceiling = props.data?.ceilingK ?? VIIRS_SATURATION_K
  return `Overlaid ${BRIGHTNESS_BIN_K} K histograms: MODIS brightness (band 21/22) against VIIRS bright_ti4 at 4 µm, and bright_t31 against bright_ti5 at 11 µm. The dashed ${ceiling} K line marks VIIRS I4 saturation: values at the line are lower bounds, not measurements.`
})
</script>

<template>
  <PanelShell
    title="Brightness temperature"
    meta="4 µm and 11 µm"
    :summary="summary"
    :loading="loading"
    :empty="empty"
  >
    <div class="grid gap-3 md:grid-cols-2">
      <div>
        <h3 class="mb-1 font-mono text-2xs text-muted">4 µm · brightness vs bright_ti4</h3>
        <div class="h-44">
          <EChart
            v-if="fourOption"
            :option="fourOption"
            description="Overlaid histogram of MODIS brightness and VIIRS bright_ti4 at 4 micrometres, with the 367 kelvin saturation line"
          />
        </div>
      </div>
      <div>
        <h3 class="mb-1 font-mono text-2xs text-muted">11 µm · bright_t31 vs bright_ti5</h3>
        <div class="h-44">
          <EChart
            v-if="elevenOption"
            :option="elevenOption"
            description="Overlaid histogram of MODIS bright_t31 and VIIRS bright_ti5 at 11 micrometres"
          />
        </div>
      </div>
    </div>
  </PanelShell>
</template>
