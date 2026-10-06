import { describe, expect, it } from 'vitest'
import { LimitsBook, limitView, mergeLimits, tokenLabel, untilReset } from './usage'

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

describe('tokenLabel', () => {
  it('keeps a few characters, the way agy draws its own counts', () => {
    expect([409, 3487, 21034, 1_900_000, 1_000, 999_999].map(tokenLabel)).toEqual(['409', '3.5k', '21k', '1.9M', '1k', '1M'])
  })
})

describe('LimitsBook', () => {
  const l = (pct: number) => ({ fiveHour: { pct, resetsAt: 1 }, sevenDay: null })
  it('keeps each account\'s reading apart and shows the tightest', () => {
    const b = new LimitsBook()
    b.record('', l(20))
    b.record('work', l(70))
    expect(b.of('').fiveHour?.pct).toBe(20)
    expect(b.of('work').fiveHour?.pct).toBe(70)
    expect(b.tightest().fiveHour?.pct).toBe(70)
    expect(b.accounts()).toEqual(['', 'work'])
  })
  it('keeps a window a newer reading leaves out', () => {
    const b = new LimitsBook()
    b.record('', { fiveHour: { pct: 10, resetsAt: 1 }, sevenDay: { pct: 5, resetsAt: 2 } })
    b.record('', l(30))
    expect(b.of('').sevenDay?.pct).toBe(5)
    expect(b.of('').fiveHour?.pct).toBe(30)
  })
  it('round-trips, and reads the single reading saved before accounts as the own login', () => {
    const b = new LimitsBook()
    b.record('work', l(40))
    expect(LimitsBook.from(JSON.parse(JSON.stringify(b))).of('work').fiveHour?.pct).toBe(40)
    expect(LimitsBook.from({ fiveHour: { pct: 12, resetsAt: 1 }, sevenDay: null }).of('').fiveHour?.pct).toBe(12)
    expect(LimitsBook.from('junk').accounts()).toEqual([])
  })
})
