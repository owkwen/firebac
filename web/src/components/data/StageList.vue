<script setup lang="ts">
import StagePanel from '@/components/data/StagePanel.vue'
import type { PipelineStage } from '@/types/pipeline'

defineProps<{ stages: readonly PipelineStage[] }>()
</script>

<template>
  <ol class="space-y-2">
    <li v-for="stage in stages" :key="stage.id">
      <StagePanel :stage="stage" />
    </li>
  </ol>
</template>
