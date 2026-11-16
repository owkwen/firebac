<script setup lang="ts">
import { COUNT_RAMP } from '@/lib/colors'
import { formatInteger } from '@/lib/format'

defineProps<{
  max: number
  cells: number
  /** Non-null only when the active grain counts detections, not burning days. */
  detections: number | null
  /** Active grain, e.g. `0.03°`. The legend names the grain that is drawn. */
  grain: string
  loading: boolean
  notice: string | null
}>()
</script>

<template>
  <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted">
    <span class="flex">
      <span
        v-for="step in COUNT_RAMP"
        :key="step"
        class="h-2.5 w-4"
        :style="{ backgroundColor: step }"
      />
    </span>
    <span class="tnum">0 → {{ formatInteger(max) }} detections · log scale</span>
    <span class="tnum">{{ grain }} bins · {{ formatInteger(cells) }} cells</span>
    <span v-if="detections !== null" class="tnum">
      {{ formatInteger(detections) }} detections
    </span>
    <span v-if="loading" class="font-mono text-faint">loading tiles…</span>
  </div>
  <p v-if="notice" class="mt-1 text-2xs text-warn">{{ notice }}</p>
</template>
