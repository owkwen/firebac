<script setup lang="ts">
import { CheckboxIndicator, CheckboxRoot } from 'reka-ui'

const model = defineModel<boolean>({ required: true })
defineProps<{ label: string; ariaLabel?: string; disabled?: boolean }>()
</script>

<template>
  <label class="flex cursor-pointer select-none items-center gap-2 text-xs text-ink">
    <CheckboxRoot
      v-model="model"
      :aria-label="ariaLabel ?? label"
      :disabled="disabled"
      class="grid size-3.5 shrink-0 place-items-center rounded-[2px] border border-edge-strong bg-sunken data-[state=checked]:border-accent data-[state=checked]:bg-accent"
    >
      <CheckboxIndicator class="block size-2 bg-canvas" />
    </CheckboxRoot>
    <span>{{ label }}</span>
  </label>
</template>
