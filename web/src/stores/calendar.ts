import { defineStore } from 'pinia'
import { ref } from 'vue'
import { loadCalendar, loadGrid, loadRegions } from '@/lib/artifacts'
import { messageOf } from '@/lib/utils'
import type { CalendarArtifact } from '@/types/calendar'
import type { GridArtifact } from '@/types/grid'
import type { RegionEntry } from '@/types/meta'

export const useCalendarStore = defineStore('calendar', () => {
  const regions = ref<RegionEntry[]>([])
  const calendar = ref<CalendarArtifact | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const grid = ref<GridArtifact | null>(null)
  const gridLoading = ref(false)
  const gridError = ref<string | null>(null)
  let gridRequest = 0

  async function open(requested: string): Promise<string | null> {
    loading.value = true
    error.value = null
    try {
      const list = await loadRegions()
      regions.value = list
      const code = list.some((entry) => entry.code === requested)
        ? requested
        : (list[0]?.code ?? 'CA')
      calendar.value = await loadCalendar(code)
      return code
    } catch (caught) {
      calendar.value = null
      error.value = messageOf(caught)
      return null
    } finally {
      loading.value = false
    }
  }

  async function openGrid(region: string, year: number, skip: boolean): Promise<void> {
    const id = ++gridRequest
    if (skip) {
      grid.value = null
      gridError.value = null
      gridLoading.value = false
      return
    }
    gridLoading.value = true
    gridError.value = null
    try {
      const next = await loadGrid(region, year)
      if (id === gridRequest) grid.value = next
    } catch (caught) {
      if (id === gridRequest) {
        grid.value = null
        gridError.value = messageOf(caught)
      }
    } finally {
      if (id === gridRequest) gridLoading.value = false
    }
  }

  return { regions, calendar, loading, error, grid, gridLoading, gridError, open, openGrid }
})
