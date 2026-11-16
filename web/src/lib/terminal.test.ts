// @ts-nocheck -- bun:test ships with the runner, not with the app's type packages.
import { describe, expect, test } from 'bun:test'
import type { GitCommit, TerminalState } from '@/types/git'
import type { TerminalContext } from '@/lib/terminal'
import { passId } from '@/lib/git'
import { parseCommand, runCommand } from '@/lib/terminal'

function commit(id: string, timestamp: number): GitCommit {
  return {
    id,
    satellite: 'N',
    sensor: 'VIIRS',
    date: '2023-12-27',
    bucket: 3,
    minutes: 1118,
    timestamp,
    detections: 10,
    frp: 4.2,
    cells: 3,
    minLat: 57.8,
    maxLat: 57.9,
    minLon: -117.9,
    maxLon: -117.8,
  }
}

function context(): TerminalContext {
  const commits = [
    commit('NPP.A2023361.1858', Date.UTC(2023, 11, 27, 18, 58)),
    commit('NPP.A2023360.1858', Date.UTC(2023, 11, 26, 18, 58)),
  ]
  const state: TerminalState = {
    year: 2023,
    bbox: { lat0: 57, lat1: 58, lon0: -119, lon1: -118 },
    commits,
    displayedCount: commits.length,
    cap: 400,
    loading: false,
  }
  return {
    state: () => state,
    setLog: async () => state,
    loadBlame: async (lat, lon) => ({ lat, lon, commits }),
    loadCells: async () => new Map(),
  }
}

describe('parseCommand', () => {
  test('blame accepts the typographic minus the header prints', () => {
    expect(parseCommand('blame 57.83 −117.90')).toEqual({
      name: 'blame',
      lat: 57.83,
      lon: -117.9,
    })
  })

  test('blame accepts an ASCII minus and a leading plus', () => {
    expect(parseCommand('blame 57.83 -117.90')).toEqual({
      name: 'blame',
      lat: 57.83,
      lon: -117.9,
    })
    expect(parseCommand('blame +57.83 +117.90')).toEqual({
      name: 'blame',
      lat: 57.83,
      lon: 117.9,
    })
  })

  test('blame needs two numbers', () => {
    expect(() => parseCommand('blame 57.83')).toThrow('blame takes two numbers: lat lon')
  })

  test('blame rejects coordinates outside the globe', () => {
    expect(() => parseCommand('blame 91 0')).toThrow('lat must be between -90 and 90')
    expect(() => parseCommand('blame 0 181')).toThrow('lon must be between -180 and 180')
  })

  test('blame rejects a token that is not a number', () => {
    expect(() => parseCommand('blame 57.83 west')).toThrow('lon must be a number')
  })

  test('log parses four bbox numbers', () => {
    expect(parseCommand('log 57 58 -119 -118')).toEqual({
      name: 'log',
      bbox: { lat0: 57, lat1: 58, lon0: -119, lon1: -118 },
      year: null,
    })
  })

  test('log normalises negatives and a shuffled bbox order', () => {
    expect(parseCommand('log 58 57 −118 −119')).toEqual({
      name: 'log',
      bbox: { lat0: 57, lat1: 58, lon0: -119, lon1: -118 },
      year: null,
    })
  })

  test('log --year works without a bbox', () => {
    expect(parseCommand('log --year 2023')).toEqual({ name: 'log', bbox: null, year: 2023 })
  })

  test('log rejects an incomplete bbox', () => {
    expect(() => parseCommand('log 57 58 -119')).toThrow('log takes four bbox numbers')
  })

  test('show accepts full, lowercase and short pass IDs', () => {
    expect(parseCommand('show NPP.A2023361.1858')).toEqual({
      name: 'show',
      id: 'NPP.A2023361.1858',
    })
    expect(parseCommand('show npp.a2023361.1858')).toEqual({
      name: 'show',
      id: 'NPP.A2023361.1858',
    })
    expect(parseCommand('show A2023361.1858')).toEqual({ name: 'show', id: 'A2023361.1858' })
  })

  test('show rejects a token that is not a pass ID', () => {
    expect(() => parseCommand('show 1858')).toThrow('not a pass ID')
  })

  test('diff needs two pass IDs', () => {
    expect(parseCommand('diff NPP.A2023361.1858 NPP.A2023360.1858')).toEqual({
      name: 'diff',
      a: 'NPP.A2023361.1858',
      b: 'NPP.A2023360.1858',
    })
    expect(() => parseCommand('diff NPP.A2023361.1858')).toThrow('diff takes two pass IDs')
  })

  test('help and status take no arguments', () => {
    expect(() => parseCommand('help now')).toThrow('help takes no arguments')
    expect(() => parseCommand('status now')).toThrow('status takes no arguments')
  })

  test('unknown and empty commands explain themselves', () => {
    expect(() => parseCommand('frobnicate')).toThrow('unknown command: frobnicate')
    expect(() => parseCommand('   ')).toThrow('empty command')
  })
})

describe('platform mapping', () => {
  test('keeps the pass id when a platform becomes an author', () => {
    expect(passId('Terra', '2023-12-27', 1138)).toBe('TERRA.A2023361.1858')
    expect(passId('Aqua', '2023-12-27', 1138)).toBe('AQUA.A2023361.1858')
    expect(passId('N', '2023-12-27', 1138)).toBe('NPP.A2023361.1858')
  })
})

describe('runCommand', () => {
  test('show resolves a pass in the current log', async () => {
    const result = await runCommand('show npp.a2023361.1858', context())
    expect(result.messages[0].kind).toBe('info')
    expect(result.messages[0].text).toContain('NPP.A2023361.1858')
  })

  test('show reports an unknown pass', async () => {
    const result = await runCommand('show NPP.A2023001.0000', context())
    expect(result.messages[0].kind).toBe('error')
    expect(result.messages[0].text).toContain('unknown pass ID')
  })

  test('diff compares two passes', async () => {
    const result = await runCommand('diff NPP.A2023361.1858 NPP.A2023360.1858', context())
    expect(result.messages).toHaveLength(3)
    expect(result.messages[1].text).toContain('gained')
  })

  test('diff with one id is a parse error', async () => {
    const result = await runCommand('diff NPP.A2023361.1858', context())
    expect(result.messages[0].kind).toBe('error')
    expect(result.messages[0].text).toContain('diff takes two pass IDs')
  })

  test('help and status run without arguments', async () => {
    expect((await runCommand('help', context())).messages.length).toBeGreaterThan(1)
    expect((await runCommand('status', context())).messages[0].kind).toBe('info')
  })

  test('empty input is an error, not a silent no-op', async () => {
    const result = await runCommand('', context())
    expect(result.messages[0].kind).toBe('error')
    expect(result.messages[0].text).toContain('empty command')
  })
})
