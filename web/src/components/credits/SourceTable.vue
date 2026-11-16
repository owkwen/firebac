<script setup lang="ts">
import ExternalLink from '@/components/credits/ExternalLink.vue'
import type { DataSource } from '@/lib/credits'

defineProps<{ sources: readonly DataSource[] }>()
</script>

<template>
  <div class="space-y-1.5">
    <div class="scroll-thin overflow-x-auto">
      <table class="w-full min-w-[30rem] border-collapse text-left align-top text-xs leading-5">
        <caption class="caption-top pb-2 text-left text-2xs uppercase tracking-[0.14em] text-faint">
          Observational sources in the Canada record
        </caption>
        <thead>
          <tr class="border-b border-edge-strong text-2xs uppercase tracking-[0.1em] text-faint">
            <th scope="col" class="w-[20%] py-1.5 pr-3 font-normal">Source</th>
            <th scope="col" class="w-[16%] py-1.5 pr-3 font-normal">Provider</th>
            <th scope="col" class="w-[32%] py-1.5 pr-3 font-normal">What we took</th>
            <th scope="col" class="w-[16%] py-1.5 pr-3 font-normal">Licence</th>
            <th scope="col" class="w-[16%] py-1.5 font-normal">Accessed</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="source in sources" :key="source.name" class="border-b border-edge/60">
            <th scope="row" class="py-2 pr-3 align-top font-normal">
              <ExternalLink :href="source.href">{{ source.name }}</ExternalLink>
            </th>
            <td class="py-2 pr-3 align-top text-muted">{{ source.provider }}</td>
            <td class="py-2 pr-3 align-top text-muted">{{ source.taken }}</td>
            <td class="py-2 pr-3 align-top text-muted">{{ source.licence }}</td>
            <td class="py-2 align-top font-mono text-2xs text-faint">{{ source.accessed }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="text-2xs text-faint">
      Access dates are the day each source entered the working copy.
    </p>
  </div>
</template>
