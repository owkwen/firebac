<script setup lang="ts" generic="T extends string">
defineProps<{
  label: string
  modelValue: T
  options: readonly { value: T; label: string }[]
}>()

const emit = defineEmits<{ 'update:modelValue': [value: T] }>()
</script>

<template>
  <div
    role="group"
    :aria-label="label"
    class="flex items-center rounded-[var(--radius)] border border-edge bg-sunken p-0.5"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      :aria-pressed="modelValue === option.value"
      class="h-5 rounded-[2px] px-1.5 font-mono text-[10px] leading-none transition-colors duration-[90ms]"
      :class="
        modelValue === option.value
          ? 'bg-raised text-ink'
          : 'text-muted hover:bg-raised/50 hover:text-ink'
      "
      @click="emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>
