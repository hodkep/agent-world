import { describe, expect, it } from 'vitest'
import { treemap } from './treemap'

const area = (r: { w: number; h: number }) => r.w * r.h
const overlap = (a: ReturnType<typeof treemap>[number], b: typeof a) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
const VALUES = [60, 38, 26, 18, 16, 12, 9, 4]

describe('a treemap of sizes, like a market heatmap', () => {
  it('fills the whole box: the tiles add up to its area and none sticks out', () => {
    const t = treemap(VALUES, 600, 260)
    expect(t.reduce((n, r) => n + area(r), 0)).toBeCloseTo(600 * 260, 4)
    for (const r of t) expect([r.x, r.y, r.x + r.w, r.y + r.h].every((v, i) => (i % 2 === 0 ? v >= -1e-9 && v <= 600 + 1e-9 : v >= -1e-9 && v <= 260 + 1e-9))).toBe(true)
  })

  it('gives each tile an area in proportion to its value, in the order given', () => {
    const t = treemap(VALUES, 600, 260)
    const total = VALUES.reduce((a, b) => a + b, 0)
    t.forEach((r, i) => expect(area(r) / (600 * 260)).toBeCloseTo(VALUES[i]! / total, 6))
  })

  it('never lets two tiles overlap, and puts the biggest in the top left corner', () => {
    const t = treemap(VALUES, 600, 260)
    for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) expect(overlap(t[i]!, t[j]!)).toBeCloseTo(0, 6)
    expect(t[0]).toMatchObject({ x: 0, y: 0 })
  })

  it('keeps tiles close to square, so none is a thin strip', () => {
    const t = treemap(VALUES, 600, 260)
    for (const r of t) expect(Math.max(r.w / r.h, r.h / r.w)).toBeLessThan(4)
  })

  it('is empty for nothing to draw, and one whole tile for one value', () => {
    expect(treemap([], 600, 260)).toEqual([])
    expect(treemap([0, 0], 600, 260)).toEqual([])
    expect(treemap([5], 600, 260)).toEqual([{ x: 0, y: 0, w: 600, h: 260 }])
  })
})
