<script setup lang="ts">
import { DATA_SOURCES } from '@/lib/credits'
</script>

<template>
  <main class="mx-auto max-w-[1180px] px-4 pb-24">
    <header class="pt-16 pb-12">
      <h1 class="text-3xl font-medium leading-tight tracking-tight text-ink md:text-4xl lg:text-5xl">About</h1>
      <p class="mt-6 max-w-[62ch] text-base leading-relaxed text-muted">
        FireBAC is a 26-year burning activity calendar for Canada, built from NASA MODIS and VIIRS active-fire
        detections. It is an independent hackathon entry: not affiliated with or endorsed by NASA, and not an
        operational product. Code is Apache-2.0; the data and map outlines keep their own terms.
      </p>
    </header>

    <section aria-labelledby="credits" class="border-t border-edge pt-10">
      <h2 id="credits" class="text-xl font-medium leading-snug tracking-tight text-ink md:text-2xl">
        Data and credits
      </h2>

      <ul class="mt-8">
        <li
          v-for="source in DATA_SOURCES"
          :key="source.name"
          class="grid gap-2 border-b border-edge/60 py-5 sm:grid-cols-[240px_1fr] sm:gap-8"
        >
          <a
            :href="source.href"
            target="_blank"
            rel="noreferrer"
            class="text-sm text-ink underline decoration-edge-strong underline-offset-2 hover:decoration-ink"
          >{{ source.name }}</a>
          <p class="text-sm leading-relaxed text-muted">
            {{ source.taken }} <span class="text-faint">· {{ source.licence }}</span>
          </p>
        </li>
      </ul>

      <p class="mt-5 max-w-[62ch] font-mono text-xs leading-5 text-faint">
        Fire detections: NASA FIRMS / ESDIS. NASA does not endorse this product. Map outline: Natural Earth, public
        domain. Accessed {{ DATA_SOURCES[0].accessed }}.
      </p>
    </section>

    <section aria-labelledby="tools" class="mt-16 border-t border-edge pt-10 md:mt-24">
      <h2 id="tools" class="text-xl font-medium leading-snug tracking-tight text-ink md:text-2xl">Built with</h2>
      <p class="mt-6 max-w-[62ch] text-sm leading-relaxed text-muted">
        Vue 3 · TypeScript · Vite · Tailwind CSS · Apache ECharts · canvas maps · DuckDB-WASM · Apache Arrow ·
        TanStack Table · Python 3.12 · DuckDB · pandas · NumPy · PyArrow · uv · bun.
      </p>
      <p class="mt-4 max-w-[62ch] text-sm leading-relaxed text-muted">
        Built with AI assistance. Every published number is reproducible from the repository:
        <span class="font-mono text-xs text-ink">make fetch</span>,
        <span class="font-mono text-xs text-ink">make artifacts</span>,
        <span class="font-mono text-xs text-ink">bun run build</span>.
      </p>
      <p class="mt-4 max-w-[62ch] text-sm leading-relaxed text-muted">
        Code and licence:
        <a
          href="https://github.com/owkwen/firebac"
          target="_blank"
          rel="noreferrer"
          class="text-ink underline decoration-edge-strong underline-offset-2 hover:decoration-ink"
        >github.com/owkwen/firebac</a>
        · Apache-2.0.
      </p>
    </section>
  </main>
</template>
