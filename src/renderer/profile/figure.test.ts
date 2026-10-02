import { describe, expect, it } from 'vitest'
import { characterPixels, paletteFor } from '../world/sprites'
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

describe('the portrait is the character you see in the office', () => {
  const at = (d: Uint8ClampedArray, x: number, y: number) => [d[(y * FIGURE_W + x) * 4], d[(y * FIGURE_W + x) * 4 + 1], d[(y * FIGURE_W + x) * 4 + 2]]
  const rgb = (n: number) => [(n >> 16) & 255, (n >> 8) & 255, n & 255]

  it.each([['agent-1', 'senior'], ['agent-2', 'senior'], ['boss-1', 'boss'], ['intern-1', 'intern']] as const)('%s (%s): same hair, skin and clothes as its sprite, cell for cell', (key, role) => {
    const sprite = characterPixels(key, role, 'front', 'stand')
    const pal = paletteFor(key, role)
    const f = renderFigure({ key, role, mood: 'idle', t: 0, reduced: true })
    for (const [code, color] of [['h', pal.h], ['s', pal.s], ['c', pal.c]] as const) {
      // A cell of this kind away from the face (which gets a smile and cheeks) and the waving hand.
      const y = sprite.findIndex((row, yy) => yy <= 6 || yy >= 12 ? [...row].some((c, x) => c === code && x < 11) : false)
      const x = [...sprite[y]!].findIndex((c, xx) => c === code && xx < 11)
      expect(at(f.data, x, y), `${code} at ${x},${y}`).toEqual(rgb(color))
    }
  })
})

describe('what the figure is doing, from what the agent is doing', () => {
  it('is working while busy, asleep when asleep, and idle otherwise', () => {
    expect(['thinking', 'implementing', 'running', 'researching', 'delegating', 'compacting'].map(figureMood)).toEqual(Array(6).fill('working'))
    expect(figureMood('asleep')).toBe('asleep')
    expect(['idle', 'waiting', 'permission', 'blocked'].map(figureMood)).toEqual(Array(4).fill('idle'))
  })
})
