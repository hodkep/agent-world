import { describe, expect, it } from 'vitest'
import { acctKey, overview, parseLedger, weekReport, type LedgerEvent } from './ledger'
import { tokenMix } from './tokenMix'

// Local-time dates, so the tests hold in any timezone. 2026-09-07 is a Monday.
const at = (d: number, h = 0) => new Date(2026, 8, d, h).getTime()
type Req = Extract<LedgerEvent, { k: 'req' }>
const req = (t: number, o: Partial<Req> = {}): LedgerEvent => ({ k: 'req', t, agent: 'a', project: 'web', model: 'opus', provider: 'claude', name: 'Ada', input: 10, cacheRead: 80, cacheWrite: 5, output: 5, ...o })

describe('exact requests in the ledger', () => {
  it('are kept, and counted as every token the request moved, under the program, account, project and model that made them', () => {
    expect(parseLedger(JSON.stringify(req(1))).map((e) => e.k)).toEqual(['req'])
    const o = overview([req(at(7, 10)), req(at(7, 11), { account: 'work', model: 'sonnet' })], 3, at(7, 20))
    expect(o.total.tokens).toBe(200)
    expect(o.providers[0]!.tokens).toBe(200)
    expect(o.accounts.map((a) => [a.key, a.tokens]).sort()).toEqual([[acctKey('claude', ''), 100], [acctKey('claude', 'work'), 100]])
    expect(o.models.map((m) => [m.model, m.tokens]).sort()).toEqual([['opus', 100], ['sonnet', 100]])
    expect(o.projects[0]!.agents[0]!.tokens).toBe(200)
  })

  it('are not a turn of work and cost nothing by themselves', () => {
    const w = weekReport([req(at(7, 10))], at(7))
    expect(w.turns).toBe(0)
    expect(w.costUsd).toBe(0)
    expect(w.tokens).toBe(100)
  })
})

describe('the token mix', () => {
  const now = at(7, 20)
  const events: LedgerEvent[] = [
    req(at(7, 9), { agent: 'a', name: 'Ada', input: 10, cacheRead: 80, cacheWrite: 5, output: 5 }),
    req(at(7, 10), { agent: 'a', name: 'Ada', input: 20, cacheRead: 160, cacheWrite: 0, output: 10 }),
    req(at(7, 11), { agent: 'b', name: 'Bob', project: 'api', account: 'work', model: 'sonnet', input: 4, cacheRead: 6, cacheWrite: 0, output: 1 }),
    // agy gives what was read and what came from its cache, and nothing about writing to it.
    { k: 'req', t: at(7, 12), agent: 'c', project: 'web', model: 'gemini', provider: 'agy', name: 'Cy', input: 30, cacheRead: 70, output: 9 },
    // Before requests were counted exactly the app had only input and output.
    { k: 'tokens', t: at(6, 12), agent: 'd', project: 'web', model: 'opus', provider: 'claude', name: 'Dee', input: 1000, output: 200 },
    { k: 'cost', t: at(7, 9), agent: 'a', project: 'web', model: 'opus', usd: 3, provider: 'claude', name: 'Ada' },
    { k: 'cost', t: at(7, 11), agent: 'b', project: 'api', model: 'sonnet', usd: 1, provider: 'claude', name: 'Bob', account: 'work' },
    req(at(1, 9), { agent: 'old', input: 999 })
  ]
  const mix = tokenMix(events, 3, now)

  it('adds up every request in the window, and leaves out one before it', () => {
    expect(mix.total).toMatchObject({ input: 64, cacheRead: 316, cacheWrite: 5, output: 25, legacy: 1200 })
  })

  it('files the same tokens under each grouping', () => {
    const row = (by: keyof typeof mix.groups, key: string) => mix.groups[by].find((r) => r.key === key)!
    expect(row('agent', 'a')).toMatchObject({ name: 'Ada', input: 30, cacheRead: 240, cacheWrite: 5, output: 15, usd: 3 })
    expect(row('project', 'api')).toMatchObject({ input: 4, cacheRead: 6, usd: 1 })
    expect(row('model', 'sonnet')).toMatchObject({ input: 4, usd: 1 })
    expect(row('account', acctKey('claude', 'work'))).toMatchObject({ input: 4, usd: 1 })
    expect(row('provider', 'claude')).toMatchObject({ input: 34, cacheRead: 246, usd: 4 })
  })

  it('says "not reported" for a figure a program never gives, and tells it from zero', () => {
    const agy = mix.groups.provider.find((r) => r.key === 'agy')!
    expect(agy).toMatchObject({ input: 30, cacheRead: 70, cacheWrite: null, output: 9 })
    expect(mix.groups.agent.find((r) => r.key === 'b')!.cacheWrite).toBe(0)
  })

  it('works the cache share out of the exact requests only, not of the old input-and-output counts', () => {
    const claude = mix.groups.provider.find((r) => r.key === 'claude')!
    expect(claude.share).toBeCloseTo(246 / (34 + 246 + 5))
    expect(mix.groups.agent.find((r) => r.key === 'd')!.share).toBeNull()
  })

  it('lists the biggest first', () => {
    expect(mix.groups.agent.map((r) => r.key)).toEqual(['d', 'a', 'c', 'b'])
  })

  it('can be narrowed to one account, which leaves the others out of every grouping', () => {
    const work = tokenMix(events, 3, now, {}, acctKey('claude', 'work'))
    expect(work.total).toMatchObject({ input: 4, cacheRead: 6, usd: 1 })
    expect(work.groups.agent.map((r) => r.key)).toEqual(['b'])
    expect(work.groups.provider).toHaveLength(1)
  })
})

describe('the week report\'s tokens', () => {
  const monday = at(7)
  const lastWeek = at(2, 12)
  const evs: LedgerEvent[] = [
    req(at(8, 10), { agent: 'a', account: 'work', input: 10, cacheRead: 80, cacheWrite: 5, output: 5 }),
    req(at(9, 10), { agent: 'a', account: 'work', input: 20, cacheRead: 160, cacheWrite: 0, output: 10 }),
    req(at(8, 11), { agent: 'b', input: 4, cacheRead: 6, output: 1 }),
    { k: 'tokens', t: lastWeek, agent: 'a', project: 'web', model: 'opus', provider: 'claude', account: 'work', input: 100, output: 20 },
    req(at(3, 12), { agent: 'b', input: 7, cacheRead: 70, cacheWrite: 3, output: 20 })
  ]
  const week = weekReport(evs, monday)
  const acct = (account: string) => week.accounts.find((a) => a.key === acctKey('claude', account))!

  it('keeps each account\'s week in parts, and last week in parts to be compared with', () => {
    expect(acct('work').mix).toEqual({ input: 30, cacheRead: 240, cacheWrite: 5, output: 15, legacy: 0 })
    expect(acct('work').beforeMix).toEqual({ input: 0, cacheRead: 0, cacheWrite: 0, output: 0, legacy: 120 })
    expect(acct('').beforeMix).toEqual({ input: 7, cacheRead: 70, cacheWrite: 3, output: 20, legacy: 0 })
  })

  it('has each day\'s tokens by account, to draw next to the day\'s cost', () => {
    expect(week.perDay[1]!.tokBy).toEqual({ [acctKey('claude', 'work')]: 100, [acctKey('claude', '')]: 16 })
    expect(week.perDay[2]!.tokBy).toEqual({ [acctKey('claude', 'work')]: 190 })
    expect(week.perDay[0]!.tokBy).toEqual({})
  })
})
