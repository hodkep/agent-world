import { describe, expect, it } from 'vitest'
import type { LedgerEvent } from './ledger'
import { shareReport } from './attribution'

const at = (day: number, hour: number) => new Date(2026, 10, day, hour).getTime()
const lim = (t: number, usedPct: number, account = 'work', kind: 'weekly' | 'five_hour' = 'weekly', group = 'Claude Code'): LedgerEvent => ({ k: 'limit', t, provider: 'claude', account, group, kind, usedPct })
const cost = (t: number, usd: number, model = 'claude-opus-4-7', account = 'work'): LedgerEvent => ({ k: 'cost', t, agent: 'a', project: 'p', model, usd, provider: 'claude', account })
const NOW = at(5, 12)
const day = (r: ReturnType<typeof shareReport>, d: number) => r.days[d - 1]!.rows.find((x) => x.account === 'work')

describe('how much of an account\'s allowance this app used', () => {
  it('says a day exactly when the app was alone: the account rose by what the app\'s spend costs', () => {
    // Two stretches where only the app worked: $10 of Opus moved the account by 5 points each time, so a dollar is half a point.
    const ev = [lim(at(3, 8), 10), cost(at(3, 9), 10), lim(at(3, 10), 15), cost(at(3, 11), 10), lim(at(3, 12), 20)]
    expect(day(shareReport(ev, 2026, 10, 'weekly', NOW), 3)).toMatchObject({ used: 10, mine: 10, learning: false })
  })

  it('does not count another person\'s use as ours, however big the rise (Opus at half price, others adding the other half)', () => {
    // Alone first: $100 of Opus is 5 points. Later the app spends $100 again but the account rises 10: the extra 5 is somebody else's.
    const ev = [lim(at(3, 8), 10), cost(at(3, 9), 100), lim(at(3, 10), 15), cost(at(3, 11), 100), lim(at(3, 12), 20), cost(at(4, 9), 100), lim(at(4, 10), 30)]
    const r = shareReport(ev, 2026, 10, 'weekly', NOW)
    expect(day(r, 4)).toMatchObject({ used: 10, mine: 5 })
  })

  it('counts a day\'s rise as ours when the reading came in a stretch without the spend (the allowance ticks up in lumps)', () => {
    // $10 of Opus is 5 points, seen twice. On day 4 the account rises 5 with no spend yet; the spend is in the next stretch, with no rise.
    const ev = [lim(at(3, 8), 10), cost(at(3, 9), 10), lim(at(3, 10), 15), cost(at(3, 11), 10), lim(at(3, 12), 20), lim(at(4, 8), 20), lim(at(4, 9), 25), cost(at(4, 10), 10), lim(at(4, 11), 25)]
    expect(day(shareReport(ev, 2026, 10, 'weekly', NOW), 4)).toMatchObject({ used: 5, mine: 5 })
  })

  it('still leaves the rest to others when a day\'s spend, at the rate, explains less than its rise', () => {
    const ev = [lim(at(3, 8), 10), cost(at(3, 9), 10), lim(at(3, 10), 15), cost(at(3, 11), 10), lim(at(3, 12), 20), lim(at(4, 8), 20), cost(at(4, 9), 10), lim(at(4, 10), 30)]
    expect(day(shareReport(ev, 2026, 10, 'weekly', NOW), 4)).toMatchObject({ used: 10, mine: 5 })
  })

  it('says "still learning" until the rate has been seen twice, and never claims more than the account rose', () => {
    const ev = [lim(at(3, 8), 10), cost(at(3, 9), 10), lim(at(3, 10), 16)]
    const d = day(shareReport(ev, 2026, 10, 'weekly', NOW), 3)!
    expect(d.learning).toBe(true)
    expect(d.mine).toBeLessThanOrEqual(d.used)
  })

  it('learns a rate for each model apart: a dollar of one model is not a dollar of another', () => {
    const ev = [
      lim(at(2, 8), 0), cost(at(2, 9), 10, 'opus'), lim(at(2, 10), 10), cost(at(2, 11), 10, 'opus'), lim(at(2, 12), 20),
      cost(at(3, 9), 10, 'sonnet'), lim(at(3, 10), 25), cost(at(3, 11), 10, 'sonnet'), lim(at(3, 12), 30),
      cost(at(4, 9), 10, 'opus'), cost(at(4, 9), 10, 'sonnet'), lim(at(4, 12), 50)
    ]
    expect(day(shareReport(ev, 2026, 10, 'weekly', NOW), 4)).toMatchObject({ used: 20, mine: 15, learning: false })
  })

  it('leaves out a stretch that crosses a reset, and a rise too small to read a rate from', () => {
    const ev = [lim(at(3, 8), 90), cost(at(3, 9), 10), lim(at(3, 10), 2), lim(at(3, 11), 3), cost(at(3, 12), 10), lim(at(3, 13), 4)]
    const d = day(shareReport(ev, 2026, 10, 'weekly', NOW), 3)!
    expect(d.used).toBe(2)
    expect(d.learning).toBe(true)
  })

  it('forgets a rate older than a week, so a promo that ended is noticed', () => {
    const old = [lim(at(1, 8), 0), cost(at(1, 9), 10), lim(at(1, 10), 10), cost(at(1, 11), 10), lim(at(1, 12), 20)]
    const now = [lim(at(18, 8), 20), cost(at(18, 9), 10), lim(at(18, 10), 25)]
    const d = day(shareReport([...old, ...now], 2026, 10, 'weekly', at(20, 12)), 18)!
    expect(d.mine).toBe(5)
    expect(d.learning).toBe(true)
  })

  it('keeps accounts and the two allowances apart, and ignores a per-model allowance and another program\'s', () => {
    const ev = [lim(at(3, 8), 10), lim(at(3, 10), 15), lim(at(3, 8), 10, 'work', 'five_hour'), lim(at(3, 10), 30, 'work', 'five_hour'), lim(at(3, 8), 1, 'work', 'weekly', 'Claude Code (Fable)'), lim(at(3, 10), 9, 'work', 'weekly', 'Claude Code (Fable)'), lim(at(3, 8), 40, 'team'), lim(at(3, 10), 41, 'team'), { ...lim(at(3, 8), 0), provider: 'agy', group: 'Gemini Models' }, { ...lim(at(3, 10), 90), provider: 'agy', group: 'Gemini Models' }]
    const r = shareReport(ev, 2026, 10, 'weekly', NOW)
    expect(r.days[2]!.rows.map((x) => [x.account, x.used])).toEqual([['work', 5], ['team', 1]])
  })

  it('has a cell for every day of the month, empty where nothing was seen', () => {
    const r = shareReport([], 2026, 10, 'weekly', NOW)
    expect(r.days).toHaveLength(30)
    expect(r.days[0]).toMatchObject({ date: '2026-11-01', rows: [] })
  })
})
