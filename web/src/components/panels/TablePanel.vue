<script setup lang="ts">
import { computed } from 'vue'
import DataTable from '@/components/DataTable.vue'
import PanelShell from '@/components/PanelShell.vue'
import Button from '@/components/ui/Button.vue'
import { SQL_ROW_LIMIT, TABLE_ROW_LIMIT } from '@/lib/constants'
import { formatElapsed, formatInteger } from '@/lib/format'
import { DETECTION_COLUMNS, sqlColumns } from '@/lib/table'
import type { DataRow, DetectionRow, SqlResult } from '@/types/detections'

const props = defineProps<{
  rows: DetectionRow[]
  total: number
  sqlResult: SqlResult | null
  exportBusy: boolean
  loading: boolean
}>()

const emit = defineEmits<{ export: []; 'clear-sql': [] }>()

const columns = computed(() =>
  props.sqlResult ? sqlColumns(props.sqlResult.columns, props.sqlResult.rows) : DETECTION_COLUMNS,
)
const displayRows = computed<DataRow[]>(() =>
  props.sqlResult ? props.sqlResult.rows : props.rows,
)
const empty = computed(() => displayRows.value.length === 0)
const meta = computed(() => {
  if (props.sqlResult) {
    return `${formatInteger(props.sqlResult.totalRows)} rows · ${formatElapsed(props.sqlResult.elapsedMs)}`
  }
  return `${formatInteger(props.total)} matching rows`
})
const summary = computed(() => {
  if (props.sqlResult) {
    const cap = props.sqlResult.truncated
      ? ` · showing first ${formatInteger(props.sqlResult.rows.length)} (cap ${formatInteger(SQL_ROW_LIMIT)})`
      : ''
    return `SQL result from the console: ${formatInteger(props.sqlResult.totalRows)} rows in ${formatElapsed(props.sqlResult.elapsedMs)}${cap}. Export writes the displayed result rows.`
  }
  return `Current filtered rows, newest first. Table shows at most ${formatInteger(TABLE_ROW_LIMIT)} rows; Export CSV writes every row that matches the current filters.`
})
const emptyMessage = computed(() =>
  props.sqlResult ? 'The query returned no rows.' : 'No detections match the current filters.',
)
</script>

<template>
  <PanelShell
    title="Detections"
    :meta="meta"
    :summary="summary"
    :loading="loading"
    :empty="empty"
    :empty-message="emptyMessage"
  >
    <template #actions>
      <span
        v-if="sqlResult"
        class="rounded bg-accent-soft px-1.5 py-0.5 font-mono text-2xs uppercase tracking-wide text-accent"
      >
        SQL
      </span>
      <Button size="sm" variant="ghost" :disabled="exportBusy" @click="emit('export')">
        {{ exportBusy ? 'Exporting…' : 'Export CSV' }}
      </Button>
      <Button v-if="sqlResult" size="sm" variant="ghost" @click="emit('clear-sql')">
        Clear
      </Button>
    </template>
    <DataTable
      :columns="columns"
      :rows="displayRows"
      :caption="`Detection table: ${formatInteger(displayRows.length)} displayed rows`"
    />
  </PanelShell>
</template>
