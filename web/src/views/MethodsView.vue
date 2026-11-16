<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import InputFiles from '@/components/product/InputFiles.vue'
import MethodBins from '@/components/product/MethodBins.vue'
import { loadCalendar, loadMeta, loadModel } from '@/lib/artifacts'
import { CALENDAR_DEFAULTS } from '@/lib/constants'
import { formatBuildDate, formatInteger } from '@/lib/format'
import { messageOf } from '@/lib/utils'
import type { CalendarArtifact } from '@/types/calendar'
import type { MetaArtifact } from '@/types/meta'
import type { ModelArtifact } from '@/types/model'

const route = useRoute()
const region = computed(() =>
  typeof route.query.r === 'string' ? route.query.r : CALENDAR_DEFAULTS.region,
)
const model = ref<ModelArtifact | null>(null)
const meta = ref<MetaArtifact | null>(null)
const calendar = ref<CalendarArtifact | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

const scoreRows = computed(() => {
  const scores = model.value?.validation.log_loss_canada_2023
  if (!scores) return []
  return [
    { label: 'FRP only', value: scores.frp.toFixed(3) },
    { label: 'Multiplicity only', value: scores.multiplicity.toFixed(4) },
    { label: 'FRP + multiplicity', value: scores.frp_multiplicity.toFixed(3) },
  ]
})

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const [modelData, metaData, calendarData] = await Promise.all([
      loadModel(region.value),
      loadMeta(region.value),
      loadCalendar(region.value),
    ])
    model.value = modelData
    meta.value = metaData
    calendar.value = calendarData
  } catch (caught) {
    error.value = messageOf(caught)
  } finally {
    loading.value = false
  }
}

watch(() => route.query.r, () => void load(), { immediate: true })
</script>

<template>
  <div class="pb-6">
    <div v-if="loading" class="grid min-h-64 place-items-center font-mono text-xs text-muted">
      <span class="animate-pulse">loading methods…</span>
    </div>

    <div v-else-if="error" role="alert" class="mt-3 rounded-[var(--radius)] border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-2xs text-danger">
      {{ error }}
      <button type="button" class="ml-2 underline" @click="load">retry</button>
    </div>

    <template v-else-if="model && meta && calendar">
      <header class="py-3">
        <h2 id="methods-title" class="text-base font-semibold tracking-tight text-ink">Methods</h2>
        <p class="font-mono text-2xs text-faint">
          model/{{ region }}.json · {{ model.method }} · unit: {{ model.unit }} · built {{ formatBuildDate(meta.generated_utc) }} UTC
        </p>
      </header>

      <div class="space-y-3">
        <section class="rounded-[var(--radius)] border border-edge bg-panel p-3">
          <h3 class="text-2xs font-semibold uppercase tracking-[0.14em] text-ink">The unit</h3>
          <p class="mt-1.5 text-sm leading-6 text-muted">
            An artifact row is a <strong class="font-semibold text-ink">0.01° cell-day</strong>: one grid cell on one
            date, aggregated over every detection that day by one sensor. FIRMS reports hot pixels, and one detection
            is one pixel. Counting cell-days instead stops a long pass, a wider footprint, or repeated looks at the
            same fire from inflating the record, and puts both sensors on the published grid. Raw pixel totals
            (<code class="font-mono text-2xs">modis_px</code>, <code class="font-mono text-2xs">viirs_px</code>) stay
            in the cell detail.
          </p>
        </section>

        <section class="rounded-[var(--radius)] border border-edge bg-panel p-3">
          <h3 class="text-2xs font-semibold uppercase tracking-[0.14em] text-ink">Two series, one boundary</h3>
          <p class="mt-1.5 text-sm leading-6 text-muted">
            <strong class="font-semibold text-ink">MODIS</strong> runs continuously from 2000 to 2025.
            <strong class="font-semibold text-ink">Harmonized</strong> runs from 2012 to 2025 and adds, for every
            VIIRS-only cell-day, the probability that MODIS also saw it:
            <code class="font-mono text-2xs">{{ model.estimate }}</code>.
          </p>
          <p class="mt-1.5 text-sm leading-6 text-muted">
            The gap at 2012 is a sensor boundary, not a fire event. Before 2012 the harmonized value is
            <code class="font-mono text-2xs">null</code>, never zero; the calendar hatches those rows and the map
            refuses to draw them.
          </p>
        </section>

        <section class="rounded-[var(--radius)] border border-edge bg-panel p-3">
          <h3 class="text-2xs font-semibold uppercase tracking-[0.14em] text-ink">The correction</h3>
          <p class="mt-1.5 text-sm leading-6 text-muted">
            Each VIIRS-only cell-day is weighted by <code class="font-mono text-2xs">P</code> from its multiplicity
            bin; <code class="font-mono text-2xs">1 / P</code> is how many cell-days that bin stands for. Multiplicity
            beats a constant because an isolated detection is weak evidence of a missed MODIS pass, while a dense
            cluster is strong evidence: a single factor would overcount sparse burns and undercount dense ones.
          </p>
          <div class="mt-2">
            <MethodBins :bins="model.multiplicity_bins" />
          </div>
          <p class="mt-1.5 text-2xs text-faint">
            Calibration window 2012–2022, held fixed after; 2023–2025 are out of sample.
          </p>
        </section>

        <section class="rounded-[var(--radius)] border border-edge bg-panel p-3">
          <h3 class="text-2xs font-semibold uppercase tracking-[0.14em] text-ink">Validation</h3>
          <p class="mt-1.5 text-sm leading-6 text-muted">
            Out-of-sample test: {{ model.validation.transfer }}. {{ model.validation.shape }}.
          </p>
          <table class="mt-2 w-full max-w-md border-collapse text-left text-2xs tnum">
            <caption class="sr-only">Log loss on Canada 2023 by feature set</caption>
            <thead>
              <tr class="border-b border-edge-strong text-faint">
                <th scope="col" class="py-1 pr-3 font-normal uppercase tracking-[0.12em]">Features</th>
                <th scope="col" class="py-1 text-right font-normal uppercase tracking-[0.12em]">Log loss</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in scoreRows" :key="row.label" class="border-b border-edge/60">
                <td class="py-1 pr-3 text-muted">{{ row.label }}</td>
                <td class="py-1 text-right font-mono text-ink">{{ row.value }}</td>
              </tr>
            </tbody>
          </table>
          <p class="mt-1.5 text-2xs text-muted">
            Lower log loss is better. Expected calibration error
            <span class="font-mono text-ink">{{ model.validation.ece.toFixed(4) }}</span>.
          </p>
        </section>

        <section class="rounded-[var(--radius)] border border-edge bg-panel p-3">
          <h3 class="text-2xs font-semibold uppercase tracking-[0.14em] text-ink">Caveats</h3>
          <ul class="mt-1.5 list-disc space-y-1 pl-4 text-sm leading-6 text-muted">
            <li v-for="caveat in model.caveats" :key="caveat">{{ caveat }}</li>
          </ul>
        </section>

        <section class="rounded-[var(--radius)] border border-edge bg-panel p-3">
          <h3 class="text-2xs font-semibold uppercase tracking-[0.14em] text-ink">Data</h3>
          <dl class="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-4">
            <div>
              <dt class="text-2xs uppercase tracking-[0.12em] text-faint">detections</dt>
              <dd class="font-mono text-ink tnum">{{ formatInteger(meta.rows.detections) }}</dd>
            </div>
            <div>
              <dt class="text-2xs uppercase tracking-[0.12em] text-faint">cell-days</dt>
              <dd class="font-mono text-ink tnum">{{ formatInteger(meta.rows.cell_days) }}</dd>
            </div>
            <div>
              <dt class="text-2xs uppercase tracking-[0.12em] text-faint">inputs</dt>
              <dd class="font-mono text-ink tnum">{{ formatInteger(meta.inputs.length) }} files</dd>
            </div>
            <div>
              <dt class="text-2xs uppercase tracking-[0.12em] text-faint">built</dt>
              <dd class="font-mono text-ink">{{ meta.generated_utc }}</dd>
            </div>
          </dl>
          <p class="mt-2 border-t border-edge/60 pt-2 text-sm leading-6 text-muted">
            {{ calendar.constellation.note }}
          </p>
          <p class="mt-1 text-sm leading-6 text-muted">
            Suomi NPP stopped delivering on 2 November 2026, so this VIIRS record ends at the
            archive boundary. NOAA-20 (2018–2025) is downloaded for cross-platform validation and
            is deliberately kept out of the published series: merging platforms would move every
            multiplicity bin and change the published numbers.
          </p>
          <p class="mt-1 text-sm leading-6 text-muted">
            2002-03 is flagged sparse rather than treated as a record low: one detection on one day
            is a gap in the archive, not a quiet month.
          </p>
          <div class="mt-2">
            <InputFiles :inputs="meta.inputs" />
          </div>
          <p class="mt-1.5 font-mono text-2xs text-faint">
            DuckDB {{ meta.software.duckdb }} · pandas {{ meta.software.pandas }} · grid
            {{ meta.grid_deg }}° / map {{ meta.map_deg }}°
          </p>
        </section>

        <section class="rounded-[var(--radius)] border border-edge bg-panel p-3">
          <h3 class="text-2xs font-semibold uppercase tracking-[0.14em] text-ink">Licence and provenance</h3>
          <p class="mt-1.5 text-sm leading-6 text-muted">
            Active-fire detections come from NASA FIRMS, the Fire Information for Resource Management System
            (<a class="text-ink underline decoration-edge-strong underline-offset-2" href="https://firms.modaps.eosdis.nasa.gov/">firms.modaps.eosdis.nasa.gov</a>),
            produced from MODIS and VIIRS instruments and distributed by NASA ESDIS. Cite NASA FIRMS when reusing
            these numbers. The map coastline is Natural Earth 110m, public domain.
          </p>
        </section>

        <section class="rounded-[var(--radius)] border border-edge bg-panel p-3">
          <h3 class="text-2xs font-semibold uppercase tracking-[0.14em] text-ink">AI disclosure</h3>
          <p class="mt-1.5 text-sm leading-6 text-muted">
            Model fits, pipeline and interface were built with AI assistance; the data and the published numbers are
            reproducible with
            <code class="font-mono text-2xs text-ink">uv run python -m firms.artifacts</code>.
          </p>
        </section>
      </div>
    </template>
  </div>
</template>
