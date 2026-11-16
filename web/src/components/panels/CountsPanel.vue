<script setup lang="ts">
import { computed } from 'vue'
import EChart from '@/components/charts/EChart.vue'
import PanelShell from '@/components/PanelShell.vue'
import { buildDailyOption } from '@/lib/charts'
import { chartTheme } from '@/lib/colors'
import { formatInteger, formatRange } from '@/lib/format'
import type { CountsData } from '@/types/panels'

const props = defineProps<{ data: CountsData | null; loading: boolean }>()

const option = computed(() => (props.data ? buildDailyOption(props.data.daily, chartTheme()) : null))
const empty = computed(() => !props.data || props.data.total === 0)
const meta = computed(() => (props.data ? `${formatInteger(props.data.total)} detections` : ''))
const summary = computed(() => {
  if (!props.data) return ''
  if (props.data.total === 0) return 'No detections match these filters.'
  const parts = props.data.bySensor.map(
    (row) => `${row.sensor} ${formatInteger(row.count)} (${formatRange(row.firstDay, row.lastDay)})`,
  )
  return `${parts.join(' · ')}. Counts are raw FIRMS detections after filters; a detection is one hot pixel.`
})
</script>

<template>
  <PanelShell
    title="Counts"
    :meta="meta"
    :summary="summary"
    :loading="loading"
    :empty="empty"
  >
    <div class="grid grid-cols-2 gap-2">
      <div v-for="row in data?.bySensor ?? []" :key="row.sensor" class="rounded border border-edge bg-sunken/50 px-2 py-1.5">
        <div class="flex items-baseline justify-between gap-2">
          <span class="text-2xs font-medium" :class="row.sensor === 'MODIS' ? 'text-modis' : 'text-viirs'">
            {{ row.sensor }}
          </span>
          <span class="font-mono text-sm text-ink tnum">{{ formatInteger(row.count) }}</span>
        </div>
        <p class="font-mono text-2xs text-faint">{{ formatRange(row.firstDay, row.lastDay) }}</p>
      </div>
    </div>
    <div class="mt-2 h-36">
      <EChart
        v-if="option"
        :option="option"
        description="Line chart of detections per day for each selected sensor"
      />
    </div>
  </PanelShell>
</template>
