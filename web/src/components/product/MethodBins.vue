<script setup lang="ts">
import { computed } from 'vue'
import type { MultiplicityBin } from '@/types/model'

const props = defineProps<{ bins: readonly MultiplicityBin[] }>()

const maxCorrection = computed(() => Math.max(1, ...props.bins.map((bin) => bin.correction)))

function barWidth(bin: MultiplicityBin): string {
  return `${(bin.correction / maxCorrection.value) * 100}%`
}
</script>

<template>
  <table class="w-full border-collapse text-left text-2xs tnum">
    <caption class="sr-only">Correction by VIIRS multiplicity bin</caption>
    <thead>
      <tr class="border-b border-edge-strong text-faint">
        <th scope="col" class="py-1 pr-3 font-normal uppercase tracking-[0.12em]">VIIRS multiplicity</th>
        <th scope="col" class="py-1 pr-3 text-right font-normal uppercase tracking-[0.12em]">P(MODIS | VIIRS)</th>
        <th scope="col" class="py-1 pr-3 text-right font-normal uppercase tracking-[0.12em]">95% CI</th>
        <th scope="col" class="py-1 font-normal uppercase tracking-[0.12em]">1 / P</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="bin in bins" :key="bin.label" class="border-b border-edge/60">
        <td class="py-1 pr-3 font-mono text-ink">{{ bin.label }}</td>
        <td class="py-1 pr-3 text-right font-mono text-ink">{{ bin.p.toFixed(4) }}</td>
        <td class="py-1 pr-3 text-right font-mono text-muted">
          {{ bin.ci[0].toFixed(4) }}–{{ bin.ci[1].toFixed(4) }}
        </td>
        <td class="py-1">
          <span class="flex items-center gap-2">
            <span class="w-12 text-right font-mono text-ink">{{ bin.correction.toFixed(2) }}×</span>
            <span class="h-2 w-24 rounded-[1px] bg-sunken">
              <span class="block h-2 rounded-[1px] bg-accent" :style="{ width: barWidth(bin) }" />
            </span>
          </span>
        </td>
      </tr>
    </tbody>
  </table>
</template>
