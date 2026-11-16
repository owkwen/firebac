<script setup lang="ts">
import type { GeoCollection } from '@/types/geo'
import type { RasterLayer } from '@/types/map'
import type { Bbox, TerminalLine } from '@/types/git'
import { formatInteger } from '@/lib/format'
import { GIT_DENSITY_RAMP } from '@/lib/git'
import GitSelectionMap from './GitSelectionMap.vue'
import GitTerminal from './GitTerminal.vue'

defineProps<{
  outline: GeoCollection | null
  bbox: Bbox | null
  density: RasterLayer | null
  busy: boolean
  lines: readonly TerminalLine[]
  terminalBusy: boolean
}>()

const emit = defineEmits<{
  'update:bbox': [bbox: Bbox]
  submit: [input: string]
}>()
</script>

<template>
  <section aria-label="Map and terminal" class="flex min-h-0 flex-1 flex-col bg-panel">
    <header class="flex shrink-0 items-center gap-2 border-b border-edge px-3 py-1">
      <span class="font-mono text-2xs text-faint">map · drag a box</span>
      <div
        v-if="density"
        class="ml-auto flex items-center gap-1.5 font-mono text-2xs text-faint"
      >
        <span class="tnum">0</span>
        <span
          class="flex h-2 w-16 overflow-hidden rounded-[1px] border border-edge"
          aria-hidden="true"
        >
          <span
            v-for="step in GIT_DENSITY_RAMP"
            :key="step"
            class="h-full flex-1"
            :style="{ backgroundColor: step }"
          />
        </span>
        <span class="tnum">{{ formatInteger(density.max ?? 0) }}</span>
        <span>· 0.1° bin · detections</span>
      </div>
    </header>

    <div class="min-h-0 flex-1 p-1.5">
      <GitSelectionMap
        :outline="outline"
        :bbox="bbox"
        :density="density"
        :busy="busy"
        @update:bbox="emit('update:bbox', $event)"
      />
    </div>

    <div class="h-[128px] shrink-0 border-t border-edge p-1">
      <GitTerminal :lines="lines" :busy="terminalBusy" @submit="emit('submit', $event)" />
    </div>
  </section>
</template>
