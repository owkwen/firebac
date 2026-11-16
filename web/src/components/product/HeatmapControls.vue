<script setup lang="ts">
import { computed } from 'vue'
import type { MetricMode, ResolutionMode, SeriesMode } from '@/types/calendar'
import { METRIC_OPTIONS, RESOLUTION_OPTIONS, SERIES_OPTIONS } from '@/lib/constants'
import SegmentedControl from './SegmentedControl.vue'

const props = defineProps<{
  series: SeriesMode
  metric: MetricMode
  resolution: ResolutionMode
}>()

const emit = defineEmits<{
  'update:series': [series: SeriesMode]
  'update:metric': [metric: MetricMode]
  'update:resolution': [resolution: ResolutionMode]
}>()

const metricDisabled = computed(() => props.resolution === 'day')

function setSeries(value: string): void {
  const mode = SERIES_OPTIONS.find((option) => option.value === value)
  if (mode) emit('update:series', mode.value as SeriesMode)
}

function setMetric(value: string): void {
  const mode = METRIC_OPTIONS.find((option) => option.value === value)
  if (mode) emit('update:metric', mode.value as MetricMode)
}

function setResolution(value: string): void {
  const mode = RESOLUTION_OPTIONS.find((option) => option.value === value)
  if (mode) emit('update:resolution', mode.value as ResolutionMode)
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
    <SegmentedControl label="heatmap series" :model-value="series" :options="SERIES_OPTIONS" @update:model-value="setSeries" />
    <div class="flex flex-wrap items-center gap-2">
      <SegmentedControl
        label="heatmap metric"
        :model-value="metric"
        :options="METRIC_OPTIONS"
        :disabled="metricDisabled"
        @update:model-value="setMetric"
      />
    </div>
    <SegmentedControl
      label="heatmap resolution"
      :model-value="resolution"
      :options="RESOLUTION_OPTIONS"
      @update:model-value="setResolution"
    />
  </div>
</template>
