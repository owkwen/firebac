<script setup lang="ts">
import type { MetricMode, ResolutionMode, SeriesMode } from '@/types/calendar'
import { HEAT_RAMPS } from '@/lib/heatmap'
import { formatCompact } from '@/lib/format'

defineProps<{
  metric: MetricMode
  series: SeriesMode
  resolution: ResolutionMode
  harmonizedFrom: number
  countsMin?: number
  countsMax: number
  zLimit: number
}>()
</script>

<template>
  <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-2xs text-muted">
    <div v-if="metric === 'counts'" class="flex items-center gap-1.5">
      <span class="flex">
        <span
          v-for="step in HEAT_RAMPS.counts"
          :key="step"
          class="h-2.5 w-4"
          :style="{ backgroundColor: step }"
        />
      </span>
      <span v-if="resolution === 'day'" class="tnum">
        {{ formatCompact(countsMin ?? 0) }} → {{ formatCompact(countsMax) }} burning days · log scale
      </span>
      <span v-else class="tnum">0 → {{ formatCompact(countsMax) }} burning days · log scale</span>
    </div>
    <span v-if="resolution === 'day'" class="flex items-center gap-1.5">
      <span class="h-2.5 w-4 border border-edge bg-panel" />
      0 = no detection · blank = no such date
    </span>
    <div v-if="metric === 'anomaly'" class="flex items-center gap-1.5">
      <span class="flex">
        <span
          v-for="step in [...HEAT_RAMPS.negative].reverse()"
          :key="step"
          class="h-2.5 w-4"
          :style="{ backgroundColor: step }"
        />
        <span class="h-2.5 w-4 bg-raised" />
        <span
          v-for="step in HEAT_RAMPS.positive"
          :key="step"
          class="h-2.5 w-4"
          :style="{ backgroundColor: step }"
        />
      </span>
      <span class="tnum">z vs normal: −{{ zLimit.toFixed(1) }} · 0 · +{{ zLimit.toFixed(1) }}</span>
    </div>
    <span v-if="series !== 'modis'" class="flex items-center gap-1.5">
      <span class="hatch h-2.5 w-4 bg-raised" />
      no second sensor before {{ harmonizedFrom }}
    </span>
    <template v-if="resolution === 'month'">
      <span class="flex items-center gap-1.5">
        <span class="sparse-swatch h-2.5 w-4 rounded-[2px] bg-raised" />
        sparse = ≤2 days observed
      </span>
      <span class="flex items-center gap-1.5">
        <span class="h-2.5 w-4 border border-dashed border-edge" />
        no data
      </span>
    </template>
  </div>
</template>

<style scoped>
.hatch {
  background-image: repeating-linear-gradient(135deg, var(--edge-strong) 0 1px, transparent 1px 5px);
}

.sparse-swatch {
  background-image: radial-gradient(circle, var(--accent) 0 0.8px, transparent 1px);
  background-size: 4px 4px;
  opacity: 0.65;
}
</style>
