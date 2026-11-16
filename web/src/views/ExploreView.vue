<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { computed, onMounted, ref, watch } from 'vue'
import FilterRail from '@/components/FilterRail.vue'
import SqlConsole from '@/components/SqlConsole.vue'
import BrightnessPanel from '@/components/panels/BrightnessPanel.vue'
import ConfidencePanel from '@/components/panels/ConfidencePanel.vue'
import CountsPanel from '@/components/panels/CountsPanel.vue'
import FootprintsPanel from '@/components/panels/FootprintsPanel.vue'
import MapPanel from '@/components/panels/MapPanel.vue'
import ScatterPanel from '@/components/panels/ScatterPanel.vue'
import TablePanel from '@/components/panels/TablePanel.vue'
import { fetchManifest } from '@/lib/data'
import { downloadTextFile } from '@/lib/download'
import { fetchFilteredRows, executeSql, runExploreQueries } from '@/lib/queries'
import { selectedDatasetInfos } from '@/lib/filters'
import { toCsv } from '@/lib/csv'
import { loadDetections } from '@/lib/duck'
import { DETECTION_COLUMNS, sqlColumns } from '@/lib/table'
import { readFilters, writeFilters } from '@/lib/urlState'
import { useExploreStore } from '@/stores/explore'
import type { ExploreData, SqlConsoleMeta } from '@/types/panels'
import type { SqlResult } from '@/types/detections'

const store = useExploreStore()
const ready = ref(false)
const loading = ref(true)
const error = ref<string | null>(null)
const data = ref<ExploreData | null>(null)
const sqlRunning = ref(false)
const sqlError = ref<string | null>(null)
const sqlResult = ref<SqlResult | null>(null)
const exportBusy = ref(false)

let requestId = 0

function messageOf(value: unknown): string {
  return value instanceof Error ? value.message : String(value)
}

const provenance = computed(() => {
  const count = store.applied.datasets.length
  return `${count} source CSV${count === 1 ? '' : 's'} · ${store.applied.sensors.join(' + ') || 'no sensors'} · raw FIRMS rows`
})

const sqlMeta = computed<SqlConsoleMeta | null>(() =>
  sqlResult.value
    ? {
        elapsedMs: sqlResult.value.elapsedMs,
        rowCount: sqlResult.value.totalRows,
        truncated: sqlResult.value.truncated,
      }
    : null,
)

async function refresh(): Promise<void> {
  const id = ++requestId
  loading.value = true
  error.value = null
  sqlResult.value = null
  sqlError.value = null
  try {
    const selected = selectedDatasetInfos(store.datasets, store.applied)
    await loadDetections(selected)
    const result = await runExploreQueries(store.applied)
    if (id !== requestId) return
    data.value = result
  } catch (caught) {
    if (id === requestId) error.value = messageOf(caught)
  } finally {
    if (id === requestId) loading.value = false
  }
}

function writeUrl(): void {
  const query = writeFilters(store.filters)
  const url = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
  window.history.replaceState(window.history.state, '', url)
}

function restoreFromUrl(): void {
  store.updateFilters(readFilters(window.location.search, store.datasets))
  store.apply()
}

async function runSql(query: string): Promise<void> {
  sqlRunning.value = true
  sqlError.value = null
  try {
    sqlResult.value = await executeSql(query)
  } catch (caught) {
    sqlError.value = messageOf(caught)
  } finally {
    sqlRunning.value = false
  }
}

async function exportRows(): Promise<void> {
  exportBusy.value = true
  error.value = null
  try {
    if (sqlResult.value) {
      const columns = sqlColumns(sqlResult.value.columns, sqlResult.value.rows)
      downloadTextFile(
        `firms-query-${new Date().toISOString().slice(0, 10)}.csv`,
        toCsv(columns, sqlResult.value.rows),
      )
    } else {
      const result = await fetchFilteredRows(store.applied)
      downloadTextFile(
        `firms-detections-${store.applied.dateFrom}-${store.applied.dateTo}.csv`,
        toCsv(DETECTION_COLUMNS, result.rows),
      )
    }
  } catch (caught) {
    error.value = messageOf(caught)
  } finally {
    exportBusy.value = false
  }
}

onMounted(async () => {
  try {
    const manifest = await fetchManifest()
    const initial = readFilters(window.location.search, manifest)
    store.initialise(manifest, initial)
    ready.value = true
    writeUrl()
    await refresh()
  } catch (caught) {
    ready.value = true
    loading.value = false
    error.value = messageOf(caught)
  }
})

watch(
  () => store.filters,
  () => writeUrl(),
  { deep: true },
)
watch(
  () => store.runSeq,
  () => void refresh(),
)

useEventListener(window, 'popstate', restoreFromUrl)
</script>

<template>
  <div class="min-h-screen bg-canvas">
    <header class="flex flex-wrap items-center justify-between gap-2 border-b border-edge bg-panel px-3 py-2">
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 class="text-sm font-semibold tracking-tight text-ink">FIRMS Explore</h1>
        <span class="text-2xs text-muted">internal CSV workbench · not the published calendar</span>
      </div>
      <p class="font-mono text-2xs text-faint">DuckDB-WASM · {{ provenance }}</p>
    </header>

    <div class="lg:flex lg:items-start">
      <FilterRail
        v-if="ready"
        :datasets="store.datasets"
        :filters="store.filters"
        :busy="loading"
        :dirty="store.dirty"
        @update:filters="store.updateFilters"
        @run="store.apply"
      />

      <main class="min-w-0 flex-1 space-y-3 p-3">
        <div
          v-if="error"
          role="alert"
          class="rounded-[var(--radius)] border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-2xs text-danger"
        >
          {{ error }}
        </div>

        <div v-if="!ready" class="grid min-h-64 place-items-center text-xs text-muted">
          <span class="animate-pulse font-mono">opening DuckDB-WASM and reading the manifest…</span>
        </div>

        <template v-else>
          <div class="grid gap-3 xl:grid-cols-2">
            <CountsPanel :data="data?.counts ?? null" :loading="loading" />
            <BrightnessPanel :data="data?.brightness ?? null" :loading="loading" />
            <ScatterPanel :data="data?.scatter ?? null" :loading="loading" />
            <ConfidencePanel :data="data?.confidence ?? null" :loading="loading" />
            <FootprintsPanel :data="data?.footprints ?? null" :loading="loading" />
            <MapPanel :data="data?.map ?? null" :loading="loading" />
            <TablePanel
              class="xl:col-span-2"
              :rows="data?.table.rows ?? []"
              :total="data?.table.total ?? 0"
              :sql-result="sqlResult"
              :export-busy="exportBusy"
              :loading="loading"
              @export="exportRows"
              @clear-sql="sqlResult = null"
            />
          </div>

          <SqlConsole
            :running="sqlRunning"
            :error="sqlError"
            :meta="sqlMeta"
            @run="runSql"
          />
        </template>
      </main>
    </div>
  </div>
</template>
