import { describe, expect, it } from 'vitest'
import { chime } from './sounds'

describe('the sounds of a call starting and ending', () => {
  it('rises when the call connects: two notes, the second higher', () => {
    const n = chime('start')
    expect(n).toHaveLength(2)
    expect(n[1]!.freq).toBeGreaterThan(n[0]!.freq)
  })
  it('falls when the call ends: two notes, the second lower', () => {
    const n = chime('end')
    expect(n).toHaveLength(2)
    expect(n[1]!.freq).toBeLessThan(n[0]!.freq)
  })
  it('is short, so it never gets in the way of the first words', () => {
    for (const k of ['start', 'end'] as const) {
      const n = chime(k)
      expect(Math.max(...n.map((x) => x.at + x.dur))).toBeLessThan(0.5)
    }
  })
})
