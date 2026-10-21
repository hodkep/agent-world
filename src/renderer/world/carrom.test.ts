import { describe, expect, it } from 'vitest'
import { Carrom } from './carrom'

const lcg = (seed = 5) => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296
const run = (g: Carrom, ms: number, step = 100) => {
  const out: ReturnType<Carrom['update']> = []
  for (let t = 0; t < ms && !g.over; t += step) out.push(...g.update(step))
  return out
}

describe('a game of carrom', () => {
  it('is played by two or four, each taking a turn in order, one strike every couple of seconds', () => {
    const g = new Carrom(4, lcg())
    const events = run(g, 40_000)
    const strikes = events.filter((e) => e.type === 'strike').map((e) => (e as { player: number }).player)
    expect(strikes.length).toBeGreaterThan(8)
    expect(strikes.length).toBeLessThan(25)
    expect(new Set(strikes)).toEqual(new Set([0, 1, 2, 3]))
    expect(() => new Carrom(3, lcg())).toThrow()
  })

  it('pockets coins now and then, three points for the queen and one for the others, and the player who pockets goes on', () => {
    const g = new Carrom(2, lcg(9))
    const events = run(g, 120_000)
    const pockets = events.filter((e) => e.type === 'pocket') as { type: 'pocket'; player: number; coin: string | null }[]
    expect(pockets.some((p) => p.coin === 'black' || p.coin === 'white')).toBe(true)
    expect(g.scores.reduce((a, b) => a + b, 0)).toBeGreaterThan(0)
    for (let i = 1; i < events.length; i++) {
      const e = events[i - 1]!
      const n = events[i]!
      if (e.type === 'pocket' && e.coin && n.type === 'strike') expect(n.player).toBe(e.player)
    }
  })

  it('ends when the coins are gone or after enough strikes, with the player on most points the winner, and says so once', () => {
    const g = new Carrom(2, lcg(3))
    const events = run(g, 600_000)
    const over = events.filter((e) => e.type === 'over') as { type: 'over'; winner: number }[]
    expect(g.over).toBe(true)
    expect(over).toHaveLength(1)
    expect(g.scores[over[0]!.winner]).toBe(Math.max(...g.scores))
    expect(g.update(5000)).toEqual([])
  })

  it('plays faster when the clock is sped up', () => {
    const slow = run(new Carrom(2, lcg(1)), 8000).filter((e) => e.type === 'strike').length
    const fast = run(new Carrom(2, lcg(1), 5), 8000).filter((e) => e.type === 'strike').length
    expect(fast).toBeGreaterThan(slow * 3)
  })
})
