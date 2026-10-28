import { describe, expect, it } from 'vitest'
import { contextReport, contextText, ctxOf, resetEffects, runsOf, weightOf, type CtxReq } from './contextCurve'

const req = (agent: string, t: number, ctx: number, output = 0): CtxReq => ({ agent, t, input: 2, cacheRead: ctx - 2, cacheWrite: 0, output })
/** An agent's requests at the given context sizes, one a minute. */
const run = (agent: string, sizes: number[]) => sizes.map((c, i) => req(agent, i * 60_000, c))

describe('ctxOf and weightOf', () => {
  it('counts what was read fresh, from the cache and written to it as the context', () => {
    expect(ctxOf({ t: 0, agent: 'a', input: 2, cacheRead: 90, cacheWrite: 8, output: 500 })).toBe(100)
  })
  it('weighs a request at the usual price ratios: cache read a tenth, cache write 1.25, output 5', () => {
    expect(weightOf({ t: 0, agent: 'a', input: 10, cacheRead: 100, cacheWrite: 8, output: 2 })).toBe(10 + 10 + 10 + 10)
  })
})

describe('runsOf', () => {
  it('starts a new run for an agent when its context falls under 60% of the one before (a compaction, a clear, a new session)', () => {
    const runs = runsOf(run('a', [40e3, 80e3, 120e3, 30e3, 50e3]))
    expect(runs.map((r) => r.length)).toEqual([3, 2])
  })
  it('does not call a small fall, or a fall from a small context, a reset', () => {
    expect(runsOf(run('a', [100e3, 70e3, 90e3])).length).toBe(1)
    expect(runsOf(run('a', [20e3, 5e3, 6e3])).length).toBe(1)
  })
  it('does not call a dip that comes straight back a reset: it is a small side request, not a compaction', () => {
    expect(runsOf(run('a', [200e3, 20e3, 205e3, 210e3])).length).toBe(1)
    expect(runsOf(run('a', [200e3, 20e3, 22e3, 21e3, 210e3])).length).toBe(1)
  })
  it('calls a fall that stays low a reset, and one with nothing after it yet', () => {
    expect(runsOf(run('a', [200e3, 20e3, 22e3, 21e3, 23e3])).length).toBe(2)
    expect(runsOf(run('a', [200e3, 20e3])).length).toBe(2)
  })
  it('keeps agents apart, and sorts a agent\'s requests by time', () => {
    const mixed = [...run('a', [40e3, 50e3]), ...run('b', [90e3, 20e3])].sort((x, y) => y.t - x.t)
    const runs = runsOf(mixed)
    expect(runs.map((r) => [r[0]!.agent, r.length]).sort()).toEqual([['a', 2], ['b', 1], ['b', 1]])
  })
})

describe('contextReport', () => {
  const reqs = [...run('a', [50e3, 150e3, 250e3, 250e3]), ...run('b', [60e3])]
  it('counts requests and the share of weight by context band', () => {
    const r = contextReport(reqs)
    expect(r.requests).toBe(5)
    expect(r.bands.map((b) => b.requests)).toEqual([2, 1, 2])
    expect(r.bands.reduce((s, b) => s + b.share, 0)).toBeCloseTo(1)
    expect(r.bands[2]!.share).toBeGreaterThan(r.bands[0]!.share)
  })
  it('says the median and the peak context', () => {
    const r = contextReport(reqs)
    expect(r.median).toBe(150e3)
    expect(r.peak).toBe(250e3)
  })
  it('works out what holding the context to a cap would have saved, on the cache-read part', () => {
    const only = run('a', [200e3, 200e3])
    const r = contextReport(only, 100e3)
    // each request: weight 2 + 0.1 * 198k = 19,802; held to 100k it would lose 0.1 * 100k = 10,000
    expect(r.saving).toBeCloseTo(20_000 / (2 * (2 + 0.1 * 199_998)), 3)
  })
  it('is empty and not NaN with no requests', () => {
    const r = contextReport([])
    expect(r).toMatchObject({ requests: 0, median: 0, peak: 0, saving: 0, resets: 0 })
  })
  it('counts the resets', () => {
    expect(contextReport(run('a', [100e3, 120e3, 20e3, 30e3])).resets).toBe(1)
  })
})

describe('resetEffects', () => {
  it('compares the median context of the requests before and after each reset', () => {
    const sizes = [100e3, 120e3, 140e3, 20e3, 30e3, 40e3]
    const [e] = resetEffects(run('a', sizes), 3)
    expect(e).toMatchObject({ agent: 'a', before: 120e3, after: 30e3 })
  })
  it('has nothing for an agent that never reset', () => {
    expect(resetEffects(run('a', [10e3, 20e3, 30e3]), 3)).toEqual([])
  })
})

describe('contextText', () => {
  const reqs = [...run('a', [100e3, 220e3, 240e3, 40e3, 60e3])]
  it('says in plain words how many requests, how big the context got, where the cost is, and what a cap would save', () => {
    const t = contextText(contextReport(reqs), resetEffects(reqs, 2), 'the last 7 days')
    expect(t).toContain('the last 7 days: 5 requests')
    expect(t).toContain('median context 100k, peak 240k')
    expect(t).toContain('over 200k: 2 requests')
    expect(t).toMatch(/holding the context to 100k would have saved about \d+%/i)
    expect(t).toContain('1 reset')
    expect(t).toContain('230k to 50k')
  })
  it('says there is nothing to report with no requests', () => {
    expect(contextText(contextReport([]), [], 'the last 7 days')).toBe('the last 7 days: no requests counted yet.')
  })
})
