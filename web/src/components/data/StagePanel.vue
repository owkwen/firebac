<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { STAGE_STATUS_LABELS } from '@/lib/pipeline'
import type { PipelineStage } from '@/types/pipeline'

const props = defineProps<{ stage: PipelineStage }>()

type CopyState = 'idle' | 'ok' | 'error'

const copied = ref<CopyState>('idle')
let timer: ReturnType<typeof setTimeout> | null = null

const statusClass = computed(() => {
  if (props.stage.status === 'live') return 'text-ok'
  if (props.stage.status === 'validation') return 'text-warn'
  return 'text-danger'
})

const copyMessage = computed(() => {
  if (copied.value === 'ok') return 'copied'
  if (copied.value === 'error') return 'copy failed'
  return ''
})

async function copyLink(): Promise<void> {
  const url = `${window.location.origin}${window.location.pathname}${window.location.search}#${props.stage.id}`
  try {
    await navigator.clipboard.writeText(url)
    copied.value = 'ok'
  } catch {
    copied.value = 'error'
  }
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    copied.value = 'idle'
  }, 1800)
}

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})
</script>

<template>
  <article
    :id="stage.id"
    tabindex="-1"
    class="scroll-mt-14 rounded-[var(--radius)] border border-edge bg-panel p-3 target:border-edge-strong"
    :class="stage.status === 'rejected' ? 'border-dashed' : ''"
  >
    <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h3 class="text-sm font-semibold tracking-tight text-ink">{{ stage.title }}</h3>
      <div class="flex flex-wrap items-center gap-2 font-mono text-2xs">
        <span :class="statusClass">{{ STAGE_STATUS_LABELS[stage.status] }}</span>
        <span class="text-faint">·</span>
        <code class="text-faint">#{{ stage.id }}</code>
        <button
          type="button"
          class="rounded-[var(--radius)] border border-edge px-1.5 py-0.5 text-faint transition-colors duration-[90ms] hover:border-edge-strong hover:text-ink"
          @click="copyLink"
        >
          copy link
        </button>
        <span role="status" class="text-faint">{{ copyMessage }}</span>
      </div>
    </div>

    <p class="mt-1.5 text-xs leading-5 text-muted">{{ stage.oneLine }}</p>

    <p class="mt-2 text-xs leading-5 text-muted">
      <span class="font-mono text-2xs uppercase tracking-[0.12em] text-faint">what · </span>
      {{ stage.what }}
    </p>

    <dl class="mt-2 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
      <div v-for="row in stage.inOut" :key="`${row.label}-${row.value}`">
        <dt class="font-mono text-2xs uppercase tracking-[0.12em] text-faint">{{ row.label }}</dt>
        <dd class="mt-0.5 font-mono text-xs text-ink tnum">{{ row.value }}</dd>
        <dd v-if="row.note" class="text-2xs leading-4 text-faint">{{ row.note }}</dd>
      </div>
    </dl>

    <template v-if="stage.maths.length > 0">
      <h4 class="mt-2.5 font-mono text-2xs uppercase tracking-[0.12em] text-faint">the maths</h4>
      <ul class="mt-1 space-y-1">
        <li v-for="item in stage.maths" :key="item.label" class="text-xs leading-5 text-muted">
          <span class="font-mono text-2xs text-ink">{{ item.label }}</span>
          <span class="text-faint"> — </span>{{ item.text }}
        </li>
      </ul>
    </template>

    <div v-if="stage.table" class="scroll-thin mt-2 overflow-x-auto">
      <table class="w-full min-w-[540px] border-collapse text-left text-2xs tnum">
        <caption class="sr-only">{{ stage.table.caption }}</caption>
        <thead>
          <tr class="border-b border-edge-strong text-faint">
            <th
              v-for="column in stage.table.columns"
              :key="column"
              scope="col"
              class="py-1 pr-3 font-normal text-faint"
            >
              {{ column }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in stage.table.rows" :key="row[0]" class="border-b border-edge/60">
            <td v-for="(cell, index) in row" :key="cell + index" class="py-1 pr-3 font-mono text-ink">
              {{ cell }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <dl class="mt-2.5 grid gap-x-4 gap-y-1.5 border-t border-edge/60 pt-2 text-2xs sm:grid-cols-2">
      <div>
        <dt class="font-mono uppercase tracking-[0.12em] text-faint">code entry point</dt>
        <dd class="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
          <code v-for="path in stage.code" :key="path" class="font-mono text-ink">{{ path }}</code>
        </dd>
      </div>
      <div>
        <dt class="font-mono uppercase tracking-[0.12em] text-faint">findings</dt>
        <dd class="mt-0.5 font-mono text-ink">
          {{ stage.findings.length > 0 ? stage.findings.join(' · ') : 'none cited' }}
        </dd>
      </div>
    </dl>

    <p v-if="stage.note" class="mt-2 border-t border-edge/60 pt-2 text-2xs leading-4 text-faint">
      {{ stage.note }}
    </p>
  </article>
</template>
