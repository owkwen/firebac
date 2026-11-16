<script setup lang="ts">
import { computed } from 'vue'
import type { DensityIndexYear } from '@/types/detections'

const props = defineProps<{
  years: DensityIndexYear[]
  modelValue: number
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const index = computed(() => props.years.findIndex((item) => item.year === props.modelValue))

function step(offset: number): void {
  const next = props.years[index.value + offset]
  if (next) emit('update:modelValue', next.year)
}
</script>

<template>
  <div class="flex items-center gap-1">
    <button
      type="button"
      aria-label="Previous year"
      :disabled="disabled || index <= 0"
      class="grid h-7 w-6 place-items-center rounded-[var(--radius)] border border-edge bg-sunken font-mono text-xs text-muted hover:text-ink disabled:opacity-40"
      @click="step(-1)"
    >
      ‹
    </button>
    <label class="flex items-center gap-2 text-2xs uppercase tracking-[0.14em] text-faint">
      year
      <select
        :value="modelValue"
        :disabled="disabled"
        class="h-7 rounded-[var(--radius)] border border-edge bg-sunken px-2 text-xs normal-case tracking-normal text-ink tnum focus:border-focus disabled:opacity-50"
        @change="$emit('update:modelValue', Number(($event.target as HTMLSelectElement).value))"
      >
        <option v-for="item in years" :key="item.year" :value="item.year">
          {{ item.year }}
        </option>
      </select>
    </label>
    <button
      type="button"
      aria-label="Next year"
      :disabled="disabled || index >= years.length - 1"
      class="grid h-7 w-6 place-items-center rounded-[var(--radius)] border border-edge bg-sunken font-mono text-xs text-muted hover:text-ink disabled:opacity-40"
      @click="step(1)"
    >
      ›
    </button>
  </div>
</template>
