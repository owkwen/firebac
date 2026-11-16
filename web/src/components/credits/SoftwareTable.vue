<script setup lang="ts">
import ExternalLink from '@/components/credits/ExternalLink.vue'
import type { SoftwarePackage } from '@/lib/credits'

defineProps<{
  packages: readonly SoftwarePackage[]
  caption: string
}>()
</script>

<template>
  <div class="scroll-thin overflow-x-auto">
    <table class="w-full min-w-[30rem] border-collapse text-left align-top text-xs leading-5">
      <caption class="caption-top pb-2 text-left text-2xs uppercase tracking-[0.14em] text-faint">
        {{ caption }}
      </caption>
      <thead>
        <tr class="border-b border-edge-strong text-2xs uppercase tracking-[0.1em] text-faint">
          <th scope="col" class="w-[28%] py-1.5 pr-3 font-normal">Package</th>
          <th scope="col" class="w-[47%] py-1.5 pr-3 font-normal">What it does</th>
          <th scope="col" class="w-[25%] py-1.5 font-normal">Licence</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in packages" :key="item.name" class="border-b border-edge/60">
          <th scope="row" class="py-2 pr-3 align-top font-normal">
            <ExternalLink :href="item.href">{{ item.name }}</ExternalLink>
            <span v-if="item.version" class="ml-1 font-mono text-2xs text-faint">{{ item.version }}</span>
          </th>
          <td class="py-2 pr-3 align-top text-muted">{{ item.role }}</td>
          <td class="py-2 align-top text-muted">{{ item.licence }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
