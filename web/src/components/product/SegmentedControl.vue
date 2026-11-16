<script setup lang="ts">
defineProps<{
  label: string
  modelValue: string
  options: readonly { value: string; label: string }[]
  disabled?: boolean
  disabledReason?: string
}>()

defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <div class="flex items-center gap-2">
    <span class="text-2xs uppercase tracking-[0.14em] text-faint">{{ label }}</span>
    <div
      role="group"
      :aria-label="label"
      :aria-disabled="disabled ? 'true' : undefined"
      class="flex rounded-[var(--radius)] border border-edge bg-sunken p-0.5"
    >
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        :disabled="disabled"
        :aria-pressed="modelValue === option.value"
        :title="disabled ? disabledReason : undefined"
        class="h-6 rounded-[2px] px-2 text-xs transition-colors duration-[90ms]"
        :class="[
          modelValue === option.value ? 'bg-raised text-ink' : 'text-muted hover:text-ink',
          disabled ? 'cursor-not-allowed opacity-50 hover:text-muted' : '',
        ]"
        @click="$emit('update:modelValue', option.value)"
      >
        {{ option.label }}
      </button>
    </div>
  </div>
</template>
