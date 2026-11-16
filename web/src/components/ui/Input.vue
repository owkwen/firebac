<script setup lang="ts">
import { cn } from '@/lib/utils'

const model = defineModel<string>({ required: true })
withDefaults(
  defineProps<{
    type?: 'text' | 'date' | 'search'
    id?: string
    ariaLabel?: string
    placeholder?: string
  }>(),
  { type: 'text' },
)
</script>

<template>
  <input
    :id="id"
    v-model="model"
    :type="type"
    :aria-label="ariaLabel"
    :placeholder="placeholder"
    :class="
      cn(
        'h-7 w-full rounded-[var(--radius)] border border-edge bg-sunken px-2 font-mono text-xs text-ink',
        'placeholder:text-faint focus:border-accent focus:outline-none',
      )
    "
  />
</template>
