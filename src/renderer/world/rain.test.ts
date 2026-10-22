import { describe, expect, it } from 'vitest'
import { splashesAt, streakAt } from './rain'

const W = 928
const H = 448

describe('the rain over the grounds', () => {
  it('has a streak for each drop, which moves down as the frames go and stays inside the grounds', () => {
    for (let i = 0; i < 200; i++) {
      const a = streakAt(i, 10, W, H)
      const b = streakAt(i, 11, W, H)
      expect(a.x).toBeGreaterThanOrEqual(0)
      expect(a.x).toBeLessThan(W)
      expect(a.y).toBeGreaterThanOrEqual(0)
      expect(a.y).toBeLessThan(H)
      // Down by 17 pixels, or round to the top again.
      expect((b.y - a.y + H) % H).toBe(17)
    }
  })

  it('splashes where a drop lands: at the foot of the streaks that reach the ground in this frame, and not at the others', () => {
    const list = splashesAt(5, 400, W, H)
    expect(list.length).toBeGreaterThan(0)
    expect(list.length).toBeLessThan(400 / 2)
    for (const s of list) {
      const streak = streakAt(s.i, 5, W, H)
      expect(s.x).toBe(streak.x)
      expect(s.y).toBe(streak.y + 7)
      expect(s.age).toBeGreaterThanOrEqual(0)
      expect(s.age).toBeLessThan(3)
    }
    // Every drop has its splash for 3 frames, so over 3 frames in a row the same drop is listed.
    const ids = (f: number) => new Set(splashesAt(f, 400, W, H).map((s) => s.i))
    expect(ids(5).size).toBeGreaterThan(0)
    expect([...ids(5)].some((i) => ids(6).has(i))).toBe(true)
  })
})
