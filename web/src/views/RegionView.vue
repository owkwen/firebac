<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type {
  DensityIndex,
  DensityYear,
  DetailRaster,
  DetailTile,
  RawAggregate,
  RawTablePage,
  TileIndex,
  TileRef,
} from '@/types/detections'
import type { GeoCollection } from '@/types/geo'
import type { GeoExtent } from '@/types/map'
import type { ModelArtifact } from '@/types/model'
import type { Selection } from '@/lib/selection'
import { polygonAreaKm2, selectionLabel } from '@/lib/selection'
import { nextLod, type MapLod } from '@/lib/map'
import {
  DETAIL_TILE_MARGIN,
  RAW_MAP_EXTENT,
  RAW_PAGE_REGION,
  aggregateBins,
  binRules,
  cancelQueries,
  densityExtentPolygon,
  densityTotals,
  densityViewExtent,
  detailRaster,
  exportSelectionCsv,
  fetchDensityIndex,
  fetchDensityYear,
  fetchModelArtifact,
  fetchTileIndex,
  loadDetailTiles,
  loadSelection,
  loadSelectionRows,
  resetDetailTiles,
  scopeOptions,
  tileKey,
  tileRefsForExtent,
} from '@/lib/raw'
import { fetchGeoOutline } from '@/lib/geo'
import { downloadTextFile } from '@/lib/download'
import { formatInteger } from '@/lib/format'
import RegionYearSelect from '@/components/region/RegionYearSelect.vue'
import RegionMap from '@/components/region/RegionMap.vue'
import RawPanel from '@/components/region/RawPanel.vue'
import EstimatePanel from '@/components/region/EstimatePanel.vue'
import RawTable from '@/components/region/RawTable.vue'
import SelectionExport from '@/components/region/SelectionExport.vue'
import SegmentedControl from '@/components/product/SegmentedControl.vue'

const densityIndex = ref<DensityIndex | null>(null)
const indexLoading = ref(true)
const indexError = ref<string | null>(null)
const model = ref<ModelArtifact | null>(null)
const modelLoading = ref(true)
const modelError = ref<string | null>(null)
const outline = ref<GeoCollection | null>(null)
const outlineError = ref<string | null>(null)

const year = ref(2023)
const scope = ref<string | null>(null)
const radiusKm = ref(5)
const density = ref<DensityYear | null>(null)
const loading = ref(false)
const loadError = ref<string | null>(null)
const selection = ref<Selection | null>(null)
const selectionAggregate = ref<RawAggregate | null>(null)
const selectionLoading = ref(false)
const selectionError = ref<string | null>(null)
const exporting = ref(false)
const exportError = ref<string | null>(null)
const exportedRows = ref<number | null>(null)
const table = ref<RawTablePage | null>(null)
const tableLoading = ref(false)
const tableError = ref<string | null>(null)

const tileIndex = ref<TileIndex | null>(null)
const tileIndexError = ref<string | null>(null)
const lod = ref<MapLod>('wide')
const viewport = ref<GeoExtent | null>(null)
const detailTiles = ref<DetailTile[]>([])
const detailMissing = ref<string[]>([])
const detailLoading = ref(false)
const detailError = ref<string | null>(null)

let yearRequest = 0
let selectionToken = 0
let detailToken = 0
let densityStartedAt = 0

const yearMeta = computed(() => densityIndex.value?.years.find((item) => item.year === year.value) ?? null)
const rules = computed(() => (model.value ? binRules(model.value) : null))
const countryTotals = computed(() =>
  density.value ? densityTotals(density.value, scope.value, yearMeta.value?.cell_days ?? null) : null,
)
const raw = computed(() => (selection.value ? selectionAggregate.value : countryTotals.value))
const estimate = computed(() =>
  selection.value && selectionAggregate.value && model.value
    ? aggregateBins(selectionAggregate.value, model.value)
    : null,
)
const mapExtent = computed<GeoExtent>(() =>
  density.value ? densityViewExtent(density.value) : RAW_MAP_EXTENT,
)
const detailView = computed<DetailRaster | null>(() => {
  const index = tileIndex.value
  if (!index || detailTiles.value.length === 0) return null
  return detailRaster(detailTiles.value, scope.value, index.step_deg)
})
const yearTileKeys = computed(() => {
  const entry = tileIndex.value?.years.find((item) => item.year === year.value)
  const keys = new Set<string>()
  for (const tile of entry?.tiles ?? []) keys.add(tileKey(tile.tile[0], tile.tile[1]))
  return keys
})
const wantedTiles = computed<TileRef[]>(() => {
  const index = tileIndex.value
  const extent = viewport.value
  if (lod.value === 'wide' || !index || !extent) return []
  return tileRefsForExtent(extent, index.tile_deg, DETAIL_TILE_MARGIN).filter((ref) =>
    yearTileKeys.value.has(tileKey(ref.i, ref.j)),
  )
})
const wantedSignature = computed(
  () => `${year.value}|${wantedTiles.value.map((ref) => tileKey(ref.i, ref.j)).sort().join('|')}`,
)
const detailLoadingUi = computed(
  () => lod.value !== 'wide' && (detailLoading.value || (!tileIndex.value && !tileIndexError.value)),
)
const detailProblem = computed(() => tileIndexError.value ?? detailError.value)
const scopeTabs = computed(() => scopeOptions(year.value))
const scopeLabel = computed(() => {
  if (scope.value === null) return 'all sensors'
  return scopeTabs.value.find((option) => option.value === scope.value)?.label ?? scope.value
})
const satelliteLevel = computed(() => scope.value === 'Terra' || scope.value === 'Aqua')
const selectionText = computed(() => {
  if (!selection.value) return `no selection · country totals for ${year.value}`
  const area = formatInteger(Math.round(polygonAreaKm2(selection.value.polygon)))
  return `${selectionLabel(selection.value)} · ${area} km²`
})
const contextLabel = computed(() => `${year.value} · ${selectionText.value}`)
const emptyEstimate = computed(() => (selection.value ? null : 'select an area'))

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function clearSelection(): void {
  selectionToken += 1
  void cancelQueries()
  selection.value = null
  selectionAggregate.value = null
  selectionLoading.value = false
  selectionError.value = null
  exportedRows.value = null
  exportError.value = null
  table.value = null
  tableLoading.value = false
  tableError.value = null
}

async function loadTable(aggregate: RawAggregate, token: number): Promise<void> {
  const started = performance.now()
  tableLoading.value = true
  tableError.value = null
  try {
    const page = await loadSelectionRows(year.value, scope.value, aggregate.cells)
    if (token !== selectionToken) return
    table.value = page
    console.info(
      `[raw table] ${selectionText.value}: ${(performance.now() - started).toFixed(0)} ms · ${page.total.toLocaleString('en-US')} rows`,
    )
  } catch (error) {
    if (token === selectionToken) tableError.value = errorMessage(error)
  } finally {
    if (token === selectionToken) tableLoading.value = false
  }
}

async function applySelection(next: Selection): Promise<void> {
  selection.value = next
  const token = ++selectionToken
  void cancelQueries()
  selectionLoading.value = true
  selectionError.value = null
  selectionAggregate.value = null
  exportedRows.value = null
  exportError.value = null
  table.value = null
  tableLoading.value = false
  tableError.value = null
  const started = performance.now()
  try {
    const result = await loadSelection(
      year.value,
      next,
      scope.value,
      rules.value,
      yearMeta.value?.cell_days ?? 0,
    )
    if (token !== selectionToken) return
    selectionAggregate.value = result.aggregate
    console.info(
      `[selection] ${selectionText.value}: ${(performance.now() - started).toFixed(0)} ms · ${formatInteger(result.aggregate.cellDays ?? 0)} cell-days`,
    )
    await loadTable(result.aggregate, token)
  } catch (error) {
    if (token === selectionToken) selectionError.value = errorMessage(error)
  } finally {
    if (token === selectionToken) selectionLoading.value = false
  }
}

async function exportCsv(): Promise<void> {
  const current = selection.value
  if (!current || exporting.value) return
  exporting.value = true
  exportError.value = null
  exportedRows.value = null
  try {
    const result = await exportSelectionCsv(year.value, current, scope.value)
    downloadTextFile(result.filename, result.csv)
    exportedRows.value = result.rows
    console.info(`[export] ${result.filename} · ${formatInteger(result.rows)} cell-days`)
  } catch (error) {
    exportError.value = errorMessage(error)
  } finally {
    exporting.value = false
  }
}

async function loadYearData(): Promise<void> {
  const request = ++yearRequest
  densityStartedAt = performance.now()
  loading.value = true
  loadError.value = null
  density.value = null
  try {
    const loaded = await fetchDensityYear(year.value)
    if (request !== yearRequest) return
    density.value = loaded
  } catch (error) {
    if (request === yearRequest) loadError.value = errorMessage(error)
  } finally {
    if (request === yearRequest) loading.value = false
  }
}

async function loadIndex(): Promise<void> {
  try {
    const payload = await fetchDensityIndex()
    densityIndex.value = payload
    const years = payload.years.map((item) => item.year)
    year.value = years.includes(2023) ? 2023 : years[years.length - 1]
    await loadYearData()
  } catch (error) {
    indexError.value = errorMessage(error)
  } finally {
    indexLoading.value = false
  }
}

async function loadTileIndex(): Promise<void> {
  try {
    tileIndex.value = await fetchTileIndex()
  } catch (error) {
    tileIndexError.value = errorMessage(error)
  }
}

function onViewport(extent: GeoExtent, span: number): void {
  viewport.value = extent
  lod.value = nextLod(span, lod.value)
}

async function refreshDetail(): Promise<void> {
  const refs = wantedTiles.value
  const token = ++detailToken
  if (refs.length === 0) {
    detailMissing.value = []
    detailLoading.value = false
    return
  }
  detailLoading.value = true
  detailError.value = null
  const started = performance.now()
  try {
    const load = await loadDetailTiles(year.value, refs)
    if (token !== detailToken) return
    detailTiles.value = load.tiles
    detailMissing.value = load.missing
    if (load.bytes > 0) {
      console.info(
        `[detail] ${year.value} · ${load.tiles.length} tiles · ${Math.round(load.bytes / 1024)} KB in ${(performance.now() - started).toFixed(0)} ms`,
      )
    }
  } catch (error) {
    if (token === detailToken) {
      detailTiles.value = []
      detailMissing.value = []
      detailError.value = errorMessage(error)
    }
  } finally {
    if (token === detailToken) detailLoading.value = false
  }
}

watch(wantedSignature, () => {
  void refreshDetail()
})

async function loadModel(): Promise<void> {
  try {
    model.value = await fetchModelArtifact(RAW_PAGE_REGION)
  } catch (error) {
    modelError.value = errorMessage(error)
  } finally {
    modelLoading.value = false
  }
}

function onYear(value: number): void {
  if (value === year.value) return
  year.value = value
  clearSelection()
  resetDetailTiles()
  detailToken += 1
  detailTiles.value = []
  detailMissing.value = []
  detailError.value = null
  void loadYearData()
}

function onScope(value: string): void {
  const next = value === 'all' ? null : value
  if (next === scope.value) return
  scope.value = next
  if (selection.value) void applySelection(selection.value)
}

function onSelect(next: Selection): void {
  void applySelection(next)
}

function selectExtent(): void {
  if (!density.value) return
  void applySelection({ polygon: densityExtentPolygon(density.value), mode: 'extent' })
}

function onPainted(paintedYear: number): void {
  if (paintedYear !== year.value || densityStartedAt === 0) return
  console.info(`[density] ${paintedYear} painted in ${(performance.now() - densityStartedAt).toFixed(0)} ms`)
  densityStartedAt = 0
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && selection.value) clearSelection()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  void fetchGeoOutline()
    .then((geo) => {
      outline.value = geo
    })
    .catch((error: unknown) => {
      outlineError.value = errorMessage(error)
    })
  void loadIndex()
  void loadTileIndex()
  void loadModel()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <main class="mx-auto flex max-w-[1600px] flex-col gap-3 px-3 py-3">
    <header class="flex flex-wrap items-end justify-between gap-3 border-b border-edge pb-3">
      <h1 class="text-sm font-semibold text-ink">Detections</h1>
      <RegionYearSelect
        v-if="densityIndex"
        :years="densityIndex.years"
        :model-value="year"
        :disabled="loading"
        @update:model-value="onYear"
      />
      <p v-else-if="indexLoading" class="font-mono text-2xs text-muted">loading density/index.json…</p>
    </header>

    <p v-if="indexError" role="alert" class="border border-danger/40 px-2 py-1 text-xs text-danger">
      {{ indexError }}
    </p>

    <RegionMap
      :density="density"
      :detail="detailView"
      :lod="lod"
      :detail-loading="detailLoadingUi"
      :detail-missing="detailMissing"
      :detail-error="detailProblem"
      :outline="outline"
      :extent="mapExtent"
      :selection="selection"
      :radius-km="radiusKm"
      :year="year"
      :scope="scope"
      :loading="loading || indexLoading"
      :error="loadError"
      @select="onSelect"
      @painted="onPainted"
      @viewport="onViewport"
      @update:radius-km="radiusKm = $event"
    />
    <p v-if="outlineError" class="text-2xs text-warn">Coastline unavailable: {{ outlineError }}</p>

    <section aria-labelledby="results-heading" class="flex flex-col gap-3">
      <div class="flex flex-wrap items-end justify-between gap-2 border-b border-edge pb-2">
        <div>
          <h2 id="results-heading" class="text-sm font-semibold text-ink">
            {{ selection ? 'Selection' : 'Country totals' }}
          </h2>
          <p aria-live="polite" class="text-xs text-muted">{{ selectionText }}</p>
          <SelectionExport
            class="mt-1"
            :year="year"
            :scope-label="scopeLabel"
            :selection="selection !== null"
            :cell-days="selectionLoading || tableLoading ? null : selectionAggregate?.cellDays ?? null"
            :loading="exporting"
            :error="exportError"
            :exported-rows="exportedRows"
            @export="exportCsv"
          />
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <SegmentedControl
            v-if="density"
            label="sensor"
            :model-value="scope ?? 'all'"
            :options="scopeTabs"
            :disabled="loading"
            @update:model-value="onScope"
          />
          <button
            type="button"
            class="h-7 rounded-[var(--radius)] border border-edge bg-sunken px-2 text-xs text-muted hover:text-ink disabled:opacity-40"
            :disabled="!density || loading"
            @click="selectExtent"
          >
            Select full extent
          </button>
          <button
            type="button"
            class="h-7 rounded-[var(--radius)] border border-edge bg-sunken px-2 text-xs text-muted hover:text-ink disabled:opacity-40"
            :disabled="!selection"
            @click="clearSelection"
          >
            Clear
          </button>
        </div>
      </div>

      <p v-if="selectionLoading" class="grid h-24 place-items-center border border-edge bg-panel text-xs text-muted">
        computing 0.01° cell-days…
      </p>
      <p v-else-if="selectionError" role="alert" class="border border-danger/40 px-2 py-1 text-xs text-danger">
        {{ selectionError }}
      </p>
      <p v-else-if="loading" class="grid h-24 place-items-center border border-edge bg-panel text-xs text-muted">
        loading {{ year }} density…
      </p>
      <p v-else-if="loadError" role="alert" class="border border-danger/40 px-2 py-1 text-xs text-danger">
        {{ loadError }}
      </p>
      <div v-else-if="raw" class="grid items-stretch gap-3 lg:grid-cols-2">
        <RawPanel :raw="raw" :table-total="table?.total ?? 0" :year="year" :satellite-level="satelliteLevel" />
        <EstimatePanel
          :estimate="estimate"
          :model="model"
          :error="modelError"
          :loading="modelLoading"
          :empty-message="emptyEstimate"
        />
      </div>

      <RawTable
        :page="table"
        :loading="tableLoading"
        :error="tableError"
        :idle-reason="selection ? null : 'Select an area to load raw rows.'"
        :context-label="contextLabel"
      />
    </section>
  </main>
</template>
