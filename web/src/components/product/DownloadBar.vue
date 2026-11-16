<script setup lang="ts">
import { hotspotsUrl } from '@/lib/artifacts'

defineProps<{ region: string; year: number }>()
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-edge bg-panel px-3 py-2">
    <p class="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">Export</p>
    <a
      :href="hotspotsUrl(region, year)"
      download
      class="rounded-[var(--radius)] border border-edge bg-raised px-2.5 py-1 text-xs text-ink hover:border-edge-strong"
    >
      Download {{ year }} cell-day table (CSV)
    </a>
  </div>
</template>
