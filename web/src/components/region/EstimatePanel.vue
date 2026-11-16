<script setup lang="ts">
import type { EstimateTotals } from '@/types/detections'
import type { ModelArtifact } from '@/types/model'
import { displayBinLabel } from '@/lib/raw'
import { formatBuildDate, formatInteger } from '@/lib/format'

defineProps<{
  estimate: EstimateTotals | null
  model: ModelArtifact | null
  error: string | null
  loading: boolean
  emptyMessage: string | null
}>()
</script>

<template>
  <section aria-labelledby="estimate-heading" class="flex h-full flex-col rounded-[var(--radius)] border border-edge bg-panel p-3">
    <header class="border-b border-edge pb-2">
      <h2 id="estimate-heading" class="text-sm font-semibold text-ink">EXPECTED</h2>
    </header>

    <p v-if="error" role="alert" class="mt-3 border border-danger/40 px-2 py-1 text-xs text-danger">
      {{ error }}
    </p>
    <p v-else-if="emptyMessage" class="mt-3 text-xs text-muted">{{ emptyMessage }}</p>
    <p v-else-if="loading || !estimate" class="mt-3 text-xs text-muted">loading model/CA.json…</p>

    <template v-else>
      <p class="mt-2 text-[22px] leading-7 font-medium text-ink tnum">
        {{ formatInteger(Math.round(estimate.total)) }}
      </p>
      <p class="text-2xs text-faint">expected MODIS-equivalent cell-days · not a count, never added to RAW</p>

      <div tabindex="0" role="region" aria-label="Estimate term breakdown" class="mt-3 overflow-x-auto scroll-thin focus-visible:outline-2">
        <table class="w-full border-collapse text-2xs tnum">
          <caption class="sr-only">MODIS-present cell-days plus the published probability applied to VIIRS-only cell-days</caption>
          <thead>
            <tr class="border-b border-edge-strong text-faint">
              <th scope="col" class="py-1 pr-2 text-left font-normal uppercase tracking-[0.12em]">term</th>
              <th scope="col" class="py-1 pr-2 text-right font-normal uppercase tracking-[0.12em]">cell-days</th>
              <th scope="col" class="py-1 pr-2 text-right font-normal uppercase tracking-[0.12em]">P</th>
              <th scope="col" class="py-1 text-right font-normal uppercase tracking-[0.12em]">expected</th>
            </tr>
          </thead>
          <tbody>
            <tr class="border-b border-edge/60">
              <th scope="row" class="py-1 pr-1 text-left font-normal text-muted">MODIS present</th>
              <td class="py-1 pr-2 text-right font-mono text-ink">{{ formatInteger(estimate.modisCellDays) }}</td>
              <td class="py-1 pr-2 text-right font-mono text-faint">—</td>
              <td class="py-1 text-right font-mono text-ink">{{ formatInteger(estimate.modisCellDays) }}</td>
            </tr>
            <tr v-for="bin in estimate.bins" :key="bin.label" class="border-b border-edge/60">
              <th scope="row" class="py-1 pr-1 text-left font-normal text-muted">
                VIIRS-only, {{ displayBinLabel(bin.label) }}
              </th>
              <td class="py-1 pr-2 text-right font-mono text-ink">{{ formatInteger(bin.cellDays) }}</td>
              <td class="py-1 pr-2 text-right font-mono text-ink">{{ bin.p.toFixed(4) }}</td>
              <td class="py-1 text-right font-mono text-ink">{{ formatInteger(Math.round(bin.expected)) }}</td>
            </tr>
            <tr class="border-t border-edge-strong">
              <th scope="row" class="py-1 pr-1 text-left font-normal text-ink">total</th>
              <td class="py-1 pr-2 text-right font-mono text-ink">{{ formatInteger(estimate.modisCellDays + estimate.viirsOnlyCellDays) }}</td>
              <td class="py-1 pr-2 text-right font-mono text-faint">—</td>
              <td class="py-1 text-right font-mono text-ink">{{ formatInteger(Math.round(estimate.total)) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="mt-3 border-t border-edge pt-2 text-2xs text-faint">
        P(MODIS present | VIIRS present, multiplicity) · calibrated 2012–2022
        <span v-if="model" class="font-mono"> · model/CA.json · {{ formatBuildDate(model.generated_utc) }}</span>
      </p>
    </template>
  </section>
</template>
