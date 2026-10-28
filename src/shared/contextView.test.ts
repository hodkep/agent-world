import { describe, expect, it } from 'vitest'
import { contextView, insightsOf } from './contextView'
import { DAY, acctKey, type LedgerEvent } from './ledger'

const NOW = 100 * DAY
const req = (agent: string, t: number, ctx: number, o: Partial<Extract<LedgerEvent, { k: 'req' }>> = {}): LedgerEvent => ({ k: 'req', t, agent, project: 'p', model: 'm', provider: 'claude', name: agent.toUpperCase(), input: 2, cacheRead: ctx - 2, cacheWrite: 0, output: 0, ...o })
/** An agent's requests ending `ago` days back, one a minute, at the given context sizes. */
const run = (agent: string, ago: number, sizes: number[], o: Partial<Extract<LedgerEvent, { k: 'req' }>> = {}) => sizes.map((c, i) => req(agent, NOW - ago * DAY + i * 60_000, c, o))

describe('contextView', () => {
  it('keeps the requests of the last days, an agent at a time, the costliest first, named as the ledger names them', () => {
    const v = contextView([...run('a', 1, [50e3, 60e3]), ...run('b', 1, [250e3, 260e3, 270e3]), ...run('a', 20, [300e3])], 7, NOW, {})
    expect(v.agents.map((a) => [a.name, a.report.requests])).toEqual([['B', 3], ['A', 2]])
    expect(v.total.requests).toBe(5)
  })
  it('shows only one account when asked', () => {
    const events = [...run('a', 1, [50e3, 60e3], { account: 'work' }), ...run('b', 1, [250e3], { account: 'home' })]
    const v = contextView(events, 7, NOW, {}, acctKey('claude', 'work'))
    expect(v.agents.map((a) => a.name)).toEqual(['A'])
  })
  it('cuts the points to a few hundred and puts a reset where the context fell and stayed low', () => {
    const sizes = [...Array.from({ length: 600 }, (_, i) => 100e3 + i * 300), 20e3, 21e3, 22e3, 23e3]
    const a = contextView(run('a', 1, sizes), 7, NOW, {}).agents[0]!
    expect(a.points.length).toBeLessThanOrEqual(240)
    expect(a.resets).toHaveLength(1)
    expect(a.resets[0]!.before).toBeGreaterThan(200e3)
    expect(a.resets[0]!.after).toBeLessThan(25e3)
    expect(a.resets[0]!.at).toBeGreaterThan(a.points.length * 0.9)
  })
  it('reports the days before too, so a trend can be said, and null when there were none', () => {
    const none = contextView(run('a', 1, [250e3, 250e3]), 7, NOW, {})
    expect(none.before).toBeNull()
    const some = contextView([...run('a', 1, [250e3]), ...run('a', 10, [50e3, 60e3])], 7, NOW, {})
    expect(some.before!.requests).toBe(2)
  })
})

describe('insightsOf', () => {
  const events = [...run('a', 1, [100e3, 220e3, 240e3, 40e3, 41e3, 42e3, 43e3])]
  const v = contextView(events, 7, NOW, {})
  it('says in three plain sentences where an agent\'s cost was, what its resets did, and what a cap would have saved', () => {
    const [cost, resets, cap] = insightsOf(v, v.agents[0]!.name)
    expect(cost).toMatch(/^A spent \d+% of its cost above 200k, peaking at 240k\.$/)
    expect(resets).toBe('It was compacted once: the last time from 240k to 40k.')
    expect(cap).toMatch(/^Holding it to 100k would have saved about \d+%\.$/)
  })
  it('says an agent never compacted when it did not', () => {
    const w = contextView(run('a', 1, [100e3, 120e3, 140e3]), 7, NOW, {})
    expect(insightsOf(w, 'A')[1]).toBe('It never compacted: its context only grew.')
  })
  it('speaks for the whole office when no agent is named', () => {
    expect(insightsOf(v)[0]).toMatch(/^\d+% of the cost came from the 2 requests with a context over 200k\.$/)
  })
})
