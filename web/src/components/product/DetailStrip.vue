<script setup lang="ts">
import { computed } from 'vue'
import type { CalendarCell } from '@/types/calendar'
import { MONTH_NAMES } from '@/lib/constants'
import { formatInteger, formatPlatformSplit, formatRatioShort, formatZShort } from '@/lib/format'

const props = defineProps<{
  cell: CalendarCell | null
  year: number
  month: number
  nonComparable: boolean
  note: string
}>()

const hasHarmonized = computed(() => props.cell?.harmonized !== null && props.cell !== null)

const headline = computed(() => {
  const current = props.cell
  if (!current) return ''
  const dayWord = current.days === 1 ? 'day' : 'days'
  const split = formatPlatformSplit(current)
  return `${MONTH_NAMES[props.month - 1]} ${props.year} · ${current.days} ${dayWord} with a detection${split ? ` · ${split}` : ''}`
})

const rows = computed(() => {
  const current = props.cell
  if (!current) return []
  return [
    {
      label: 'burning days',
      modis: formatInteger(current.modis),
      harmonized: hasHarmonized.value ? formatInteger(current.harmonized ?? 0) : '—',
    },
    {
      label: 'normal (median)',
      modis: formatInteger(current.base.modis),
      harmonized: hasHarmonized.value ? formatInteger(current.base.harmonized) : '—',
    },
    {
      label: 'ratio',
      modis: formatRatioShort(current.ratio.modis),
      harmonized: hasHarmonized.value ? formatRatioShort(current.ratio.harmonized) : '—',
    },
    {
      label: 'z',
      modis: formatZShort(current.z.modis),
      harmonized: hasHarmonized.value ? formatZShort(current.z.harmonized) : '—',
    },
    {
      label: 'pixel detections',
      modis: formatInteger(current.modis_px),
      harmonized: hasHarmonized.value ? formatInteger(current.viirs_px) : '—',
    },
  ]
})
</script>

<template>
  <section
    class="rounded-[var(--radius)] border border-edge bg-panel"
    aria-labelledby="detail-title"
    aria-live="polite"
    aria-atomic="true"
  >
    <header class="flex flex-wrap items-baseline justify-between gap-2 border-b border-edge px-3 py-1.5">
      <h2 id="detail-title" class="text-2xs font-semibold uppercase tracking-[0.14em] text-ink">Cell detail</h2>
      <span v-if="nonComparable" class="text-2xs text-warn" :title="note">
        not comparable with later years
      </span>
    </header>

    <div class="p-3">
      <p v-if="!cell" class="text-xs text-muted">No data for {{ MONTH_NAMES[month - 1] }} {{ year }}.</p>
      <template v-else>
        <p class="font-mono text-xs text-ink tnum">{{ headline }}</p>
        <table class="mt-2 w-full max-w-lg border-collapse text-left text-2xs tnum">
          <caption class="sr-only">Cell detail for {{ MONTH_NAMES[month - 1] }} {{ year }}</caption>
          <thead>
            <tr class="border-b border-edge-strong text-faint">
              <th scope="col" class="py-1 pr-3 font-normal uppercase tracking-[0.12em]"></th>
              <th scope="col" class="py-1 pr-3 text-right font-normal uppercase tracking-[0.12em]">MODIS</th>
              <th scope="col" class="py-1 text-right font-normal uppercase tracking-[0.12em]">With VIIRS</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.label" class="border-b border-edge/60">
              <th scope="row" class="py-1 pr-3 font-normal text-muted">{{ row.label }}</th>
              <td class="py-1 pr-3 text-right font-mono text-ink">{{ row.modis }}</td>
              <td class="py-1 text-right font-mono text-ink">{{ row.harmonized }}</td>
            </tr>
          </tbody>
        </table>
      </template>
    </div>
  </section>
</template>
