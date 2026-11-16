<script setup lang="ts">
import { computed } from 'vue'
import type { RawTablePage } from '@/types/detections'
import { satelliteLabel } from '@/lib/raw'
import { formatInteger } from '@/lib/format'

const props = defineProps<{
  page: RawTablePage | null
  loading: boolean
  error: string | null
  idleReason: string | null
  contextLabel: string
}>()

const countLabel = computed(() => {
  if (!props.page) return 'no page loaded'
  if (props.page.total === 0) return 'no detections in this selection'
  return `showing ${formatInteger(props.page.rows.length)} of ${formatInteger(props.page.total)} detections`
})

function decimals(value: number | null, digits: number): string {
  return value === null || !Number.isFinite(value) ? '—' : value.toFixed(digits)
}
</script>

<template>
  <section aria-labelledby="raw-table-heading" class="rounded-[var(--radius)] border border-edge bg-panel">
    <header class="flex flex-wrap items-baseline justify-between gap-2 border-b border-edge px-3 py-2">
      <div>
        <h2 id="raw-table-heading" class="text-sm font-semibold text-ink">Detection rows</h2>
        <p class="text-2xs text-muted">{{ contextLabel }}</p>
      </div>
      <p aria-live="polite" class="font-mono text-2xs text-muted tnum">{{ countLabel }}</p>
    </header>

    <p v-if="error" role="alert" class="px-3 py-3 text-xs text-danger">{{ error }}</p>
    <p v-else-if="loading && !page" class="px-3 py-3 text-xs text-muted">loading rows…</p>
    <p v-else-if="idleReason" class="px-3 py-3 text-xs text-muted">{{ idleReason }}</p>
    <p v-else-if="!page || page.rows.length === 0" class="px-3 py-3 text-xs text-muted">
      No detections in this selection.
    </p>
    <div v-else tabindex="0" role="region" aria-label="Raw detection rows, newest first" class="max-h-[360px] overflow-auto scroll-thin focus-visible:outline-2">
      <table class="w-full border-collapse text-left text-2xs">
        <caption class="sr-only">
          Newest {{ page.rows.length }} raw detections in {{ contextLabel }}. Times are UTC.
        </caption>
        <thead class="sticky top-0 bg-raised">
          <tr class="border-b border-edge-strong text-faint">
            <th scope="col" class="px-2 py-1.5 text-left font-normal uppercase tracking-[0.12em]">time (UTC)</th>
            <th scope="col" class="px-2 py-1.5 text-right font-normal uppercase tracking-[0.12em]">lat</th>
            <th scope="col" class="px-2 py-1.5 text-right font-normal uppercase tracking-[0.12em]">lon</th>
            <th scope="col" class="px-2 py-1.5 text-right font-normal uppercase tracking-[0.12em]">bright 4 µm</th>
            <th scope="col" class="px-2 py-1.5 text-left font-normal uppercase tracking-[0.12em]">confidence</th>
            <th scope="col" class="px-2 py-1.5 text-right font-normal uppercase tracking-[0.12em]">FRP</th>
            <th scope="col" class="px-2 py-1.5 text-left font-normal uppercase tracking-[0.12em]">satellite</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in page.rows" :key="`${row.time}-${row.lat}-${row.lon}-${index}`" class="border-b border-edge/60">
            <td class="px-2 py-1 font-mono text-muted tnum">{{ row.time }}</td>
            <td class="px-2 py-1 text-right font-mono text-ink tnum">{{ decimals(row.lat, 3) }}</td>
            <td class="px-2 py-1 text-right font-mono text-ink tnum">{{ decimals(row.lon, 3) }}</td>
            <td class="px-2 py-1 text-right font-mono text-ink tnum">{{ decimals(row.bright4, 1) }}</td>
            <td class="px-2 py-1 font-mono text-ink">{{ row.confidence || '—' }}</td>
            <td class="px-2 py-1 text-right font-mono text-ink tnum">{{ decimals(row.frp, 1) }}</td>
            <td class="px-2 py-1 text-muted">{{ satelliteLabel(row.satellite) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="border-t border-edge px-3 py-1.5 text-2xs text-faint">
      Rows capped at {{ page?.limit ?? 200 }}; the count above is the full total.
    </p>
  </section>
</template>
