import { describe, expect, it } from 'vitest'
import { limitView, mergeLimits, untilReset } from './usage'

const H = 3_600_000
const now = 1_000_000_000_000

describe('usage limits', () => {
  it('says how long until a window resets', () => {
    expect(untilReset(now + 2 * H + 10 * 60_000, now)).toBe('2h 10m')
    expect(untilReset(now + 50 * 60_000, now)).toBe('50m')
    expect(untilReset(now + 3 * 24 * H + 4 * H, now)).toBe('3d 4h')
    expect(untilReset(now + 20_000, now)).toBe('<1m')
    expect(untilReset(now - 1, now)).toBe('now')
  })

  it('grades usage so the meter can colour itself', () => {
    expect(limitView({ pct: 38, resetsAt: now + H }, now)).toMatchObject({ pct: 38, level: 'ok', reset: '1h 0m' })
    expect(limitView({ pct: 72, resetsAt: now + H }, now).level).toBe('warn')
    expect(limitView({ pct: 93, resetsAt: now + H }, now).level).toBe('hot')
  })

  it('treats a window that has already reset as empty rather than showing stale usage', () => {
    expect(limitView({ pct: 88, resetsAt: now - 5 }, now)).toMatchObject({ pct: 0, level: 'ok', reset: 'reset' })
  })

  it('has nothing to show before the first reading', () => {
    expect(limitView(null, now)).toEqual({ pct: null, level: 'ok', reset: '' })
  })

  it('keeps the last reading of a window the newest update does not mention', () => {
    const prev = { fiveHour: { pct: 10, resetsAt: 5 }, sevenDay: { pct: 40, resetsAt: 9 } }
    expect(mergeLimits(prev, { fiveHour: { pct: 12, resetsAt: 5 }, sevenDay: null })).toEqual({ fiveHour: { pct: 12, resetsAt: 5 }, sevenDay: { pct: 40, resetsAt: 9 } })
  })
})
