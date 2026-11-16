<script setup lang="ts">
import { SliderRange, SliderRoot, SliderThumb, SliderTrack } from 'reka-ui'

const model = defineModel<number>({ required: true })
defineProps<{ min: number; max: number; step: number; label: string }>()

function onUpdate(value: number[] | undefined): void {
  if (!value) return
  if (value.length > 0) model.value = value[0]
}
</script>

<template>
  <SliderRoot
    :model-value="[model]"
    :min="min"
    :max="max"
    :step="step"
    :aria-label="label"
    class="relative flex h-4 w-full touch-none select-none items-center"
    @update:model-value="onUpdate"
  >
    <SliderTrack class="relative h-1 grow rounded-full bg-edge">
      <SliderRange class="absolute h-full rounded-full bg-accent" />
    </SliderTrack>
    <SliderThumb
      class="block size-3 rounded-full border border-accent bg-canvas focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
    />
  </SliderRoot>
</template>
