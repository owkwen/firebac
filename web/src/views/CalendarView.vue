<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import CalendarHeatmap from '@/components/product/CalendarHeatmap.vue'
import CalendarStats from '@/components/product/CalendarStats.vue'
import DetailStrip from '@/components/product/DetailStrip.vue'
import DownloadBar from '@/components/product/DownloadBar.vue'
import GridMap from '@/components/product/GridMap.vue'
import PeriodControls from '@/components/product/PeriodControls.vue'
import SeasonProfile from '@/components/product/SeasonProfile.vue'
import { annualOf, cellKey, indexCells, recoveryGap } from '@/lib/aggregate'
import type { CellTable } from '@/lib/aggregate'
import { fetchGeoOutline } from '@/lib/geo'
import { MONTH_LABELS, MONTH_NAMES, CALENDAR_SYSTEMS, SERIES_LABELS } from '@/lib/constants'
import { formatInteger, formatRatioShort, formatSignedPercent } from '@/lib/format'
import { buildSeasonProfile } from '@/lib/season'
import { calendarQuery, readCalendarState } from '@/lib/url'
import { useCalendarStore } from '@/stores/calendar'
import type { CalendarState, ResolutionMode, SystemMark } from '@/types/calendar'
import type { GeoCollection } from '@/types/geo'

const route = useRoute()
const router = useRouter()
const store = useCalendarStore()

const codes = computed(() => store.regions.map((region) => region.code))
const search = computed(() => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(route.query)) {
    if (typeof value === 'string') params.set(key, value)
  }
  return params.toString()
})
const state = computed<CalendarState>(() =>
  readCalendarState(search.value, codes.value, store.calendar?.years ?? []),
)
const calendar = computed(() => store.calendar)
const regionName = computed(
  () => store.regions.find((region) => region.code === state.value.region)?.name ?? state.value.region,
)
const annual = computed(() =>
  calendar.value ? annualOf(calendar.value.annual, state.value.year) : null,
)
const cells = computed<CellTable>(() =>
  calendar.value ? indexCells(calendar.value.cells) : new Map(),
)
const cell = computed(() => cells.value.get(cellKey(state.value.year, state.value.month)) ?? null)
const nonComparable = computed(
  () => calendar.value?.non_comparable_years.includes(state.value.year) ?? false,
)
const noSensor = computed(
  () =>
    state.value.series !== 'modis' &&
    calendar.value !== null &&
    state.value.year < calendar.value.harmonized_from,
)
const season = computed(() =>
  calendar.value ? buildSeasonProfile(calendar.value, state.value.year, state.value.series) : null,
)
const seriesLabel = computed(() => SERIES_LABELS[state.value.series])

/**
 * Corner badges describe the record, not the selected series, so they stay in
 * every mode. The artifact publishes the first month as `YYYY-MM`.
 */
const systemMarks = computed<SystemMark[]>(() => {
  const constellation = calendar.value?.constellation
  if (!constellation) return []
  return CALENDAR_SYSTEMS.flatMap((entry) => {
    const value = constellation[entry.field]
    const [yearText, monthText] = value.split('-')
    const year = Number(yearText)
    const month = Number(monthText)
    if (!Number.isInteger(year) || month < 1 || month > 12) return []
    const since = `${MONTH_LABELS[month - 1]} ${year}`
    return [{
      sensor: entry.sensor,
      key: cellKey(year, month),
      year,
      month,
      label: `${entry.system} from ${since}`,
    }]
  })
})

/** Aggregation only: the artifact already publishes month totals as cells. */
const peakMonth = computed(() => {
  const year = state.value.year
  const totals = Array.from({ length: 12 }, () => 0)
  let seen = false
  for (const cell of calendar.value?.cells ?? []) {
    if (cell.y !== year) continue
    totals[cell.m - 1] += cell.modis
    seen = true
  }
  if (!seen) return null
  let best = 0
  for (let index = 1; index < totals.length; index += 1) {
    if (totals[index] > totals[best]) best = index
  }
  return { month: best + 1, total: totals[best] }
})

const seriesValue = computed(() => {
  const row = annual.value
  if (!row) return null
  return row[state.value.series]
})
const seriesText = computed(() => {
  const value = seriesValue.value
  return value === null ? '—' : formatInteger(value)
})
const ratioValue = computed(() => formatRatioShort(annual.value?.ratio[state.value.series] ?? null))
const gap = computed(() => (annual.value ? recoveryGap(annual.value) : null))
const recovered = computed(() => (gap.value === null ? '—' : formatSignedPercent(gap.value)))
const recoveredNote = computed(() =>
  gap.value === null
    ? `VIIRS begins ${calendar.value?.harmonized_from ?? 2012}`
    : 'extra burning days that MODIS missed',
)

/** The third card changes meaning with the mode, never compares across modes. */
const seriesInsight = computed<{ label: string; value: string; note: string }>(() => {
  const from = calendar.value?.harmonized_from ?? 2012
  if (state.value.series === 'modis') {
    const peak = peakMonth.value
    return {
      label: 'Peak month',
      value: peak ? MONTH_NAMES[peak.month - 1] : '—',
      note: peak ? `${formatInteger(peak.total)} cell-days` : 'no MODIS data this year',
    }
  }
  if (state.value.series === 'viirs') {
    if ((annual.value?.viirs ?? null) === null) {
      return {
        label: 'VIIRS begins',
        value: String(from),
        note: 'no VIIRS data this year',
      }
    }
    const modis = annual.value?.modis ?? null
    return {
      label: 'MODIS, same year',
      value: modis === null ? '—' : formatInteger(modis),
      note: 'raw counts; not comparable with MODIS',
    }
  }
  return { label: 'Recovered by VIIRS', value: recovered.value, note: recoveredNote.value }
})

const partialYears = computed(() => {
  const years = calendar.value?.non_comparable_years ?? []
  if (years.length === 0) return ''
  const last = years[years.length - 1]
  return years.length > 1 ? `${years[0]}–${last} partial` : `${last} partial`
})

const outline = ref<GeoCollection | null>(null)

function resolveRegionCode(): string {
  return typeof route.query.r === 'string' ? route.query.r : ''
}

async function load(): Promise<void> {
  const code = await store.open(resolveRegionCode())
  if (!code) return
  const expected = calendarQuery(state.value)
  const current = route.query
  const same =
    Object.keys(current).length === Object.keys(expected).length &&
    Object.entries(expected).every(([key, value]) => current[key] === value)
  if (!same) await router.replace({ query: expected })
  void refreshGrid()
}

async function loadOutline(): Promise<void> {
  try {
    outline.value = await fetchGeoOutline()
  } catch {
    // The cells still render; the coastline is an enhancement, not the data.
    outline.value = null
  }
}

function refreshGrid(): void {
  if (!calendar.value) return
  void store.openGrid(state.value.region, state.value.year, noSensor.value)
}

function update(patch: Partial<CalendarState>): void {
  void router.replace({ query: calendarQuery({ ...state.value, ...patch }) })
}

function selectCell(year: number, month: number): void {
  update({ year, month })
}

function selectMonth(month: number): void {
  update({ month })
}

function setResolution(resolution: ResolutionMode): void {
  update(resolution === 'day' ? { resolution, metric: 'counts' } : { resolution })
}

watch(
  () => [state.value.region, state.value.year, state.value.series],
  () => refreshGrid(),
)

onMounted(() => {
  void load()
  void loadOutline()
})
</script>

<template>
  <main class="mx-auto max-w-[1600px] px-3 pb-8">
    <div v-if="store.loading" class="grid min-h-64 place-items-center font-mono text-xs text-muted">
      <span class="animate-pulse">loading</span>
    </div>

    <div v-else-if="store.error" role="alert" class="my-3 rounded-[var(--radius)] border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-2xs text-danger">
      {{ store.error }}
      <button type="button" class="ml-2 underline" @click="load">retry</button>
    </div>

    <template v-else-if="calendar">
      <h1 class="sr-only">{{ regionName }} burning activity calendar</h1>

      <div class="mt-3">
        <CalendarHeatmap
          :cells="calendar.cells"
          :years="calendar.years"
          :months="calendar.months"
          :series="state.series"
          :metric="state.metric"
          :resolution="state.resolution"
          :series-rows="calendar.series"
          :harmonized-from="calendar.harmonized_from"
          :non-comparable-note="calendar.non_comparable_note"
          :partial-years="partialYears"
          :system-marks="systemMarks"
          :selected="{ year: state.year, month: state.month }"
          @select="selectCell"
          @update:series="update({ series: $event })"
          @update:metric="update({ metric: $event })"
          @update:resolution="setResolution"
        />
      </div>

      <div class="mt-3">
        <CalendarStats
          :burning-days="seriesText"
          :ratio="ratioValue"
          :third-label="seriesInsight.label"
          :third-value="seriesInsight.value"
          :third-note="seriesInsight.note"
        />
      </div>

      <section class="mt-3 rounded-[var(--radius)] border border-edge bg-panel" aria-labelledby="season-map-title">
        <header class="flex flex-wrap items-center justify-between gap-2 border-b border-edge px-3 py-1.5">
          <div class="flex flex-wrap items-baseline gap-2">
            <h2 id="season-map-title" class="text-2xs font-semibold uppercase tracking-[0.14em] text-ink">
              Season profile and map
            </h2>
            <span class="font-mono text-2xs text-faint">
              {{ MONTH_NAMES[state.month - 1] }} {{ state.year }} · {{ seriesLabel }}
            </span>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <RouterLink
              :to="{ path: '/region', query: { r: state.region } }"
              class="text-xs text-muted transition-colors duration-[90ms] hover:text-ink"
            >
              Explore an area →
            </RouterLink>
            <PeriodControls
              :year="state.year"
              :month="state.month"
              :years="calendar.years"
              @update="update"
            />
          </div>
        </header>

        <div class="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_420px]">
          <SeasonProfile
            v-if="season"
            :year="state.year"
            :mode="state.series"
            :values="season.values"
            :p25="season.p25"
            :p75="season.p75"
            :no-sensor="noSensor"
          />
          <GridMap
            :grid="store.grid"
            :year="state.year"
            :month="state.month"
            :series="state.series"
            :loading="store.gridLoading"
            :error="store.gridError"
            :no-sensor="noSensor"
            :outline="outline"
            @select="selectMonth"
          />
        </div>
      </section>

      <div class="mt-3">
        <DetailStrip
          :cell="cell"
          :year="state.year"
          :month="state.month"
          :non-comparable="nonComparable"
          :note="calendar.non_comparable_note"
        />
      </div>

      <div class="mt-3">
        <DownloadBar :region="state.region" :year="state.year" />
      </div>
    </template>
  </main>
</template>
