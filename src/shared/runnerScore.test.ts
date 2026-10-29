import { describe, expect, it } from 'vitest'
import { blendCatalog, cleanRuns, type RunRecord } from './runnerScore'
import type { CatalogModel } from './runnerPick'

const haiku: CatalogModel = { model: 'claude-haiku-5-5', alias: 'haiku', program: 'claude', cost: 0.05, score: 0.704, n: 2 }
const fresh: CatalogModel = { model: 'brand-new', program: 'claude', cost: 0.1 }
const runs = (model: string, accepted: number, other: 'rejected' | 'stopped' = 'rejected', failed = 0): RunRecord[] => [
  ...Array.from({ length: accepted }, (_, i) => ({ t: i, model, outcome: 'accepted' as const })),
  ...Array.from({ length: failed }, (_, i) => ({ t: 100 + i, model, outcome: other }))
]

describe('blendCatalog: what the runs add to a benchmark score', () => {
  it('leaves a model with no rated runs as it was, and records no counts', () => {
    expect(blendCatalog([haiku], [])[0]).toMatchObject({ score: 0.704, benchmark: 0.704, rated: 0, accepted: 0 })
  })
  it('weighs the benchmark like ten runs: ten accepted of ten lifts 0.704 to halfway to 1', () => {
    expect(blendCatalog([haiku], runs('claude-haiku-5-5', 10))[0]!.score).toBeCloseTo(0.852, 3)
  })
  it('pulls a model down when its work is rejected or stopped', () => {
    expect(blendCatalog([haiku], runs('claude-haiku-5-5', 0, 'rejected', 10))[0]!.score).toBeCloseTo(0.352, 3)
    expect(blendCatalog([haiku], runs('claude-haiku-5-5', 5, 'stopped', 5))[0]).toMatchObject({ rated: 10, accepted: 5 })
  })
  it('counts the runs of a model whichever name they were recorded under', () => {
    expect(blendCatalog([haiku], runs('haiku', 4))[0]).toMatchObject({ rated: 4, accepted: 4 })
  })
  it('gives a model with no benchmark a score only after five rated runs, from its pass rate alone', () => {
    expect(blendCatalog([fresh], runs('brand-new', 3, 'rejected', 1))[0]!.score).toBeUndefined()
    const earned = blendCatalog([fresh], runs('brand-new', 4, 'rejected', 1))[0]!
    expect(earned.score).toBeCloseTo(0.8)
    expect(earned.n).toBe(1)
  })
  it('ignores runs of a model that is not listed', () => {
    expect(blendCatalog([haiku], runs('other', 9))[0]!.rated).toBe(0)
  })
})

describe('cleanRuns', () => {
  it('reads one record per line and drops the rest', () => {
    const text = [JSON.stringify({ t: 1, model: 'a', outcome: 'accepted' }), 'junk', JSON.stringify({ t: 2, model: 'a', outcome: 'maybe' }), JSON.stringify({ t: 3, model: 'b', outcome: 'stopped' })].join('\n')
    expect(cleanRuns(text).map((r) => r.model + ':' + r.outcome)).toEqual(['a:accepted', 'b:stopped'])
  })
})
