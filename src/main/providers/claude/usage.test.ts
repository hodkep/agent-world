import { describe, expect, it } from 'vitest'
import { parseClaudeUsage, parseReset } from './usage'

const OUT = `You are currently using your subscription to power your Claude Code usage

Current session: 29% used · resets Oct 6 at 1:20am (Asia/Calcutta)
Current week (all models): 30% used · resets Oct 9 at 7:30am (Asia/Calcutta)
Current week (Fable): 2% used · resets Oct 9 at 7:30am (Asia/Calcutta)

What's contributing to your limits usage?
`

describe('claude /usage', () => {
  const now = Date.parse('2026-10-05T20:00:00Z')
  it('reads the session, the week and a model with its own week, as shares left', () => {
    const ws = parseClaudeUsage(OUT, now)
    expect(ws.map((w) => [w.group, w.kind, w.remainingPct])).toEqual([
      ['Claude Code', 'five_hour', 71],
      ['Claude Code', 'weekly', 70],
      ['Claude Code (Fable)', 'weekly', 98]
    ])
    expect(ws.every((w) => w.provider === 'claude')).toBe(true)
  })
  it('puts a reset on the clock of the zone it names', () => {
    // 1:20am in Calcutta (UTC+5:30) on Oct 6 is 19:50 UTC on Oct 5.
    expect(new Date(parseReset('Oct 6 at 1:20am', 'Asia/Calcutta', now)!).toISOString()).toBe('2026-10-05T19:50:00.000Z')
    expect(new Date(parseReset('Oct 9 at 7:30pm', 'UTC', now)!).toISOString()).toBe('2026-10-09T19:30:00.000Z')
  })
  it('says nothing when there are no numbers', () => {
    expect(parseClaudeUsage('Not signed in', now)).toEqual([])
    expect(parseReset('someday', 'UTC', now)).toBeNull()
  })
})
