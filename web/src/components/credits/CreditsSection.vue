<script setup lang="ts">
defineProps<{
  id: string
  index: string
  title: string
}>()
</script>

<template>
  <section :id="id" class="scroll-mt-16 border-t border-edge pt-6">
    <h3 class="flex items-baseline gap-2.5 text-base font-semibold tracking-tight text-ink">
      <span aria-hidden="true" class="font-mono text-2xs font-normal text-faint">{{ index }}</span>
      <span>{{ title }}</span>
    </h3>
    <div class="mt-3 space-y-4">
      <slot />
    </div>
  </section>
</template>
