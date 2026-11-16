<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import { SQL_ROW_LIMIT } from '@/lib/constants'
import { formatElapsed, formatInteger } from '@/lib/format'
import { SAVED_QUERIES } from '@/lib/sql'
import type { SqlConsoleMeta } from '@/types/panels'

const props = defineProps<{
  running: boolean
  error: string | null
  meta: SqlConsoleMeta | null
}>()
const emit = defineEmits<{ run: [query: string] }>()

const query = ref(SAVED_QUERIES[0].sql)
const activeExample = ref(SAVED_QUERIES[0].id)

const status = computed(() => {
  if (props.running) return 'Running query…'
  if (props.meta) {
    const cap = props.meta.truncated ? ` · showing first ${formatInteger(SQL_ROW_LIMIT)}` : ''
    return `${formatInteger(props.meta.rowCount)} rows · ${formatElapsed(props.meta.elapsedMs)}${cap}`
  }
  return 'Read-only SELECT / WITH queries. Results replace the detections table.'
})

function chooseExample(id: string): void {
  const example = SAVED_QUERIES.find((entry) => entry.id === id)
  if (!example) return
  query.value = example.sql
  activeExample.value = id
}

function run(): void {
  activeExample.value = ''
  emit('run', query.value)
}
</script>

<template>
  <section class="rounded-[var(--radius)] border border-edge bg-panel" aria-labelledby="sql-console-title">
    <header class="flex flex-wrap items-center justify-between gap-2 border-b border-edge px-3 py-1.5">
      <div class="flex items-baseline gap-2">
        <h2 id="sql-console-title" class="text-2xs font-semibold uppercase tracking-[0.14em] text-ink">
          SQL console
        </h2>
        <span class="font-mono text-2xs text-faint">DuckDB-WASM · read-only · table name detections</span>
      </div>
      <div class="flex items-center gap-1">
        <Button
          v-for="example in SAVED_QUERIES"
          :key="example.id"
          size="sm"
          variant="ghost"
          :class="activeExample === example.id ? 'text-accent' : ''"
          @click="chooseExample(example.id)"
        >
          {{ example.label }}
        </Button>
      </div>
    </header>

    <div class="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div>
        <label for="sql-input" class="sr-only">SQL query</label>
        <textarea
          id="sql-input"
          v-model="query"
          spellcheck="false"
          class="scroll-thin h-32 w-full resize-y rounded-[var(--radius)] border border-edge bg-sunken p-2 font-mono text-xs leading-5 text-ink focus:border-accent focus:outline-none"
          @keydown.ctrl.enter.prevent="run"
          @keydown.meta.enter.prevent="run"
        />
      </div>
      <div class="flex flex-col gap-2">
        <Button variant="primary" :disabled="running" @click="run">
          {{ running ? 'Running…' : 'Run SQL' }}
        </Button>
        <p class="text-2xs leading-4 text-muted">
          Ctrl/⌘ + Enter runs. Writes, DDL and multiple statements are rejected. Results go to the Detections table.
        </p>
        <p class="mt-auto font-mono text-2xs leading-4 text-faint" :class="error ? 'text-danger' : ''" aria-live="polite">
          {{ error ?? status }}
        </p>
      </div>
    </div>
  </section>
</template>
