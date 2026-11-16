<script setup lang="ts">
import type { GitSensor } from '@/types/git'
import { formatInteger } from '@/lib/format'

defineProps<{ sensorMax: Record<GitSensor, number> }>()
</script>

<template>
  <div class="flex items-center gap-3 whitespace-nowrap font-mono text-2xs">
    <span
      v-for="sensor in (['MODIS', 'VIIRS'] as const)"
      :key="sensor"
      class="flex items-center gap-1"
    >
      <span
        class="h-2 w-2 rounded-[1px]"
        :class="sensor === 'MODIS' ? 'bg-modis' : 'bg-viirs'"
        aria-hidden="true"
      />
      <span :class="sensor === 'MODIS' ? 'text-modis' : 'text-viirs'">{{ sensor }}</span>
      <span class="tnum text-muted">max {{ formatInteger(sensorMax[sensor]) }} MW</span>
    </span>
  </div>
</template>
