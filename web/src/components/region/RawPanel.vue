<script setup lang="ts">
import { computed } from 'vue'
import type { RawAggregate } from '@/types/detections'
import BinHistogram from './BinHistogram.vue'
import { formatInteger } from '@/lib/format'

const props = defineProps<{
  raw: RawAggregate
  tableTotal: number
  year: number
  satelliteLevel: boolean
}>()

const excluded = computed(() =>
  props.raw.source === 'celldays' && !props.satelliteLevel
    ? Math.max(0, props.tableTotal - props.raw.detections)
    : 0,
)
</script>

<template>
  <section aria-labelledby="raw-heading" class="flex h-full flex-col rounded-[var(--radius)] border border-edge bg-panel p-3">
    <header class="border-b border-edge pb-2">
      <h2 id="raw-heading" class="text-sm font-semibold text-ink">RAW</h2>
      <p class="text-2xs text-muted">what the satellite detected in {{ year }}</p>
    </header>

    <dl class="mt-2 text-xs">
      <div class="flex items-baseline justify-between border-b border-edge/60 py-1">
        <dt class="text-muted">detections with FRP &gt; 0</dt>
        <dd class="font-mono text-ink tnum">{{ formatInteger(raw.detections) }}</dd>
      </div>
      <div class="flex items-baseline justify-between border-b border-edge/60 py-1">
        <dt class="text-muted">cell-days, 0.01°</dt>
        <dd class="font-mono text-ink tnum">
          {{ raw.cellDays === null ? '—' : formatInteger(raw.cellDays) }}
        </dd>
      </div>
      <div class="flex items-baseline justify-between border-b border-edge/60 py-1">
        <dt class="text-muted">FRP sum</dt>
        <dd class="font-mono text-ink tnum">
          {{ raw.frp === null ? '—' : `${formatInteger(Math.round(raw.frp))} MW` }}
        </dd>
      </div>
    </dl>

    <table class="mt-2 w-full border-collapse text-2xs tnum">
      <caption class="sr-only">Raw MODIS and VIIRS cell-days and detections</caption>
      <thead>
        <tr class="border-b border-edge-strong text-faint">
          <th scope="col" class="py-1 text-left font-normal uppercase tracking-[0.12em]">sensor</th>
          <th scope="col" class="py-1 text-right font-normal uppercase tracking-[0.12em]">cell-days</th>
          <th scope="col" class="py-1 text-right font-normal uppercase tracking-[0.12em]">detections</th>
        </tr>
      </thead>
      <tbody>
        <tr class="border-b border-edge/60">
          <th scope="row" class="py-1 text-left font-normal text-modis">MODIS</th>
          <td class="py-1 text-right font-mono text-ink">
            {{ raw.modisCellDays === null ? '—' : formatInteger(raw.modisCellDays) }}
          </td>
          <td class="py-1 text-right font-mono text-ink">{{ formatInteger(raw.modisDetections) }}</td>
        </tr>
        <tr class="border-b border-edge/60">
          <th scope="row" class="py-1 text-left font-normal text-viirs">VIIRS</th>
          <td class="py-1 text-right font-mono text-ink">
            {{ raw.viirsCellDays === null ? '—' : formatInteger(raw.viirsCellDays) }}
          </td>
          <td class="py-1 text-right font-mono text-ink">{{ formatInteger(raw.viirsDetections) }}</td>
        </tr>
      </tbody>
    </table>

    <div v-if="raw.bins.length > 0" class="mt-3">
      <BinHistogram :bins="raw.bins" />
    </div>

    <p v-if="satelliteLevel" class="mt-auto pt-2 text-2xs text-warn">
      Cell-days are MODIS-level; the row table is satellite-level.
    </p>
    <p v-else-if="excluded > 0" class="mt-auto pt-2 text-2xs text-faint">
      {{ formatInteger(excluded) }} rows with FRP ≤ 0 are excluded from cell-days.
    </p>
  </section>
</template>
