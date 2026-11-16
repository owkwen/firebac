<script setup lang="ts">
import { computed, ref, watch, watchEffect } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import TopBar from '@/components/product/TopBar.vue'
import { loadRegions } from '@/lib/artifacts'
import { REGION_CATALOGUE } from '@/lib/regions'

const route = useRoute()
const regionName = ref(REGION_CATALOGUE[0].name)

const product = computed(() => `FireBAC`)

async function loadRegion(): Promise<void> {
  try {
    const regions = await loadRegions()
    const requested = typeof route.query.r === 'string' ? route.query.r : ''
    const match = regions.find((entry) => entry.code === requested) ?? regions[0]
    if (!match) return
    regionName.value = match.name
  } catch {
    // The route view owns the error surface; the shell keeps the last good label.
  }
}

watch(() => route.query.r, () => void loadRegion(), { immediate: true })

watchEffect(() => {
  const title = route.meta.title ?? 'Calendar'
  document.title = `${title} — ${product.value}`
})
</script>

<template>
  <div class="min-h-screen bg-canvas">
    <TopBar :product="product" />
    <RouterView />
  </div>
</template>
