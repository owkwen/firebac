<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import PipelineDiagram from '@/components/data/PipelineDiagram.vue'
import PipelineLegend from '@/components/data/PipelineLegend.vue'
import { loadCalendar, loadDensityIndex, loadMeta, loadModel, loadRegions } from '@/lib/artifacts'
import { CALENDAR_DEFAULTS } from '@/lib/constants'
import { formatBuildDate, formatInteger } from '@/lib/format'
import { buildPipeline } from '@/lib/pipeline'
import { messageOf } from '@/lib/utils'
import type { MetaArtifact } from '@/types/meta'
import type { PipelineModel } from '@/types/pipeline'

const route = useRoute()
const region = typeof route.query.r === 'string' ? route.query.r : CALENDAR_DEFAULTS.region
const pipeline = ref<PipelineModel | null>(null)
const meta = ref<MetaArtifact | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

const aoiSpan = computed(() => {
  const years = pipeline.value?.counts.aoiYears ?? []
  if (years.length === 0) return 'not published'
  return `${years[0]}–${years[years.length - 1]}`
})

const buildSpan = computed(() => {
  const years = pipeline.value?.counts.buildYears ?? []
  if (years.length === 0) return 'not published'
  return `${years[0]}–${years[years.length - 1]}`
})

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const [metaData, modelData, calendarData, densityData, regionsData] = await Promise.all([
      loadMeta(region),
      loadModel(region),
      loadCalendar(region),
      loadDensityIndex(),
      loadRegions(),
    ])
    meta.value = metaData
    pipeline.value = buildPipeline({
      region,
      meta: metaData,
      model: modelData,
      calendar: calendarData,
      density: densityData,
      regions: regionsData,
    })
    await nextTick()
    const hash = window.location.hash.slice(1)
    if (hash) document.getElementById(decodeURIComponent(hash))?.scrollIntoView({ block: 'start' })
  } catch (caught) {
    error.value = messageOf(caught)
  } finally {
    loading.value = false
  }
}

function openStage(id: string): void {
  const target = document.getElementById(id)
  if (!target) return
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${id}`)
  target.scrollIntoView({ block: 'start' })
  target.focus({ preventScroll: true })
}

onMounted(() => void load())
</script>

<template>
  <main class="mx-auto max-w-[1180px] px-4 pb-24">
    <div v-if="loading" class="grid min-h-[50vh] place-items-center font-mono text-xs text-muted">
      <span class="animate-pulse">loading the pipeline…</span>
    </div>

    <div
      v-else-if="error"
      role="alert"
      class="mt-12 rounded-xl border border-danger/40 bg-danger/10 px-5 py-4 font-mono text-xs text-danger"
    >
      {{ error }}
      <button type="button" class="ml-2 underline" @click="load">retry</button>
    </div>

    <template v-else-if="pipeline && meta">
      <header class="pt-16 pb-12">
        <h1 class="text-3xl font-medium leading-tight tracking-tight text-ink md:text-4xl lg:text-5xl">Data</h1>
        <p class="mt-3 font-mono text-xs leading-4 text-faint">
          meta/{{ pipeline.counts.region }}.json · model/{{ pipeline.counts.region }}.json · density/index.json ·
          regions.json · built {{ formatBuildDate(pipeline.counts.generatedUtc) }} UTC
        </p>
        <p class="mt-6 max-w-[62ch] text-base leading-relaxed text-muted">
          From a NASA FIRMS CSV to a counted 0.01° cell-day: the stages that build the record, and the artifacts each
          one publishes. Every count is read from the artifacts; a field the build does not publish says
          <span class="font-mono text-xs">not published</span>.
        </p>
      </header>

      <dl class="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-edge bg-edge sm:grid-cols-3 lg:grid-cols-6">
        <div class="bg-panel px-5 py-5">
          <dt class="text-xs leading-4 text-faint">region</dt>
          <dd class="mt-0.5 font-mono text-base leading-6 font-medium text-ink">{{ pipeline.counts.regionName }} · {{ pipeline.counts.region }}</dd>
        </div>
        <div class="bg-panel px-5 py-5">
          <dt class="text-xs leading-4 text-faint">inputs</dt>
          <dd class="mt-0.5 font-mono text-base leading-6 font-medium text-ink tnum">{{ formatInteger(pipeline.counts.inputs) }} files</dd>
        </div>
        <div class="bg-panel px-5 py-5">
          <dt class="text-xs leading-4 text-faint">detections</dt>
          <dd class="mt-0.5 font-mono text-base leading-6 font-medium text-ink tnum">{{ formatInteger(pipeline.counts.detections) }}</dd>
        </div>
        <div class="bg-panel px-5 py-5">
          <dt class="text-xs leading-4 text-faint">cell-days</dt>
          <dd class="mt-0.5 font-mono text-base leading-6 font-medium text-ink tnum">{{ formatInteger(pipeline.counts.cellDays) }}</dd>
        </div>
        <div class="bg-panel px-5 py-5">
          <dt class="text-xs leading-4 text-faint">calendar years</dt>
          <dd class="mt-0.5 font-mono text-base leading-6 font-medium text-ink tnum">{{ buildSpan }}</dd>
        </div>
        <div class="bg-panel px-5 py-5">
          <dt class="text-xs leading-4 text-faint">AOI years</dt>
          <dd class="mt-0.5 font-mono text-base leading-6 font-medium text-ink tnum">{{ aoiSpan }}</dd>
        </div>
      </dl>

      <section class="mt-16" aria-labelledby="flow-heading">
        <div class="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
          <h2 id="flow-heading" class="text-xl font-medium leading-snug tracking-tight text-ink md:text-2xl">Pipeline</h2>
          <PipelineLegend />
        </div>
        <p class="mt-4 max-w-[72ch] text-[14px] leading-normal text-muted">
          Two paths share one source. The build path turns raw CSVs into cell-days, calibrates the correction and
          publishes JSON. The AOI path ships per-year Parquet and queries it in the browser. Dashed stages were tested
          and not used. <span class="text-faint">Live means shipped in this build, not a live feed: the FIRMS archive
          ends with the 2025 files.</span>
        </p>
        <PipelineDiagram class="mt-8" :stages="pipeline.allStages" @select="openStage" />
      </section>

    </template>
  </main>
</template>
