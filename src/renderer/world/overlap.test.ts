import { describe, expect, it } from 'vitest'
import { spread } from './overlap'

describe('spread overlapping tags', () => {
  it('leaves separate tags where they are', () => {
    const out = spread([
      { id: 'a', x: 0, y: 0, w: 10, h: 5 },
      { id: 'b', x: 20, y: 0, w: 10, h: 5 }
    ], 1)
    expect(out).toEqual({ a: 0, b: 0 })
  })

  it('pushes a colliding tag clear of the one already placed, in the given direction', () => {
    const down = spread([
      { id: 'a', x: 0, y: 0, w: 10, h: 5 },
      { id: 'b', x: 4, y: 2, w: 10, h: 5 }
    ], 1)
    expect(down).toEqual({ a: 0, b: 3 })
    const up = spread([
      { id: 'a', x: 0, y: 10, w: 10, h: 5 },
      { id: 'b', x: 4, y: 8, w: 10, h: 5 }
    ], -1)
    expect(up.b).toBeLessThanOrEqual(-3)
  })

  it('stacks three tags without any two overlapping', () => {
    const boxes = [0, 1, 2].map((i) => ({ id: String(i), x: i, y: 0, w: 10, h: 5 }))
    const out = spread(boxes, 1)
    const ys = boxes.map((b) => b.y + out[b.id]!).sort((a, b) => a - b)
    expect(ys[1]! - ys[0]!).toBeGreaterThanOrEqual(5)
    expect(ys[2]! - ys[1]!).toBeGreaterThanOrEqual(5)
  })

  it('treats fixed boxes as obstacles without moving them', () => {
    const out = spread([{ id: 'bubble', x: 0, y: 8, w: 10, h: 5 }], -1, [{ id: 'tag', x: 0, y: 10, w: 10, h: 5 }])
    expect(out.bubble).toBe(-3)
    expect(out.tag).toBeUndefined()
  })
})
