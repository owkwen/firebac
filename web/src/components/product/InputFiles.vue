<script setup lang="ts">
import type { InputFile } from '@/types/meta'
import { formatInteger } from '@/lib/format'

defineProps<{ inputs: readonly InputFile[] }>()
</script>

<template>
  <details class="rounded-[var(--radius)] border border-edge bg-sunken/40">
    <summary class="cursor-pointer px-2.5 py-1.5 text-xs text-muted">
      {{ inputs.length }} input files · sha256
    </summary>
    <div class="scroll-thin max-h-72 overflow-auto border-t border-edge px-2.5 py-1.5">
      <table class="w-full border-collapse text-left font-mono text-2xs tnum">
        <caption class="sr-only">Input files, rows and sha256 checksums</caption>
        <thead>
          <tr class="text-faint">
            <th scope="col" class="py-1 pr-3 font-normal">file</th>
            <th scope="col" class="py-1 pr-3 text-right font-normal">rows</th>
            <th scope="col" class="py-1 font-normal">sha256</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="input in inputs" :key="input.file" class="border-t border-edge/50">
            <td class="py-1 pr-3 text-ink">{{ input.file }}</td>
            <td class="py-1 pr-3 text-right text-muted">{{ formatInteger(input.rows) }}</td>
            <td class="break-all py-1 font-mono text-faint">{{ input.sha256 }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </details>
</template>
