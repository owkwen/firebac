/**
 * The credit is deliberately one constant: leave it empty until the participant
 * supplies a name. An empty value renders the solo-entry fallback on the page.
 */
export const AUTHOR = 'Ilyas Faraj'

export type DataSource = {
  name: string
  href: string
  provider: string
  taken: string
  licence: string
  accessed: string
}

export const DATA_SOURCES: readonly DataSource[] = [
  {
    name: 'NASA FIRMS country archive',
    href: 'https://firms.modaps.eosdis.nasa.gov/country/',
    provider: 'NASA FIRMS / ESDIS',
    taken:
      'MODIS C6.1 and VIIRS 375 m country-year CSVs: Suomi NPP 2012–2025 and NOAA-20 2018–2025 (validation only).',
    licence: 'NASA open data',
    accessed: '14–15 Nov 2026',
  },
  {
    name: 'NASA FIRMS active-fire attributes',
    href: 'https://www.earthdata.nasa.gov/data/tools/firms/active-fire-data-attributes-modis-viirs',
    provider: 'NASA FIRMS / ESDIS',
    taken:
      'Field definitions for both sensors; the source of the confidence and FRP caveats used throughout.',
    licence: 'NASA open data',
    accessed: '14–15 Nov 2026',
  },
  {
    name: 'NASA VIIRS Land, Active Fire ESDR',
    href: 'https://viirsland.gsfc.nasa.gov/Products/NASA/FireESDR.html',
    provider: 'NASA VIIRS Land / Land SIPS',
    taken:
      'The 375 m VNP14IMG versus 750 m VNP14 product distinction, and the I4 saturation handling.',
    licence: 'NASA open data',
    accessed: '14–15 Nov 2026',
  },
  {
    name: 'Natural Earth 110m',
    href: 'https://www.naturalearthdata.com/downloads/110m-physical-vectors/',
    provider: 'Natural Earth',
    taken: 'The map outline: coastline and country boundaries at 1:110 m.',
    licence: 'Public domain',
    accessed: '14–15 Nov 2026',
  },
]

export type NotIngestedSource = {
  name: string
  href: string
  reason: string
}

export const NOT_INGESTED: readonly NotIngestedSource[] = [
  {
    name: 'MCD64A1 burned area',
    href: 'https://ladsweb.modaps.eosdis.nasa.gov/missions-and-measurements/products/MCD64A1/',
    reason:
      'Records burned area at 500 m, not active-fire detections. Adding it would change the calendar unit from detected cell-days to burned hectares.',
  },
  {
    name: 'ABoVE date-of-burning layer',
    href: 'https://daac.ornl.gov/ABOVE/',
    reason:
      'A regional Landsat-derived record. It covers only part of Canada and stops before the archive does, so it cannot fill the 26-year series.',
  },
]

export type SoftwarePackage = {
  name: string
  version: string
  href: string
  role: string
  licence: string
}

export const RUNTIME_SOFTWARE: readonly SoftwarePackage[] = [
  {
    name: 'Vue',
    version: '3.5.45',
    href: 'https://vuejs.org/',
    role: 'UI framework: single-file components and reactivity.',
    licence: 'MIT',
  },
  {
    name: 'Vue Router',
    version: '4.6.5',
    href: 'https://router.vuejs.org/',
    role: 'History-mode routing between the calendar, data, methods and credits pages.',
    licence: 'MIT',
  },
  {
    name: 'Pinia',
    version: '4.1.0',
    href: 'https://pinia.vuejs.org/',
    role: 'Shared state for the calendar, workbench and tour.',
    licence: 'MIT',
  },
  {
    name: 'VueUse',
    version: '15.0.0',
    href: 'https://vueuse.org/',
    role: '@vueuse/core: browser and reactivity utilities.',
    licence: 'MIT',
  },
  {
    name: 'Apache ECharts',
    version: '6.1.0',
    href: 'https://echarts.apache.org/',
    role: 'Canvas charts: calendar, season profile and distributions.',
    licence: 'Apache-2.0',
  },
  {
    name: 'DuckDB-WASM',
    version: '1.29.0',
    href: 'https://duckdb.org/docs/api/wasm/overview',
    role: 'Client-side SQL over the raw CSVs; loaded on demand by the workbench.',
    licence: 'MIT',
  },
  {
    name: 'Apache Arrow',
    version: '17.0.0',
    href: 'https://arrow.apache.org/',
    role: 'Columnar result sets returned by DuckDB-WASM.',
    licence: 'Apache-2.0',
  },
  {
    name: 'TanStack Table',
    version: '8.21.3',
    href: 'https://tanstack.com/table/latest',
    role: 'Headless table model for the detection table.',
    licence: 'MIT',
  },
  {
    name: 'reka-ui',
    version: '2.11.0',
    href: 'https://reka-ui.com/',
    role: 'Accessible primitives behind the shared buttons, inputs, checkboxes and sliders.',
    licence: 'MIT',
  },
  {
    name: 'class-variance-authority',
    version: '0.7.1',
    href: 'https://cva.style/',
    role: 'Typed variants for the shared button component.',
    licence: 'Apache-2.0',
  },
  {
    name: 'clsx',
    version: '2.1.1',
    href: 'https://github.com/lukeed/clsx',
    role: 'Conditional class-name composition.',
    licence: 'MIT',
  },
  {
    name: 'tailwind-merge',
    version: '3.7.0',
    href: 'https://github.com/dcastil/tailwind-merge',
    role: 'Resolves conflicting utility classes when components accept a class prop.',
    licence: 'MIT',
  },
  {
    name: 'Tailwind CSS',
    version: '4.3.5',
    href: 'https://tailwindcss.com/',
    role: 'Utility CSS and the token-to-utility mapping used by every page.',
    licence: 'MIT',
  },
]

export const BUILD_SOFTWARE: readonly SoftwarePackage[] = [
  {
    name: 'Vite',
    version: '8.3.8',
    href: 'https://vite.dev/',
    role: 'Development server and static production build.',
    licence: 'MIT',
  },
  {
    name: 'TypeScript',
    version: '5.9.3',
    href: 'https://www.typescriptlang.org/',
    role: 'Type system and compiler checks.',
    licence: 'Apache-2.0',
  },
  {
    name: 'vue-tsc',
    version: '3.3.14',
    href: 'https://github.com/vuejs/language-tools',
    role: 'Type-checks .vue single-file components before every build.',
    licence: 'MIT',
  },
  {
    name: '@vitejs/plugin-vue',
    version: '6.0.11',
    href: 'https://github.com/vitejs/vite-plugin-vue',
    role: 'Compiles Vue single-file components inside Vite.',
    licence: 'MIT',
  },
  {
    name: '@tailwindcss/vite',
    version: '4.3.5',
    href: 'https://tailwindcss.com/docs/installation/using-vite',
    role: 'Tailwind CSS integration for the Vite pipeline.',
    licence: 'MIT',
  },
  {
    name: '@types/node',
    version: '24.10.4',
    href: 'https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/node',
    role: 'Type declarations for the Node APIs used by vite.config.ts.',
    licence: 'MIT',
  },
  {
    name: 'bun',
    version: '1.3.4',
    href: 'https://bun.sh/',
    role: 'Package manager, installer and script runner for the web app.',
    licence: 'MIT',
  },
  {
    name: 'DuckDB (Python)',
    version: '≥1.0',
    href: 'https://duckdb.org/',
    role: 'Build-time SQL over the detection CSVs.',
    licence: 'MIT',
  },
  {
    name: 'pandas',
    version: '≥2.2',
    href: 'https://pandas.pydata.org/',
    role: 'Tabular aggregation and CSV handling in the pipeline.',
    licence: 'BSD-3-Clause',
  },
  {
    name: 'NumPy',
    version: '≥1.26',
    href: 'https://numpy.org/',
    role: 'Array arithmetic behind the calibration.',
    licence: 'BSD-3-Clause',
  },
  {
    name: 'SciPy',
    version: '≥1.11',
    href: 'https://scipy.org/',
    role: 'Numerical and statistical routines used in model fitting.',
    licence: 'BSD-3-Clause',
  },
  {
    name: 'PyArrow',
    version: '≥15',
    href: 'https://arrow.apache.org/docs/python/',
    role: 'Parquet output for the raw detection layers.',
    licence: 'Apache-2.0',
  },
  {
    name: 'Matplotlib',
    version: '≥3.8',
    href: 'https://matplotlib.org/',
    role: 'Static analysis figures; no figure is served by the site.',
    licence: 'PSF-based',
  },
  {
    name: 'Requests',
    version: '≥2.31',
    href: 'https://requests.readthedocs.io/',
    role: 'Sequential downloads from the FIRMS archive.',
    licence: 'Apache-2.0',
  },
  {
    name: 'uv',
    version: '',
    href: 'https://docs.astral.sh/uv/',
    role: 'Python environment, dependency and command runner.',
    licence: 'MIT or Apache-2.0',
  },
  {
    name: 'Jupyter',
    version: '≥4.2 / ≥6.29',
    href: 'https://jupyter.org/',
    role: 'JupyterLab and ipykernel for exploration; not part of the build.',
    licence: 'BSD-3-Clause',
  },
]

export type Disclosure = {
  id: string
  title: string
  paragraphs: readonly string[]
  commands?: readonly string[]
}

export const DISCLOSURES: readonly Disclosure[] = [
  {
    id: 'ai',
    title: 'AI assistance',
    paragraphs: [
      'The model fits, the analysis pipeline and this interface were built with AI assistance. The data and every published number remain reproducible from the repository, using the documented commands.',
    ],
    commands: [
      'make fetch',
      'uv run python -m firms.artifacts --region CA',
      'cd web && bun run build',
    ],
  },
  {
    id: 'independence',
    title: 'Independence',
    paragraphs: [
      'This is an independent hackathon entry. It is not affiliated with, endorsed by or produced by NASA, the challenge organisers or any fire agency. It is not an operational product and must not be used for emergency decisions.',
    ],
  },
  {
    id: 'numbers',
    title: 'What the numbers are',
    paragraphs: [
      'Counts are active-fire detections aggregated to 0.01° cell-days. The harmonized series adds an expected number of cell-days that only VIIRS saw: a co-location estimate conditional on how many VIIRS pixels fall in the cell-day, not a detection probability. Neither series is burned area.',
      'The correction was calibrated on 2012–2022 and applied unchanged to 2023–2025. The out-of-sample years are the test, not a refit.',
    ],
  },
  {
    id: 'limits',
    title: 'Data limits',
    paragraphs: [
      'The archive ends in 2025. Suomi NPP ceased delivery on 2 November 2026, so the VIIRS record stops at that boundary; NOAA-20 is downloaded for validation and kept out of the published series because merging platforms moves every multiplicity bin.',
      'VIIRS I4 is censored at 367 K, so brightness values at the ceiling are lower bounds, not measurements. MODIS and VIIRS confidence scales are not comparable and are never averaged.',
    ],
  },
  {
    id: 'privacy',
    title: 'Privacy',
    paragraphs: [
      'No accounts, no cookies, no analytics and no tracking. The site is a set of static files; dataset queries run in the browser and never leave the device.',
    ],
  },
]
