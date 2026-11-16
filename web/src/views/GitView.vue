<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { GeoCollection } from '@/types/geo'
import type { RasterLayer } from '@/types/map'
import type {
  Bbox,
  GitCommitCells,
  GitIndex,
  GitLog,
  GitPlanSize,
  GitSensor,
  TerminalKind,
  TerminalLine,
  TerminalState,
} from '@/types/git'
import type { TerminalContext } from '@/lib/terminal'
import { fetchGeoOutline } from '@/lib/geo'
import {
  fetchGitIndex,
  loadBlame as fetchBlame,
  loadCommitCells as fetchCommitCells,
  loadCommitLog,
  loadDensestBox,
  loadDensityRaster,
} from '@/lib/gitData'
import {
  GIT_COMMIT_CAP,
  GIT_DEFAULT_YEAR,
  bboxParam,
  formatBbox,
  gitGridStyle,
  parseBboxParam,
  readGitLayout,
  writeGitLayout,
} from '@/lib/git'
import { runCommand } from '@/lib/terminal'
import { formatInteger } from '@/lib/format'
import { messageOf } from '@/lib/utils'
import GitBrief from '@/components/git/GitBrief.vue'
import GitDock from '@/components/git/GitDock.vue'
import GitLegend from '@/components/git/GitLegend.vue'
import GitTimeline from '@/components/git/GitTimeline.vue'
import GitToggleGroup from '@/components/git/GitToggleGroup.vue'

const route = useRoute()
const router = useRouter()

const index = ref<GitIndex | null>(null)
const indexLoading = ref(true)
const outline = ref<GeoCollection | null>(null)
const outlineError = ref<string | null>(null)
const density = ref<RasterLayer | null>(null)
const year = ref(GIT_DEFAULT_YEAR)
const bbox = ref<Bbox | null>(null)
const log = ref<GitLog | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const terminalLines = ref<TerminalLine[]>([])
const terminalBusy = ref(false)

let lineId = 0
let requestId = 0
let densityRequest = 0

const years = computed(() => index.value?.years.map((entry) => entry.year) ?? [])

/**
 * One country, not the hemisphere: Natural Earth carries ISO-3 codes ('CAN')
 * and the pass index the ISO-2 region ('CA'). The map frames this outline for
 * every year; density is context, never a frame.
 */
const regionOutline = computed<GeoCollection | null>(() => {
  const collection = outline.value
  const region = index.value?.region
  if (!collection || !region) return null
  const features = collection.features.filter(
    (feature) => feature.properties.code?.startsWith(region) === true,
  )
  return features.length > 0 ? { ...collection, features } : null
})

const commitCount = computed(() => log.value?.totals.commits ?? 0)
const displayedCount = computed(() => log.value?.displayed.length ?? 0)
const authors = computed(() => log.value?.totals.authors ?? [])
const sensorMax = computed<Record<GitSensor, number>>(
  () => log.value?.sensorMax ?? { MODIS: 0, VIIRS: 0 },
)

const storedLayout = readGitLayout()
const planSize = ref<GitPlanSize>(storedLayout.planSize)
const grid = computed(() => gitGridStyle(planSize.value))

const PLAN_SIZE_OPTIONS = [
  { value: 'compact', label: 'Compact' },
  { value: 'large', label: 'Large' },
] as const satisfies readonly { value: GitPlanSize; label: string }[]

watch(planSize, (value) => {
  writeGitLayout({ planSize: value })
})

// The density is orientation only; a missing year must never break the log.
async function refreshDensity(target: number): Promise<void> {
  const request = ++densityRequest
  try {
    const layer = await loadDensityRaster(target)
    if (request === densityRequest) density.value = layer
  } catch {
    if (request === densityRequest) density.value = null
  }
}

watch(year, (value) => void refreshDensity(value), { immediate: true })

function pushLine(kind: TerminalKind, text: string): void {
  lineId += 1
  terminalLines.value.push({ id: lineId, kind, text })
}

function syncUrl(): void {
  if (!bbox.value) return
  const nextYear = String(year.value)
  const nextBbox = bboxParam(bbox.value)
  if (route.query.y === nextYear && route.query.bbox === nextBbox) return
  void router
    .replace({ query: { ...route.query, y: nextYear, bbox: nextBbox } })
    .catch(() => undefined)
}

async function load(targetYear: number, targetBbox: Bbox): Promise<GitLog> {
  const expected = index.value?.years.find((entry) => entry.year === targetYear)?.passes
  if (!expected) throw new Error(`passes/index.json has no passes for ${targetYear}`)
  const request = ++requestId
  loading.value = true
  error.value = null
  try {
    const data = await loadCommitLog(targetYear, targetBbox, expected)
    if (request !== requestId) return data
    year.value = targetYear
    bbox.value = targetBbox
    log.value = data
    syncUrl()
    return data
  } catch (caught) {
    if (request === requestId) {
      error.value = messageOf(caught)
      log.value = null
    }
    throw caught
  } finally {
    if (request === requestId) loading.value = false
  }
}

async function start(): Promise<void> {
  indexLoading.value = true
  error.value = null
  try {
    const payload = await fetchGitIndex()
    index.value = payload
    const fallback = payload.years.some((entry) => entry.year === GIT_DEFAULT_YEAR)
      ? GIT_DEFAULT_YEAR
      : payload.years[payload.years.length - 1].year
    const requested = Number(route.query.y)
    const initialYear = payload.years.some((entry) => entry.year === requested)
      ? requested
      : fallback
    year.value = initialYear
    const parsed = parseBboxParam(typeof route.query.bbox === 'string' ? route.query.bbox : null)
    loading.value = true
    const target = parsed ?? (await loadDensestBox(initialYear))
    const data = await load(initialYear, target)
    pushLine(
      'muted',
      `loaded ${initialYear} · ${formatBbox(target, 2)} · ${formatInteger(data.totals.commits)} commits`,
    )
  } catch (caught) {
    error.value = messageOf(caught)
    loading.value = false
  } finally {
    indexLoading.value = false
  }
}

function onYear(next: number): void {
  if (next === year.value || !bbox.value) return
  void load(next, bbox.value).catch(() => undefined)
}

function onBbox(next: Bbox): void {
  void load(year.value, next).catch(() => undefined)
}

function retry(): void {
  if (bbox.value) void load(year.value, bbox.value).catch(() => undefined)
  else void start()
}

const terminalState = computed<TerminalState>(() => ({
  year: year.value,
  bbox: bbox.value,
  commits: log.value?.commits ?? [],
  displayedCount: displayedCount.value,
  cap: GIT_COMMIT_CAP,
  loading: loading.value,
}))

async function setLog(nextBbox: Bbox | null, nextYear: number | null): Promise<TerminalState> {
  const targetYear = nextYear ?? year.value
  const targetBbox = nextBbox ?? bbox.value
  if (!targetBbox) throw new Error('AOI not ready yet — the densest cell is still loading')
  if (!years.value.includes(targetYear)) {
    throw new Error(`year ${targetYear} is not in passes/index.json`)
  }
  await load(targetYear, targetBbox)
  return terminalState.value
}

const context: TerminalContext = {
  state: () => terminalState.value,
  setLog,
  loadBlame: async (lat, lon) => {
    const target = bbox.value
    if (!target) throw new Error('AOI not ready yet')
    return fetchBlame(year.value, target, lat, lon)
  },
  loadCells: async (commits): Promise<Map<string, GitCommitCells>> => {
    return fetchCommitCells(year.value, commits)
  },
}

async function onSubmit(value: string): Promise<void> {
  pushLine('echo', `> ${value}`)
  terminalBusy.value = true
  try {
    const result = await runCommand(value, context)
    if (result.clear) terminalLines.value = []
    for (const message of result.messages) pushLine(message.kind, message.text)
  } catch (caught) {
    pushLine('error', messageOf(caught))
  } finally {
    terminalBusy.value = false
  }
}

onMounted(() => {
  void fetchGeoOutline()
    .then((geo) => {
      outline.value = geo
    })
    .catch((caught: unknown) => {
      outlineError.value = messageOf(caught)
    })
  void start()
})
</script>

<template>
  <main class="flex h-[calc(100dvh-44px)] overflow-hidden bg-canvas">
    <section aria-label="Commit timeline" class="flex w-1/2 min-w-0 flex-col border-r border-edge">
      <div class="flex shrink-0 items-center justify-between gap-2 border-b border-edge px-3 py-1">
        <span class="font-mono text-2xs text-faint">
          <template v-if="displayedCount > 0">
            newest {{ formatInteger(displayedCount) }} of {{ formatInteger(commitCount) }}
          </template>
          <template v-else>{{ log ? 'no passes' : 'log' }}</template>
        </span>
        <div class="flex items-center gap-2">
          <GitLegend :sensor-max="sensorMax" />
          <span class="text-faint" aria-hidden="true">·</span>
          <span class="text-2xs uppercase tracking-[0.14em] text-faint">AOI plan</span>
          <GitToggleGroup v-model="planSize" label="AOI plan size" :options="PLAN_SIZE_OPTIONS" />
        </div>
      </div>

      <div class="scroll-thin min-h-0 flex-1 overflow-auto">
        <header
          class="sticky top-0 z-20 grid items-center border-b border-edge bg-canvas py-1"
          :style="grid"
        >
          <span class="text-2xs uppercase tracking-[0.14em] text-faint">time</span>
          <span class="text-right text-2xs uppercase tracking-[0.14em] text-viirs">VIIRS</span>
          <span class="text-center text-2xs uppercase tracking-[0.14em] text-faint">AOI plan</span>
          <span class="text-2xs uppercase tracking-[0.14em] text-modis">MODIS</span>
        </header>

        <p v-if="indexLoading" class="grid h-24 place-items-center font-mono text-xs text-muted">
          loading passes…
        </p>
        <p v-else-if="loading" class="grid h-24 place-items-center font-mono text-xs text-muted">
          loading {{ year }} passes…
        </p>
        <div
          v-else-if="error"
          role="alert"
          class="m-2 border border-danger/40 px-2 py-1 font-mono text-xs text-danger"
        >
          {{ error }}
          <button type="button" class="ml-2 underline" @click="retry">retry</button>
        </div>
        <p v-else-if="!log" class="grid h-24 place-items-center font-mono text-xs text-muted">
          No passes.
        </p>
        <p
          v-else-if="log.displayed.length === 0"
          class="m-2 border border-dashed border-edge px-2 py-3 text-xs text-muted"
        >
          No detections inside this box in {{ log.year }}. Drag a new AOI, or run
          <span class="font-mono text-ink">log &lt;lat0&gt; &lt;lat1&gt; &lt;lon0&gt; &lt;lon1&gt;</span>.
        </p>
        <GitTimeline v-else :log="log" :plan-size="planSize" />
      </div>
    </section>

    <div class="flex min-w-0 flex-1 flex-col">
      <GitBrief
        :bbox="bbox"
        :year="year"
        :years="years"
        :commits="commitCount"
        :authors="authors"
        :disabled="indexLoading || loading"
        :outline-error="outlineError"
        @year="onYear"
      />

      <GitDock
        :outline="regionOutline"
        :bbox="bbox"
        :density="density"
        :busy="loading || indexLoading"
        :lines="terminalLines"
        :terminal-busy="terminalBusy"
        @update:bbox="onBbox"
        @submit="onSubmit"
      />
    </div>
  </main>
</template>
