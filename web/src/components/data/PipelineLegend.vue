<script setup lang="ts">
const statuses = [
  { label: 'live', box: 'border-edge-strong', text: 'text-ink' },
  { label: 'validation-only', box: 'border-edge-strong border-dashed', text: 'text-muted' },
  { label: 'rejected', box: 'border-edge-strong border-dashed', text: 'text-faint' },
] as const

const sensors = [
  { label: 'MODIS', box: 'bg-modis' },
  { label: 'VIIRS', box: 'bg-viirs' },
  { label: 'shared', box: 'bg-edge-strong' },
] as const
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs leading-4 text-muted">
    <span class="text-faint">legend</span>
    <span v-for="status in statuses" :key="status.label" class="inline-flex items-center gap-1.5">
      <span class="inline-block h-2.5 w-5 rounded-[1px] border" :class="[status.box, status.text]" aria-hidden="true" />
      <span :class="status.text">{{ status.label }}</span>
    </span>
    <span class="text-faint">·</span>
    <span v-for="sensor in sensors" :key="sensor.label" class="inline-flex items-center gap-1.5">
      <span class="inline-block h-2.5 w-0.5" :class="sensor.box" aria-hidden="true" />
      <span class="text-muted">{{ sensor.label }}</span>
    </span>
  </div>
</template>
