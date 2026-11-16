<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { loadRegions } from '@/lib/artifacts'
import { fallbackRegion, regionChoices } from '@/lib/regions'
import type { RegionEntry } from '@/types/meta'

defineProps<{ product: string }>()

const route = useRoute()
const router = useRouter()
const regions = ref<RegionEntry[]>([])

const linkClass =
  'rounded-[var(--radius)] px-2 py-1 text-xs text-muted transition-colors duration-[90ms] hover:bg-raised hover:text-ink'

const choices = computed(() => regionChoices(regions.value))

// A requested region that is not published falls back to the first built one; the
// select shows what is actually rendered, never the unbuilt request.
const active = computed(() => {
  const requested = typeof route.query.r === 'string' ? route.query.r : ''
  return regions.value.some((region) => region.code === requested) ? requested : fallbackRegion(regions.value)
})

onMounted(async () => {
  try {
    regions.value = await loadRegions()
  } catch {
    regions.value = []
  }
})

function pick(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  if (!regions.value.some((region) => region.code === value)) return
  void router.replace({ query: { ...route.query, r: value } })
}
</script>

<template>
  <header class="sticky top-0 z-20 flex h-11 items-center justify-between gap-3 border-b border-edge bg-panel px-3">
    <div class="flex min-w-0 items-center gap-2">
      <img
        src="/flame.svg"
        alt=""
        aria-hidden="true"
        class="h-5 w-auto shrink-0 select-none"
      />
      <span class="hidden truncate text-sm font-semibold tracking-tight text-ink sm:inline">{{ product }}</span>
      <div class="relative shrink-0">
        <select
          :value="active"
          aria-label="Region"
          class="peer h-7 min-w-[120px] max-w-[136px] appearance-none truncate rounded-[var(--radius)] border border-edge bg-sunken py-0 pr-7 pl-2.5 text-xs text-ink transition-colors duration-[90ms] hover:border-edge-strong hover:bg-raised"
          @change="pick"
        >
          <option
            v-for="choice in choices"
            :key="choice.code"
            :value="choice.code"
            :disabled="!choice.available"
          >
            {{ choice.available ? choice.name : `${choice.name} (coming soon)` }}
          </option>
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 10 10"
          fill="none"
          class="pointer-events-none absolute top-1/2 right-2.5 h-2.5 w-2.5 -translate-y-1/2 text-muted transition-transform duration-[90ms] peer-focus:rotate-180"
        >
          <path
            d="M2.25 3.75 5 6.25l2.75-2.5"
            stroke="currentColor"
            stroke-width="1.25"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </div>
    </div>

    <nav aria-label="Primary" class="scroll-thin flex min-w-0 items-center gap-0.5 overflow-x-auto">
      <RouterLink to="/" :class="linkClass" exact-active-class="bg-raised !text-ink">Calendar</RouterLink>
      <RouterLink to="/region" :class="linkClass" active-class="bg-raised !text-ink">Region</RouterLink>
      <RouterLink to="/timeline" :class="linkClass" active-class="bg-raised !text-ink">Timeline</RouterLink>
      <RouterLink to="/data" :class="linkClass" active-class="bg-raised !text-ink">Data</RouterLink>
      <RouterLink to="/about" :class="linkClass" active-class="bg-raised !text-ink">About</RouterLink>
    </nav>
  </header>
</template>
