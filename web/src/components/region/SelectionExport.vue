<script setup lang="ts">
import { computed } from 'vue'
import { formatInteger } from '@/lib/format'

const props = defineProps<{
  year: number
  scopeLabel: string
  selection: boolean
  cellDays: number | null
  loading: boolean
  error: string | null
  exportedRows: number | null
}>()

const emit = defineEmits<{ export: [] }>()

const disabledReason = computed(() => {
  if (!props.selection) return 'Select an area to export its 0.01° cell-days.'
  if (props.cellDays === null) return 'Preparing the selection…'
  if (props.cellDays === 0) return 'No cell-days in this selection.'
  return null
})

const busy = computed(() => props.loading || disabledReason.value !== null)
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center gap-2">
      <button
        type="button"
        class="h-7 rounded-[var(--radius)] border border-edge bg-sunken px-2 text-xs text-muted hover:text-ink disabled:opacity-40"
        :disabled="busy"
        :title="disabledReason ?? 'One row per 0.01° cell-day in the selection'"
        @click="emit('export')"
      >
        {{ loading ? 'Preparing CSV…' : 'Download selection CSV' }}
      </button>
      <span v-if="error" role="alert" class="text-2xs text-danger">{{ error }}</span>
      <span v-else-if="exportedRows !== null" aria-live="polite" class="font-mono text-2xs text-muted tnum">
        {{ formatInteger(exportedRows) }} rows
      </span>
      <span v-else-if="disabledReason" class="text-2xs text-faint">{{ disabledReason }}</span>
    </div>
    <p class="mt-1 text-2xs text-faint">
      {{ year }} · 0.01° cell-days · {{ scopeLabel }}
    </p>
  </div>
</template>
