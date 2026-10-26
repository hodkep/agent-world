import { describe, expect, it } from 'vitest'
// @ts-expect-error a plain .mjs script, run by CI
import { durationsFromReports, matrixOf, planShards } from './shard-plan.mjs'

const files = (n: number) => Array.from({ length: n }, (_, i) => `e2e/f${i}.e2e.ts`)
const load = (shards: string[][], d: Record<string, number>, def = 10) => shards.map((s) => s.reduce((n, f) => n + (d[f] ?? def), 0))

describe('which spec files go to which shard', () => {
  it('puts every file in exactly one shard', () => {
    const all = files(23)
    const shards = planShards(all, {}, 4)
    expect(shards).toHaveLength(4)
    expect(shards.flat().sort()).toEqual([...all].sort())
  })

  it('balances by the time each file took, longest first, instead of by how many there are', () => {
    const d: Record<string, number> = { 'e2e/f0.e2e.ts': 300, 'e2e/f1.e2e.ts': 200, 'e2e/f2.e2e.ts': 190, 'e2e/f3.e2e.ts': 90 }
    for (const f of files(40).slice(4)) d[f] = 10
    const shards = planShards(files(40), d, 4)
    const l = load(shards, d)
    // 1080 s in all: no shard is further from 270 than the longest file is long, and the three longest are not together.
    expect(Math.max(...l) - Math.min(...l)).toBeLessThanOrEqual(30)
    expect(new Set(['e2e/f0.e2e.ts', 'e2e/f1.e2e.ts', 'e2e/f2.e2e.ts'].map((f) => shards.findIndex((s) => s.includes(f)))).size).toBe(3)
  })

  it('gives a file with no time on record the median of the known ones, so a new spec lands where there is room', () => {
    const d = { 'e2e/f0.e2e.ts': 100, 'e2e/f1.e2e.ts': 100, 'e2e/f2.e2e.ts': 100 }
    const shards = planShards(files(4), d, 2)
    expect(shards.flat()).toHaveLength(4)
    expect(shards.map((s) => s.length).sort()).toEqual([2, 2])
  })

  it('shards sensibly with no times at all, and is the same plan every time', () => {
    const a = planShards(files(10), {}, 4)
    expect(a.map((s) => s.length).sort()).toEqual([2, 2, 3, 3])
    expect(planShards(files(10), {}, 4)).toEqual(a)
    expect(planShards([...files(10)].reverse(), {}, 4).map((s) => [...s].sort())).toEqual(a.map((s) => [...s].sort()))
  })

  it('copes with fewer files than shards', () => {
    expect(planShards(files(2), {}, 4).flat()).toHaveLength(2)
  })
})

describe('the matrix the workflow reads', () => {
  it('is one entry per shard with its number and its files in one line', () => {
    const m = matrixOf([['e2e/a.e2e.ts', 'e2e/b.e2e.ts'], ['e2e/c.e2e.ts']])
    expect(m).toEqual({ include: [{ shard: 1, files: 'e2e/a.e2e.ts e2e/b.e2e.ts' }, { shard: 2, files: 'e2e/c.e2e.ts' }] })
  })
})

describe('times from the reports of a run', () => {
  const test = (status: string, ...d: number[]) => ({ status, results: d.map((duration) => ({ duration })) })
  const rep = { suites: [{ file: 'a.e2e.ts', specs: [{ file: 'a.e2e.ts', tests: [test('expected', 4000)] }, { file: 'a.e2e.ts', tests: [test('flaky', 1000, 2000)] }, { file: 'a.e2e.ts', tests: [test('skipped')] }] }, { file: 'b.e2e.ts', specs: [{ file: 'b.e2e.ts', tests: [test('expected', 500)] }] }] }

  it('adds the seconds of every attempt of every test of a file, in whole seconds, and counts none for the skipped', () => {
    expect(durationsFromReports([rep])).toEqual({ 'e2e/a.e2e.ts': 7, 'e2e/b.e2e.ts': 1 })
  })

  it('averages the same file over several reports', () => {
    expect(durationsFromReports([rep, { suites: [{ file: 'a.e2e.ts', specs: [{ file: 'a.e2e.ts', tests: [test('expected', 11000)] }] }] }])).toMatchObject({ 'e2e/a.e2e.ts': 9 })
  })
})
