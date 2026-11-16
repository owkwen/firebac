<script setup lang="ts">
import Slider from '@/components/ui/Slider.vue'
import { MODIS_CONFIDENCE_MAX, MODIS_CONFIDENCE_STEP, VIIRS_LEVELS } from '@/lib/constants'
import type { ViirsConfidence } from '@/types/filters'

defineProps<{ modisMin: number; viirsMin: ViirsConfidence }>()
const emit = defineEmits<{
  'update:modisMin': [value: number]
  'update:viirsMin': [value: ViirsConfidence]
}>()
</script>

<template>
  <div class="space-y-2.5">
    <div>
      <div class="mb-1 flex items-baseline justify-between">
        <span class="text-2xs text-muted">MODIS minimum</span>
        <span class="font-mono text-2xs text-ink tnum">≥ {{ modisMin }}</span>
      </div>
      <Slider
        :model-value="modisMin"
        :min="0"
        :max="MODIS_CONFIDENCE_MAX"
        :step="MODIS_CONFIDENCE_STEP"
        label="MODIS minimum confidence percent"
        @update:model-value="emit('update:modisMin', $event)"
      />
    </div>
    <div>
      <div class="mb-1 flex items-baseline justify-between">
        <span class="text-2xs text-muted">VIIRS minimum</span>
        <span class="font-mono text-2xs text-ink">≥ {{ viirsMin }}</span>
      </div>
      <div class="grid grid-cols-3 gap-px overflow-hidden rounded-[var(--radius)] border border-edge">
        <button
          v-for="level in VIIRS_LEVELS"
          :key="level.value"
          type="button"
          class="h-6 text-2xs transition-colors"
          :class="
            viirsMin === level.value
              ? 'bg-viirs text-canvas'
              : 'bg-sunken text-muted hover:bg-raised hover:text-ink'
          "
          :aria-pressed="viirsMin === level.value"
          @click="emit('update:viirsMin', level.value)"
        >
          {{ level.label }}
        </button>
      </div>
    </div>
  </div>
</template>
