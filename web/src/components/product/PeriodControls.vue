<script setup lang="ts">
import type { CalendarState } from '@/types/calendar'
import { MONTH_LABELS } from '@/lib/constants'

const props = defineProps<{
  year: number
  month: number
  years: readonly number[]
}>()

const emit = defineEmits<{ update: [patch: Partial<CalendarState>] }>()

function setYear(event: Event): void {
  const value = Number((event.target as HTMLSelectElement).value)
  if (Number.isInteger(value)) emit('update', { year: value })
}

function setMonth(event: Event): void {
  const value = Number((event.target as HTMLSelectElement).value)
  if (Number.isInteger(value)) emit('update', { month: value })
}

function stepYear(direction: -1 | 1): void {
  const index = props.years.indexOf(props.year)
  const next = props.years[index + direction]
  if (next !== undefined) emit('update', { year: next })
}

const selectClass =
  'h-7 rounded-[var(--radius)] border border-edge bg-sunken px-1.5 text-xs text-ink tnum'
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
    <div class="flex items-center gap-1.5">
      <span class="text-2xs uppercase tracking-[0.12em] text-faint">year</span>
      <div class="flex items-center gap-0.5">
        <button
          type="button"
          class="grid h-7 w-6 place-items-center rounded-[var(--radius)] border border-edge bg-sunken text-xs text-muted transition-colors duration-[90ms] hover:text-ink disabled:opacity-40"
          :disabled="year <= years[0]"
          aria-label="Previous year"
          @click="stepYear(-1)"
        >
          ‹
        </button>
        <select :value="year" :class="selectClass" aria-label="Year" @change="setYear">
          <option v-for="option in years" :key="option" :value="option">{{ option }}</option>
        </select>
        <button
          type="button"
          class="grid h-7 w-6 place-items-center rounded-[var(--radius)] border border-edge bg-sunken text-xs text-muted transition-colors duration-[90ms] hover:text-ink disabled:opacity-40"
          :disabled="year >= years[years.length - 1]"
          aria-label="Next year"
          @click="stepYear(1)"
        >
          ›
        </button>
      </div>
    </div>
    <label class="flex items-center gap-1.5 text-2xs uppercase tracking-[0.12em] text-faint">
      month
      <select :value="month" :class="selectClass" aria-label="Month" @change="setMonth">
        <option v-for="(label, index) in MONTH_LABELS" :key="label" :value="index + 1">{{ label }}</option>
      </select>
    </label>
  </div>
</template>
