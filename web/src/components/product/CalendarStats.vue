<script setup lang="ts">
defineProps<{
  burningDays: string
  ratio: string
  thirdLabel: string
  thirdValue: string
  thirdNote: string
}>()
</script>

<template>
  <div class="grid gap-2 sm:grid-cols-3">
    <div class="rounded-[var(--radius)] border border-edge bg-panel px-3 py-2">
      <div class="flex items-baseline justify-between gap-2">
        <p class="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">Burning days</p>
        <p class="text-[15px] font-medium leading-5 text-ink tnum">{{ burningDays }}</p>
      </div>
      <p class="text-2xs leading-4 text-muted">this year</p>
    </div>
    <div class="rounded-[var(--radius)] border border-edge bg-panel px-3 py-2">
      <div class="flex items-baseline justify-between gap-2">
        <p class="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">Vs normal</p>
        <p class="text-[15px] font-medium leading-5 text-ink tnum">{{ ratio }}</p>
      </div>
      <p class="text-2xs leading-4 text-muted">vs 2012–2022 median</p>
    </div>
    <div class="rounded-[var(--radius)] border border-edge bg-panel px-3 py-2">
      <div class="flex items-baseline justify-between gap-2">
        <p class="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">{{ thirdLabel }}</p>
        <p class="text-[15px] font-medium leading-5 text-ink tnum">{{ thirdValue }}</p>
      </div>
      <p class="text-2xs leading-4 text-muted">{{ thirdNote }}</p>
    </div>
  </div>
</template>
