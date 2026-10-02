import { describe, expect, it } from 'vitest'
import { FIGURE_H, FIGURE_W, figureMood, renderFigure } from './figure'

const base = { key: 'agent-1', role: 'senior' as const, mood: 'working' as const, t: 0, reduced: false }
const same = (a: Uint8ClampedArray, b: Uint8ClampedArray) => a.length === b.length && a.every((v, i) => v === b[i])

describe('the portrait', () => {
  it('is a small opaque picture, the same every time for the same moment', () => {
    const a = renderFigure(base)
    expect([a.width, a.height]).toEqual([FIGURE_W, FIGURE_H])
    expect(a.data).toHaveLength(FIGURE_W * FIGURE_H * 4)
    for (let i = 3; i < a.data.length; i += 4) expect(a.data[i]).toBe(255)
    expect(same(a.data, renderFigure(base).data)).toBe(true)
  })

  it('turns its head over time: the front and the side are different frames', () => {
    const front = renderFigure({ ...base, t: 0 })
    const side = renderFigure({ ...base, t: 420 * 3 })
    const other = renderFigure({ ...base, t: 420 * 9 })
    expect(same(front.data, side.data)).toBe(false)
    expect(same(side.data, other.data)).toBe(false)
  })

  it('breathes: the chest is at a different height half a second apart, even facing front', () => {
    expect(same(renderFigure({ ...base, t: 0 }).data, renderFigure({ ...base, t: 800 }).data)).toBe(false)
  })

  it('stays still with reduced motion, whatever the time', () => {
    const r = (t: number) => renderFigure({ ...base, reduced: true, t })
    expect(same(r(0).data, r(420 * 3).data)).toBe(true)
    expect(same(r(0).data, r(800).data)).toBe(true)
  })

  it('shows what it is doing: working, idle and asleep look different', () => {
    const m = (mood: 'working' | 'idle' | 'asleep') => renderFigure({ ...base, mood }).data
    expect(same(m('working'), m('idle'))).toBe(false)
    expect(same(m('idle'), m('asleep'))).toBe(false)
  })

  it('is its own person: the same colours as its character in the office, so another agent looks different, and a boss wears the crown', () => {
    expect(same(renderFigure(base).data, renderFigure({ ...base, key: 'agent-2' }).data)).toBe(false)
    expect(same(renderFigure(base).data, renderFigure({ ...base, role: 'boss' }).data)).toBe(false)
  })
})

describe('what the figure is doing, from what the agent is doing', () => {
  it('is working while busy, asleep when asleep, and idle otherwise', () => {
    expect(['thinking', 'implementing', 'running', 'researching', 'delegating', 'compacting'].map(figureMood)).toEqual(Array(6).fill('working'))
    expect(figureMood('asleep')).toBe('asleep')
    expect(['idle', 'waiting', 'permission', 'blocked'].map(figureMood)).toEqual(Array(4).fill('idle'))
  })
})
