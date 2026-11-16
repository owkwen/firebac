<script setup lang="ts">
import Checkbox from '@/components/ui/Checkbox.vue'
import type { DatasetInfo } from '@/types/dataset'

defineProps<{ datasets: DatasetInfo[]; selected: string[] }>()
const emit = defineEmits<{ toggle: [file: string] }>()
</script>

<template>
  <div class="space-y-1">
    <div
      v-for="dataset in datasets"
      :key="dataset.file"
      class="flex items-start gap-2 rounded-[var(--radius)] px-1 py-1 hover:bg-raised"
    >
      <Checkbox
        class="mt-0.5"
        label=""
        :aria-label="`${dataset.sensor} ${dataset.year} ${dataset.country}`"
        :model-value="selected.includes(dataset.file)"
        @update:model-value="emit('toggle', dataset.file)"
      />
      <div class="min-w-0 leading-4">
        <div class="flex items-center gap-1.5 text-2xs">
          <span :class="dataset.sensor === 'MODIS' ? 'text-modis' : 'text-viirs'" class="font-mono font-semibold">
            {{ dataset.sensor }}
          </span>
          <span class="text-ink">{{ dataset.year }}</span>
          <span class="text-muted">{{ dataset.country }}</span>
        </div>
        <p class="truncate font-mono text-2xs text-faint" :title="dataset.file">{{ dataset.file }}</p>
      </div>
    </div>
    <p v-if="datasets.length === 0" class="px-1 text-2xs text-muted">
      No CSVs in <code class="font-mono">public/data/</code>.
    </p>
  </div>
</template>
