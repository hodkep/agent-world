import { describe, expect, it } from 'vitest'
import { busiest, claudeWindows, lowCount } from './limits'
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
