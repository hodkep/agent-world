import { describe, expect, it } from 'vitest'
import { parseStatus, statusText } from './status'

// Shape from code.claude.com/docs/en/statusline (full JSON schema).
const sample = {
  session_id: 's1',
  model: { id: 'claude-sonnet-5-5', display_name: 'Sonnet 5.5' },
  cost: { total_cost_usd: 0.4213, total_lines_added: 156, total_lines_removed: 23 },
  context_window: { used_percentage: 37, context_window_size: 200000 },
  effort: { level: 'high' },
  fast_mode: false,
  rate_limits: { five_hour: { used_percentage: 23.5, resets_at: 1738425600 } }
}

describe('statusline feed', () => {
  it('keeps the numbers the office shows', () => {
    expect(parseStatus(sample)).toEqual({
      sessionId: 's1',
      model: 'Sonnet 5.5',
      contextPct: 37,
      costUsd: 0.4213,
      linesAdded: 156,
      linesRemoved: 23,
      effort: 'high',
      fast: false,
      fiveHourPct: 23.5
    })
  })

  it('tolerates missing sections (older Claude versions, first render)', () => {
    expect(parseStatus({ session_id: 's1' })).toEqual({ sessionId: 's1', model: null, contextPct: null, costUsd: 0, linesAdded: 0, linesRemoved: 0, effort: null, fast: false, fiveHourPct: null })
  })

  it('rejects payloads without a session', () => {
    expect(parseStatus({ model: {} })).toBeNull()
    expect(parseStatus('x')).toBeNull()
  })

  it('writes the line Claude shows in its own status bar', () => {
    expect(statusText(parseStatus(sample)!)).toBe('Agent World · Sonnet 5.5 · context 37% · $0.42')
    expect(statusText(parseStatus({ session_id: 's1' })!)).toBe('Agent World')
  })
})
