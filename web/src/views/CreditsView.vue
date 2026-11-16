<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import CreditsSection from '@/components/credits/CreditsSection.vue'
import ExternalLink from '@/components/credits/ExternalLink.vue'
import SoftwareTable from '@/components/credits/SoftwareTable.vue'
import SourceTable from '@/components/credits/SourceTable.vue'
import {
  AUTHOR,
  BUILD_SOFTWARE,
  DATA_SOURCES,
  DISCLOSURES,
  NOT_INGESTED,
  RUNTIME_SOFTWARE,
} from '@/lib/credits'

const authorName = AUTHOR.trim()
const hasAuthor = computed(() => authorName.length > 0)
const authorLine = authorName.length > 0 ? authorName : 'Solo participant, NASA Space Apps Challenge 2026'
const linkClass =
  'text-ink underline decoration-edge-strong underline-offset-2 hover:decoration-ink'
</script>

<template>
  <div class="max-w-[72ch] pb-10 text-[14px] leading-6 text-muted">
    <header class="space-y-2 pb-7">
      <p class="font-mono text-2xs uppercase tracking-[0.16em] text-faint">Provenance</p>
      <h2 id="credits-title" class="text-xl font-semibold tracking-tight text-ink">Credits</h2>
      <p class="max-w-[64ch]">
        Where the record came from, who built it, which licences apply, and what the numbers do
        not claim.
      </p>
      <p class="font-mono text-2xs text-faint">
        Burning activity calendar · 2000–2025 · NASA Space Apps Challenge 2026
      </p>
      <p class="text-[13px] leading-5 text-faint">
        The technical companion is
        <RouterLink to="/data" :class="linkClass">Data</RouterLink>, which documents how the
        record is built from download to artifact.
      </p>
    </header>

    <div class="space-y-8">
      <CreditsSection id="about" index="01" title="About">
        <div class="space-y-3">
          <p>
            This is a 26-year burning activity calendar for Canada, 2000–2025, built from NASA MODIS and
            VIIRS active-fire detections. It publishes both the raw MODIS series and a harmonized
            series that adds an expected cell-day for VIIRS-only detections. The correction is a
            co-location probability for each VIIRS multiplicity bin, stated openly rather than
            folded silently into the series, so the two sensors are never blended into one
            unlabelled number.
          </p>
          <p>
            It was built for the NASA Space Apps Challenge 2026, in response to the challenge
            <em class="text-ink">Harmonization of MODIS and VIIRS Hot Spots</em>.
            {{ authorLine }}.
          </p>
          <p>
            It is not an official NASA product, not a burned-area product — the unit is a detected
            0.01° cell-day, not hectares — and not a live fire-alert service: the archive ends in
            2025.
          </p>
          <p>
            The source code is released under the
            <ExternalLink href="https://www.apache.org/licenses/LICENSE-2.0">Apache License 2.0</ExternalLink>,
            the licence NASA applies by default to Space Apps submissions when no other OSI
            licence is named.
          </p>
        </div>
      </CreditsSection>

      <CreditsSection id="sources" index="02" title="Data sources">
        <p>
          The published record uses country-level CSVs from the NASA FIRMS archive. No other
          observational dataset enters the model.
        </p>
        <SourceTable :sources="DATA_SOURCES" />
        <p>
          NASA Earth science data are open and free. NASA does not generally copyright its data,
          asks to be acknowledged as the source, and does not endorse this or any derived product.
          The full terms are in the
          <ExternalLink href="https://www.earthdata.nasa.gov/engage/open-data-services-software/data-use-policy">
            NASA Earthdata data use and citation guidance
          </ExternalLink>.
        </p>

        <h4 class="pt-1 text-sm font-semibold text-ink">Referenced but not ingested</h4>
        <ul class="space-y-2">
          <li v-for="source in NOT_INGESTED" :key="source.name">
            <ExternalLink :href="source.href">{{ source.name }}</ExternalLink>
            — {{ source.reason }}
          </li>
        </ul>
      </CreditsSection>

      <CreditsSection id="software" index="03" title="Software">
        <p>
          Versions are the ones pinned in <code class="font-mono text-xs text-ink">package.json</code>
          and <code class="font-mono text-xs text-ink">pyproject.toml</code>. A package is listed
          only if the application, the build or the analysis pipeline uses it.
        </p>

        <h4 class="text-sm font-semibold text-ink">Runtime</h4>
        <SoftwareTable :packages="RUNTIME_SOFTWARE" caption="Packages loaded by the web app" />
        <p class="text-xs leading-5 text-faint">
          Tailwind is compiled at build time; it is listed with the runtime because every page
          depends on the CSS it produces.
        </p>

        <h4 class="pt-1 text-sm font-semibold text-ink">Build, analysis and science</h4>
        <SoftwareTable
          :packages="BUILD_SOFTWARE"
          caption="Packages used to build, calibrate and inspect the record"
        />

        <p>
          No web fonts are bundled. The interface uses the operating system UI font stack and the
          system monospace stack declared in
          <code class="font-mono text-xs text-ink">src/styles/tokens.css</code>, so the page makes
          no font request.
        </p>
      </CreditsSection>

      <CreditsSection id="disclosures" index="04" title="Disclosures">
        <p>Plainly: the limits of the record and the terms of its making.</p>
        <div v-for="item in DISCLOSURES" :key="item.id" class="space-y-1.5">
          <h4 class="text-sm font-semibold text-ink">{{ item.title }}</h4>
          <p v-for="paragraph in item.paragraphs" :key="paragraph">{{ paragraph }}</p>
          <ul v-if="item.commands" class="space-y-0.5 pt-0.5 font-mono text-xs text-ink">
            <li v-for="command in item.commands" :key="command">{{ command }}</li>
          </ul>
        </div>
      </CreditsSection>

      <CreditsSection v-if="hasAuthor" id="contact" index="05" title="Contact">
        <p>Corrections and questions: {{ authorName }}.</p>
      </CreditsSection>
    </div>
  </div>
</template>
