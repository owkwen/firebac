<script setup lang="ts">
import { computed } from 'vue'
import FlowCanvas from '@/components/data/FlowCanvas.vue'
import { buildFlow } from '@/lib/pipeline'
import type { PipelineStage } from '@/types/pipeline'

const props = defineProps<{ stages: readonly PipelineStage[] }>()

const emit = defineEmits<{ select: [id: string] }>()

const horizontal = computed(() => buildFlow(props.stages, 'horizontal'))
const vertical = computed(() => buildFlow(props.stages, 'vertical'))
</script>

<template>
  <div class="rounded-xl border border-edge bg-panel p-4 sm:p-6">
    <div class="hidden min-[920px]:block">
      <FlowCanvas :layout="horizontal" @select="emit('select', $event)" />
    </div>
    <div class="min-[920px]:hidden">
      <FlowCanvas :layout="vertical" class="mx-auto max-w-[560px]" @select="emit('select', $event)" />
    </div>
  </div>
</template>
