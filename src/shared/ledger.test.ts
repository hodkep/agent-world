import { describe, expect, it } from 'vitest'
import { costDelta, overview, parseLedger, tokensReport, usageReport, weekReport, weekStartOf, type LedgerEvent } from './ledger'

// Local-time dates, so the tests hold in any timezone. 2026-09-07 is a Monday.
const at = (d: number, h = 0, m = 0) => new Date(2026, 8, d, h, m).getTime()
const cost = (t: number, usd: number, agent = 'a', project = 'p', model = 'Sonnet'): LedgerEvent => ({ k: 'cost', t, agent, project, model, usd })
const work = (t: number, mins: number, agent = 'a', project = 'p'): LedgerEvent => ({ k: 'work', t, agent, project, ms: mins * 60_000 })

const tokens = (t: number, input: number, output: number, agent = 'a'): LedgerEvent => ({ k: 'tokens', t, agent, project: 'p', model: 'Gemini 3.8 Flash', input, output })

describe('tokens, for programs that report no price', () => {
  it('are kept by the ledger, and never counted as work or as cost', () => {
    expect(parseLedger(JSON.stringify(tokens(1, 5, 2))).map((e) => e.k)).toEqual(['tokens'])
    const week = weekReport([tokens(at(7, 10), 1000, 100), work(at(7, 10), 30)], at(7))
    expect(week.turns).toBe(1)
    expect(week.agentMs).toBe(30 * 60_000)
    expect(usageReport([tokens(at(7, 10), 1000, 100)], 7, at(8)).total).toBe(0)
  })
  it('add up by day and for the week, oldest day first', () => {
    const r = tokensReport([tokens(at(6, 9), 1000, 100), tokens(at(7, 9), 2000, 300), tokens(at(7, 15), 500, 50), tokens(at(1, 9), 9, 9)], 3, at(7, 20))
    expect(r.days.map((d) => [d.date, d.input, d.output])).toEqual([['2026-09-05', 0, 0], ['2026-09-06', 1000, 100], ['2026-09-07', 2500, 350]])
    expect(r.total).toEqual({ input: 3500, output: 450 })
  })
})

describe('costDelta', () => {
  it('is the growth of the running total, and the whole total when a new conversation started', () => {
    expect(costDelta(1, 1.5)).toBeCloseTo(0.5)
    expect(costDelta(3, 0.4)).toBeCloseTo(0.4)
    expect(costDelta(2, 2)).toBe(0)
  })
})

describe('parseLedger', () => {
  it('skips damaged lines and unknown kinds', () => {
    const text = [JSON.stringify(cost(1, 2)), '{oops', JSON.stringify({ k: 'x' }), '', JSON.stringify(work(5, 1))].join('\n')
    expect(parseLedger(text).map((e) => e.k)).toEqual(['cost', 'work'])
  })
})

describe('weekStartOf', () => {
  it('is Monday 00:00 local', () => {
    expect(weekStartOf(at(10, 15))).toBe(at(7))
    expect(weekStartOf(at(7))).toBe(at(7))
    expect(weekStartOf(at(13, 23, 59))).toBe(at(7))
  })
})

describe('weekReport', () => {
  const events = [cost(at(7, 10), 10, 'a', 'x'), work(at(7, 10), 60, 'a', 'x'), cost(at(9, 14), 5, 'b', 'x'), work(at(9, 14), 120, 'b', 'x'), work(at(9, 15), 60, 'a', 'x'), cost(at(11, 9), 1, 'c', 'y', 'Opus'), work(at(11, 9), 30, 'c', 'y'), cost(at(14, 9), 99)]
  const r = weekReport(events, at(7))
  it('counts only the week asked for', () => {
    expect(r.costUsd).toBeCloseTo(16)
    expect(r.agentMs).toBe(270 * 60_000)
    expect(r.agents).toBe(3)
  })
  it('splits by day', () => {
    expect(r.perDay.map((d) => d.agents)).toEqual([1, 0, 2, 0, 1, 0, 0])
    expect(r.perDay[0]!.usd).toBeCloseTo(10)
  })
  it('finds the top project, busiest day, peak window and model split', () => {
    expect(r.topProject).toEqual({ name: 'x', agents: 2 })
    expect(r.busiest).toEqual({ day: 2, agents: 2 })
    expect(r.peak).toEqual({ from: 14, to: 17, ms: 180 * 60_000 })
    expect(r.byModel.map((m) => m.model)).toEqual(['Sonnet', 'Opus'])
    expect(r.byModel[0]!.usd).toBeCloseTo(15)
  })
  it('spreads a stretch over the hours it covers', () => {
    const h = weekReport([work(at(7, 9, 30), 60)], at(7)).heat
    expect(h[0]![9]).toBe(30 * 60_000)
    expect(h[0]![10]).toBe(30 * 60_000)
  })
  it('is empty without data', () => {
    const e = weekReport([], at(7))
    expect(e).toMatchObject({ costUsd: 0, agents: 0, topProject: null, busiest: null, peak: null })
  })
})

describe('usageReport', () => {
  const now = at(11, 12)
  const r = usageReport([cost(at(11, 9), 2), cost(at(10, 9), 3, 'a', 'p', 'Opus'), cost(at(1, 9), 5), cost(at(8, 1), 100)], 30, now)
  it('sums today, the last 7 days and the window', () => {
    expect(r.today).toBeCloseTo(2)
    expect(r.last7).toBeCloseTo(105)
    expect(r.total).toBeCloseTo(110)
    expect(r.last7).toBeLessThan(r.total)
  })
  it('lists one entry per day of the window, oldest first, with the model split', () => {
    expect(r.days).toHaveLength(30)
    expect(r.days.at(-1)!.date).toBe('2026-09-11')
    expect(r.days.at(-1)!.byModel).toEqual({ Sonnet: 2 })
  })
  it('totals by model', () => {
    expect(r.byModel[0]).toEqual({ model: 'Sonnet', usd: 107 })
  })
})

describe('overview', () => {
  const evs: LedgerEvent[] = [
    { k: 'cost', t: at(7, 9), agent: 'a', project: 'web', model: 'Sonnet', usd: 2, provider: 'claude', name: 'Charlie' },
    { k: 'tokens', t: at(7, 10), agent: 'b', project: 'web', model: 'Gemini', input: 1000, output: 500, provider: 'agy', name: 'Maya' },
    cost(at(6, 9), 1, 'a', 'api', 'Opus'),
    tokens(at(1, 9), 40, 10, 'b'),
    cost(at(1, 12), 4, 'a', 'web', 'Sonnet'),
    work(at(7, 9), 5, 'a', 'web'),
    work(at(7, 9), 5, 'a', 'web')
  ]
  const o = overview(evs, 3, at(7, 20), { a: 'Old name' })
  it('splits each day by program, and a program is named by the entry or, for old entries, by what it reported', () => {
    expect(o.days.map((d) => d.date)).toEqual(['2026-09-05', '2026-09-06', '2026-09-07'])
    expect(o.days[2]!.by).toEqual({ claude: { usd: 2, tokens: 0 }, agy: { usd: 0, tokens: 1500 } })
    expect(o.days[1]!.by.claude).toEqual({ usd: 1, tokens: 0 })
  })
  it('totals the window and the window before it, ignoring anything older', () => {
    expect(o.total).toEqual({ usd: 3, tokens: 1500 })
    expect(overview(evs, 3, at(9, 20)).before.usd).toBe(1)
  })
  it('ranks projects, with who worked there, their turns and the name entries carried', () => {
    expect(o.projects.map((p) => p.project)).toEqual(['web', 'api'])
    const web = o.projects[0]!
    expect(web.by).toEqual({ claude: { usd: 2, tokens: 0 }, agy: { usd: 0, tokens: 1500 } })
    expect(web.agents.map((a) => [a.name, a.turns])).toEqual([['Charlie', 2], ['Maya', 0]])
    expect(o.projects[1]!.agents[0]!.name).toBe('Old name')
  })
  it('lists each model with its program and what the program spent today', () => {
    expect(o.models.find((m) => m.model === 'Opus')).toMatchObject({ provider: 'claude', usd: 1 })
    expect(o.providers.map((p) => [p.provider, p.today.usd, p.today.tokens])).toEqual([['claude', 2, 0], ['agy', 0, 1500]])
  })
})

describe('overview by account', () => {
  const day = new Date(2026, 9, 5, 12).getTime()
  it('splits the same spend by login, counting an agent on no account as this computer', () => {
    const evs: LedgerEvent[] = [
      { k: 'cost', t: day, agent: 'a', project: 'p', model: 'm', usd: 1 },
      { k: 'cost', t: day, agent: 'b', project: 'p', model: 'm', usd: 3, account: 'work' },
      { k: 'cost', t: day, agent: 'b', project: 'p', model: 'm', usd: 2, account: 'work' }
    ]
    evs.push({ k: 'tokens', t: day, agent: 'c', project: 'p', model: 'g', input: 10, output: 5, provider: 'agy' })
    const o = overview(evs, 3, day)
    expect(o.accounts.map((a) => [a.provider, a.account, a.usd, a.tokens])).toEqual([['claude', 'work', 5, 0], ['claude', '', 1, 0], ['agy', '', 0, 15]])
    expect(o.total.usd).toBe(6)
    expect(o.accounts.find((a) => a.account === 'work')!.today.usd).toBe(5)
  })
})

describe('estimated dollars', () => {
  const day = new Date(2026, 9, 5, 12).getTime()
  it('keeps a program\'s reported dollars and an estimate apart, and marks what is estimated', () => {
    const evs: LedgerEvent[] = [
      { k: 'cost', t: day, agent: 'a', project: 'p', model: 'm', usd: 2, provider: 'claude' },
      { k: 'tokens', t: day, agent: 'a', project: 'p', model: 'm', input: 1000, output: 500, provider: 'claude' },
      { k: 'tokens', t: day, agent: 'b', project: 'p', model: 'sonnet', input: 2000, output: 1000, provider: 'agy' },
      { k: 'cost', t: day, agent: 'b', project: 'p', model: 'sonnet', usd: 0.5, provider: 'agy', est: true }
    ]
    const o = overview(evs, 3, day)
    const by = Object.fromEntries(o.providers.map((p) => [p.provider, p]))
    expect([by.claude!.usd, by.claude!.tokens, by.claude!.est ?? 0]).toEqual([2, 1500, 0])
    expect([by.agy!.usd, by.agy!.tokens, by.agy!.est]).toEqual([0.5, 3000, 0.5])
    expect(o.total.est).toBe(0.5)
  })
})
