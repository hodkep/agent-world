import { describe, expect, it } from 'vitest'
import { banks, busiest, claudeWindows, limitBoard, lowCount, runsOutIn, weekElapsed } from './limits'
import type { LimitWindow } from './types'

const w = (provider: LimitWindow['provider'], group: string, kind: LimitWindow['kind'], remainingPct: number): LimitWindow => ({ provider, group, kind, remainingPct, resetsAt: '2026-10-05T16:00:00Z' })

describe('Claude Code limits as windows', () => {
  it('turns the statusline readings (share used, reset in ms) into share left and a reset time', () => {
    const r = claudeWindows({ fiveHour: { pct: 30, resetsAt: Date.UTC(2026, 9, 5, 16) }, sevenDay: { pct: 90, resetsAt: Date.UTC(2026, 9, 12) } })
    expect(r).toEqual([
      { provider: 'claude', group: 'Claude Code', kind: 'five_hour', remainingPct: 70, resetsAt: '2026-10-05T16:00:00.000Z' },
      { provider: 'claude', group: 'Claude Code', kind: 'weekly', remainingPct: 10, resetsAt: '2026-10-12T00:00:00.000Z' }
    ])
  })
  it('leaves out a window it has not been told about', () => {
    expect(claudeWindows({ fiveHour: null, sevenDay: null })).toEqual([])
  })
})

describe('across providers', () => {
  const all = [w('claude', 'Claude Code', 'five_hour', 70), w('agy', 'Gemini Models', 'five_hour', 12), w('agy', 'Claude and GPT models', 'weekly', 40)]
  it('the busiest window is the one with least left', () => {
    expect(busiest(all)?.group).toBe('Gemini Models')
    expect(busiest([])).toBeNull()
  })
  it('counts windows under 15% left', () => {
    expect(lowCount(all)).toBe(1)
    expect(lowCount([w('claude', 'Claude Code', 'weekly', 15)])).toBe(0)
  })
})

describe('banks with several logins', () => {
  const w = (account: string | undefined, remainingPct: number, kind: 'five_hour' | 'weekly'): LimitWindow => ({ provider: 'claude', group: 'Claude Code', kind, remainingPct, resetsAt: '2030-01-01T00:00:00.000Z', ...(account !== undefined && { account }) })
  it('shows the tightest in the tank and one entry per login for the moons', () => {
    const [b] = banks([w('', 94, 'five_hour'), w('', 69, 'weekly'), w('work', 57, 'five_hour'), w('work', 36, 'weekly')], ['claude'])
    expect(b!.five!.pct).toBe(43)
    expect(b!.week!.pct).toBe(64)
    expect(b!.logins.map((l) => [l.id, l.five!.pct, l.week!.pct])).toEqual([['', 6, 31], ['work', 43, 64]])
  })
  it('has no moons for one login, or for a program that does not tag its windows', () => {
    expect(banks([w('', 80, 'five_hour')], ['claude'])[0]!.logins).toEqual([])
    expect(banks([w(undefined, 80, 'five_hour')], ['claude'])[0]!.logins).toEqual([])
  })
})

describe('the limits board', () => {
  const win = (provider: LimitWindow['provider'], group: string, kind: LimitWindow['kind'], remainingPct: number, account?: string): LimitWindow => ({ provider, group, kind, remainingPct, resetsAt: '2030-01-01T00:00:00.000Z', ...(account !== undefined && { account }) })
  const names = { provider: (id: string) => (id === 'claude' ? 'Claude Code' : 'agy'), account: (id: string) => (id === '' ? 'This computer' : 'Work') }
  it('gives a program with several logins a row per login and a sub-row per model group', () => {
    const [b] = limitBoard([win('claude', 'Claude Code', 'five_hour', 94, ''), win('claude', 'Claude Code', 'weekly', 69, ''), win('claude', 'Claude Code (Fable)', 'weekly', 98, ''), win('claude', 'Claude Code', 'five_hour', 57, 'work')], names)
    expect(b!.rows.map((r) => [r.label, r.sub, r.five?.remainingPct ?? null, r.week?.remainingPct ?? null])).toEqual([['This computer', false, 94, 69], ['Fable', true, null, 98], ['Work', false, 57, null]])
  })
  it('names rows by login while only one has reported, once the program has several', () => {
    const rows = limitBoard([win('claude', 'Claude Code', 'five_hour', 57, 'work')], { ...names, keeps: () => true })[0]!.rows
    expect(rows.map((r) => [r.label, r.account])).toEqual([['Work', 'work']])
  })
  it('names a single login\'s rows by what the program limits', () => {
    const rows = limitBoard([win('agy', 'Gemini Models', 'five_hour', 100), win('agy', 'Claude and GPT models', 'weekly', 100)], names)[0]!.rows
    expect(rows.map((r) => [r.label, r.account])).toEqual([['Gemini Models', undefined], ['Claude and GPT models', undefined]])
    expect(limitBoard([win('claude', 'Claude Code', 'five_hour', 50, '')], names)[0]!.rows[0]!.label).toBe('Claude Code')
  })
})

describe('pace', () => {
  const now = Date.parse('2026-09-10T12:00:00Z')
  const week = (remainingPct: number, hoursToReset: number): LimitWindow => ({ provider: 'claude', group: 'Claude Code', kind: 'weekly', remainingPct, resetsAt: new Date(now + hoursToReset * 3_600_000).toISOString() })
  it('says how far through its week an allowance is', () => {
    expect(weekElapsed(week(50, 84), now)).toBeCloseTo(0.5)
    expect(weekElapsed(week(50, 500), now)).toBe(0)
  })
  it('says when an allowance runs out, only if that comes before it resets', () => {
    // Half the week gone and 80% used: the last 20% lasts 1/4 of what has passed, 21 hours.
    expect(runsOutIn(week(20, 84), now)! / 3_600_000).toBeCloseTo(21)
    expect(runsOutIn(week(60, 84), now)).toBeNull()
    expect(runsOutIn({ ...week(20, 84), kind: 'five_hour' }, now)).toBeNull()
    expect(runsOutIn(week(99, 160), now)).toBeNull()
  })
})
