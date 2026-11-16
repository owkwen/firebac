<script setup lang="ts">
import { computed } from 'vue'
import type { RawBinCount } from '@/types/detections'
import { displayBinLabel } from '@/lib/raw'
import { formatInteger } from '@/lib/format'

const props = defineProps<{ bins: RawBinCount[] }>()

const max = computed(() => Math.max(1, ...props.bins.map((bin) => bin.cellDays)))
</script>

<template>
  <div>
    <p class="pb-1 text-2xs uppercase tracking-[0.14em] text-faint">VIIRS-only cell-days by VIIRS detections</p>
    <div class="space-y-1">
      <div v-for="bin in bins" :key="bin.label" class="grid grid-cols-[3.5rem_1fr_5rem] items-center gap-2">
        <span class="font-mono text-2xs text-muted">{{ displayBinLabel(bin.label) }}</span>
        <span class="h-3 bg-sunken" role="presentation">
          <span
            class="block h-3 bg-viirs"
            :style="{ width: `${(bin.cellDays / max) * 100}%` }"
          />
        </span>
        <span class="text-right font-mono text-2xs text-ink tnum">{{ formatInteger(bin.cellDays) }}</span>
      </div>
    </div>
  </div>
</template>
