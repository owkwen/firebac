import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { DatasetInfo } from '@/types/dataset'
import type { FilterState } from '@/types/filters'
import { FALLBACK_DATE_FROM, FALLBACK_DATE_TO, FIRE_TYPES, SENSORS } from '@/lib/constants'
import { cloneFilters, sameFilters } from '@/lib/filters'

function emptyFilters(): FilterState {
  return {
    datasets: [],
    sensors: [...SENSORS],
    dateFrom: FALLBACK_DATE_FROM,
    dateTo: FALLBACK_DATE_TO,
    types: FIRE_TYPES.map((type) => type.value),
    modisMin: 0,
    viirsMin: 'l',
  }
}

export const useExploreStore = defineStore('explore', () => {
  const datasets = ref<DatasetInfo[]>([])
  const filters = ref<FilterState>(emptyFilters())
  const applied = ref<FilterState>(emptyFilters())
  const runSeq = ref(0)

  const dirty = computed(() => !sameFilters(filters.value, applied.value))

  function initialise(available: DatasetInfo[], initial: FilterState): void {
    datasets.value = available
    filters.value = cloneFilters(initial)
    applied.value = cloneFilters(initial)
  }

  function updateFilters(next: FilterState): void {
    filters.value = next
  }

  function apply(): void {
    applied.value = cloneFilters(filters.value)
    runSeq.value += 1
  }

  return { datasets, filters, applied, runSeq, dirty, initialise, updateFilters, apply }
})
