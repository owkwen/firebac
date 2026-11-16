<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string
    meta?: string
    summary?: string
    loading?: boolean
    empty?: boolean
    emptyMessage?: string
  }>(),
  { meta: '', summary: '', loading: false, empty: false, emptyMessage: 'No detections match the current filters.' },
)
</script>

<template>
  <section class="flex min-h-0 flex-col rounded-[var(--radius)] border border-edge bg-panel" :aria-busy="loading">
    <header class="flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-edge px-3 py-1.5">
      <div class="flex items-baseline gap-2">
        <h2 class="text-2xs font-semibold uppercase tracking-[0.14em] text-ink">{{ title }}</h2>
        <span v-if="meta" class="font-mono text-2xs text-faint">{{ meta }}</span>
      </div>
      <div class="flex items-center gap-2">
        <slot name="actions" />
      </div>
    </header>

    <div class="relative min-h-0 grow p-3">
      <div v-if="loading" class="grid h-full min-h-24 place-items-center text-xs text-muted">
        <span class="animate-pulse font-mono">querying DuckDB…</span>
      </div>
      <div
        v-else-if="empty"
        class="grid h-full min-h-24 place-items-center px-4 text-center text-xs text-muted"
      >
        {{ emptyMessage }}
      </div>
      <slot v-else />
    </div>

    <p v-if="summary" class="border-t border-edge/60 px-3 py-1.5 text-2xs leading-4 text-muted">
      {{ summary }}
    </p>
  </section>
</template>
