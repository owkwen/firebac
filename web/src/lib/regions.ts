import type { RegionEntry } from '@/types/meta'

export interface RegionChoice {
  code: string
  name: string
  available: boolean
}

/** Planned regions are visible in the switcher; only regions.json makes one selectable. */
export const REGION_CATALOGUE: readonly RegionEntry[] = [
  { code: 'CA', name: 'Canada' },
  { code: 'AR', name: 'Argentina' },
  { code: 'US', name: 'United States' },
]

export function regionChoices(built: readonly RegionEntry[]): RegionChoice[] {
  const available = new Set(built.map((region) => region.code))
  const known = new Set(REGION_CATALOGUE.map((region) => region.code))
  return [
    ...REGION_CATALOGUE.map((region) => ({
      code: region.code,
      name: region.name,
      available: available.has(region.code),
    })),
    ...built
      .filter((region) => !known.has(region.code))
      .map((region) => ({ code: region.code, name: region.name, available: true })),
  ]
}

export function fallbackRegion(built: readonly RegionEntry[]): string {
  return built[0]?.code ?? 'CA'
}
