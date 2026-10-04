import { describe, expect, it } from 'vitest'
import { type Shape, add, arrowHead, canRedo, canUndo, clear, empty, lineWidth, normRect, redo, undo } from './annotate'

const rect = (n: number): Shape => ({ kind: 'rect', color: '#d83a3a', a: { x: n, y: n }, b: { x: n + 10, y: n + 10 } })

describe('the history of marks drawn on a picture', () => {
  it('adds marks in order and undoes and redoes them one at a time', () => {
    let h = add(add(empty(), rect(1)), rect(2))
    expect(h.done).toHaveLength(2)
    h = undo(h)
    expect(h.done).toEqual([rect(1)])
    expect(canRedo(h)).toBe(true)
    h = redo(h)
    expect(h.done).toEqual([rect(1), rect(2)])
    expect(canRedo(h)).toBe(false)
  })

  it('forgets what could be redone once something new is drawn', () => {
    const h = add(undo(add(add(empty(), rect(1)), rect(2))), rect(3))
    expect(h.done).toEqual([rect(1), rect(3)])
    expect(canRedo(h)).toBe(false)
  })

  it('does nothing when there is nothing to undo or redo', () => {
    expect(canUndo(empty())).toBe(false)
    expect(undo(empty())).toEqual(empty())
    expect(redo(empty())).toEqual(empty())
  })

  it('clears every mark at once, and that can be undone', () => {
    const drawn = add(add(empty(), rect(1)), rect(2))
    const cleared = clear(drawn)
    expect(cleared.done).toEqual([])
    expect(undo(cleared).done).toEqual([rect(1), rect(2)])
  })
})

describe('shape geometry', () => {
  it('makes a rectangle from any two opposite corners', () => {
    expect(normRect({ x: 50, y: 40 }, { x: 10, y: 5 })).toEqual({ x: 10, y: 5, w: 40, h: 35 })
  })

  it('puts the two arrow-head wings behind the tip, at equal angles either side of the line', () => {
    const [l, r] = arrowHead({ x: 0, y: 0 }, { x: 100, y: 0 }, 10)
    expect(l.x).toBeCloseTo(r.x)
    expect(l.x).toBeLessThan(100)
    expect(l.y).toBeCloseTo(-r.y)
    expect(Math.abs(l.y)).toBeGreaterThan(0)
  })

  it('has no head to draw for a zero-length arrow', () => {
    expect(arrowHead({ x: 5, y: 5 }, { x: 5, y: 5 }, 10)).toEqual([{ x: 5, y: 5 }, { x: 5, y: 5 }])
  })

  it('scales the stroke with the picture so marks stay readable on a large screenshot, with a floor for small ones', () => {
    expect(lineWidth(200, 100)).toBe(3)
    expect(lineWidth(2880, 1736)).toBeGreaterThan(lineWidth(1000, 600))
  })
})
