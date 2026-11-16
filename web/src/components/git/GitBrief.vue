<script setup lang="ts">
import { computed } from 'vue'
import type { Bbox, GitAuthorTotals } from '@/types/git'
import { formatInteger } from '@/lib/format'
import { formatBbox } from '@/lib/git'

const props = defineProps<{
  bbox: Bbox | null
  year: number
  years: readonly number[]
  commits: number
  authors: readonly GitAuthorTotals[]
  disabled: boolean
  outlineError: string | null
}>()

const emit = defineEmits<{ year: [value: number] }>()

const index = computed(() => props.years.indexOf(props.year))
const canStepBack = computed(() => index.value > 0)
const canStepForward = computed(
  () => index.value >= 0 && index.value < props.years.length - 1,
)

function step(direction: -1 | 1): void {
  const next = props.years[index.value + direction]
  if (next !== undefined) emit('year', next)
}
</script>

<template>
  <section aria-label="Git brief" class="shrink-0 border-b border-edge px-3 py-1">
    <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <h1 class="text-sm font-semibold tracking-tight text-ink">git log</h1>
      <span class="ml-auto font-mono text-2xs text-muted tnum">
        {{ bbox ? formatBbox(bbox) : 'AOI pending' }}
      </span>
    </div>

    <div class="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-2xs">
      <span class="tnum text-ink">{{ formatInteger(commits) }} commits</span>
      <template v-for="author in authors" :key="author.satellite">
        <span class="text-faint" aria-hidden="true">·</span>
        <span :class="author.sensor === 'MODIS' ? 'text-modis' : 'text-viirs'">
          {{ author.satellite }}
        </span>
        <span class="tnum text-muted">{{ formatInteger(author.commits) }}</span>
      </template>

      <span class="ml-auto flex items-center gap-0.5">
        <span class="mr-0.5 text-faint">year</span>
        <button
          type="button"
          aria-label="Previous year"
          :disabled="disabled || !canStepBack"
          class="grid h-5 w-5 place-items-center rounded-[var(--radius)] border border-edge bg-sunken font-mono text-xs leading-none text-muted hover:text-ink disabled:opacity-35"
          @click="step(-1)"
        >
          ‹
        </button>
        <select
          :value="year"
          :disabled="disabled"
          aria-label="Log year"
          class="h-5 rounded-[var(--radius)] border border-edge bg-sunken px-1 font-mono text-2xs text-ink disabled:opacity-50"
          @change="emit('year', Number(($event.target as HTMLSelectElement).value))"
        >
          <option v-for="item in years" :key="item" :value="item">{{ item }}</option>
        </select>
        <button
          type="button"
          aria-label="Next year"
          :disabled="disabled || !canStepForward"
          class="grid h-5 w-5 place-items-center rounded-[var(--radius)] border border-edge bg-sunken font-mono text-xs leading-none text-muted hover:text-ink disabled:opacity-35"
          @click="step(1)"
        >
          ›
        </button>
      </span>
    </div>

    <p v-if="outlineError" class="mt-0.5 text-2xs text-warn">
      Coastline unavailable: {{ outlineError }}
    </p>
  </section>
</template>
