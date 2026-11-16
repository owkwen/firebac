<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ href: string }>()

const host = computed(() => {
  try {
    return new URL(props.href).host
  } catch {
    return props.href
  }
})
</script>

<template>
  <a
    :href="href"
    target="_blank"
    rel="noreferrer noopener"
    class="text-ink underline decoration-edge-strong underline-offset-2 hover:decoration-ink"
  >
    <slot />
    <span class="sr-only"> (opens {{ host }} in a new tab)</span>
  </a>
</template>
