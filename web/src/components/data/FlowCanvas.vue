<script setup lang="ts">
import type { FlowLayout, FlowNode, SensorTone } from '@/types/pipeline'

defineProps<{ layout: FlowLayout }>()

const emit = defineEmits<{ select: [id: string] }>()

const TONES: SensorTone[] = ['modis', 'viirs', 'shared']

const TONE: Record<SensorTone, string> = {
  modis: 'var(--modis)',
  viirs: 'var(--viirs)',
  shared: 'var(--edge-strong)',
}

function toneOf(node: FlowNode): string {
  return node.status === 'rejected' ? 'var(--edge-strong)' : TONE[node.sensor]
}

function labelFill(node: FlowNode): string {
  if (node.status === 'rejected') return 'var(--faint)'
  if (node.status === 'validation') return 'var(--muted)'
  return 'var(--ink)'
}

function detailFill(node: FlowNode): string {
  return node.status === 'live' ? 'var(--muted)' : 'var(--faint)'
}

function tooltip(node: FlowNode): string {
  return `${node.label} — ${node.detail.join(' ')}${node.meta ? ` — ${node.meta}` : ''}`
}
</script>

<template>
  <svg
    :viewBox="`0 0 ${layout.width} ${layout.height}`"
    class="h-auto w-full"
    role="presentation"
    aria-hidden="true"
    focusable="false"
  >
    <defs>
      <marker
        v-for="tone in TONES"
        :id="`arrow-${layout.id}-${tone}`"
        :key="tone"
        viewBox="0 0 7 7"
        refX="6"
        refY="3.5"
        markerWidth="7"
        markerHeight="7"
        orient="auto"
      >
        <path d="M0 0 L7 3.5 L0 7 z" :style="{ fill: TONE[tone] }" />
      </marker>
    </defs>

    <text
      v-for="label in layout.labels"
      :key="label.text"
      :x="label.x"
      :y="label.y"
      class="fill-faint font-mono"
      font-size="9"
      letter-spacing="0.12em"
    >
      {{ label.text }}
    </text>

    <path
      v-for="(edge, index) in layout.edges"
      :key="`edge-${index}`"
      :d="edge.d"
      fill="none"
      stroke-width="1"
      :style="{ stroke: TONE[edge.sensor] }"
      :marker-end="`url(#arrow-${layout.id}-${edge.sensor})`"
    />

    <g
      v-for="node in layout.nodes"
      :key="`${node.id}-${node.x}-${node.y}`"
      class="cursor-pointer"
      @click="emit('select', node.id)"
    >
      <title>{{ tooltip(node) }}</title>
      <rect
        :x="node.x"
        :y="node.y"
        :width="node.w"
        :height="node.h"
        rx="2"
        stroke-width="1"
        class="fill-panel"
        :style="{ stroke: toneOf(node) }"
        :stroke-dasharray="node.dashed ? '3 3' : undefined"
      />
      <text
        :x="node.x + 8"
        :y="node.y + 17"
        font-size="11"
        font-weight="600"
        class="font-sans"
        :style="{ fill: labelFill(node) }"
      >
        {{ node.label }}
      </text>
      <text
        v-for="(line, index) in node.detail"
        :key="line"
        :x="node.x + 8"
        :y="node.y + 31 + index * 11"
        font-size="10"
        class="font-sans tnum"
        :style="{ fill: detailFill(node) }"
      >
        {{ line }}
      </text>
      <text
        v-if="node.meta"
        :x="node.x + node.w - 8"
        :y="node.y + node.h - 7"
        text-anchor="end"
        font-size="9"
        class="fill-faint font-mono"
      >
        {{ node.meta }}
      </text>
    </g>
  </svg>
</template>
