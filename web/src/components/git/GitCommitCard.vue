<script setup lang="ts">
import { computed } from 'vue'
import type { GitCommit } from '@/types/git'
import { formatInteger } from '@/lib/format'
import { formatClock, formatPoint } from '@/lib/git'

const props = defineProps<{
  commit: GitCommit
  side: 'viirs' | 'modis'
}>()

const alignment = computed(() =>
  props.side === 'viirs' ? 'ml-auto text-right' : 'mr-auto text-left',
)

const accent = computed(() => {
  if (props.commit.sensor === 'VIIRS') return 'var(--viirs)'
  if (props.commit.satellite === 'Aqua') return 'color-mix(in srgb, var(--modis) 58%, var(--sunken))'
  return 'var(--modis)'
})

const author = computed(() =>
  props.commit.sensor === 'MODIS'
    ? `MODIS ${props.commit.satellite}`
    : `VIIRS ${props.commit.satellite}`,
)

const centre = computed(() =>
  formatPoint(
    (props.commit.minLat + props.commit.maxLat) / 2,
    (props.commit.minLon + props.commit.maxLon) / 2,
  ),
)

const title = computed(
  () =>
    `${props.commit.id} · ${author.value} · ${props.commit.date} ${formatClock(props.commit.timestamp)} UTC · ${formatInteger(props.commit.detections)} det · ${formatInteger(props.commit.frp)} MW · ${formatInteger(props.commit.cells)} cells`,
)
</script>

<template>
  <article
    :title="title"
    :data-pass-id="commit.id"
    :data-date="commit.date"
    class="relative flex h-8 w-full max-w-[360px] flex-col justify-center border-y border-edge bg-panel px-2"
    :class="alignment"
  >
    <span
      class="absolute inset-y-0 w-0.5"
      :class="side === 'viirs' ? 'right-0' : 'left-0'"
      :style="{ backgroundColor: accent }"
    />
    <div
      class="flex w-full items-baseline gap-2 font-mono text-2xs"
      :class="side === 'viirs' ? 'justify-end' : 'justify-start'"
    >
      <span class="text-ink">{{ commit.id }}</span>
      <span :style="{ color: accent }">{{ author }}</span>
    </div>
    <div class="w-full truncate font-mono text-2xs text-muted tnum">
      {{ commit.date }} {{ formatClock(commit.timestamp) }} UTC · {{ centre }} ·
      {{ formatInteger(commit.cells) }} cells
    </div>
  </article>
</template>
