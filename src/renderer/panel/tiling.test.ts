import { describe, expect, it } from 'vitest'
import { add, addAll, collapse, even, keepOnly, mapTiles, place, readLayout, rectsOf, remove, resizeAt, splitsOf, tilesOf, type Node } from './tiling'

const rect = (n: Node | null, tile: string) => rectsOf(n).find((r) => r.tile === tile)!.rect
const area = (n: Node | null) => rectsOf(n).reduce((sum, r) => sum + r.rect.w * r.rect.h, 0)

describe('an even layout', () => {
  it('shares the space equally, whatever the count', () => {
    for (let n = 1; n <= 9; n++) {
      const tiles = Array.from({ length: n }, (_, i) => `t${i}`)
      const tree = even(tiles)
      expect(tilesOf(tree)).toEqual(tiles)
      expect(area(tree)).toBeCloseTo(1)
      const sizes = rectsOf(tree).map((r) => r.rect.w * r.rect.h)
      if (n === 2 || n === 4 || n === 6 || n === 9) expect(Math.max(...sizes) - Math.min(...sizes)).toBeCloseTo(0)
    }
    expect(even([])).toBeNull()
  })
})

describe('placing tiles', () => {
  const two = even(['a', 'b'])

  it('puts a tile on the edge of another: below it takes half of its space', () => {
    const t = place(two, 'c', 'a', 'bottom')
    expect(rect(t, 'a')).toEqual({ x: 0, y: 0, w: 0.5, h: 0.5 })
    expect(rect(t, 'c')).toEqual({ x: 0, y: 0.5, w: 0.5, h: 0.5 })
    expect(rect(t, 'b')).toEqual({ x: 0.5, y: 0, w: 0.5, h: 1 })
  })

  it('moves a tile that is already there, so it is never shown twice and nothing is left empty', () => {
    const t = place(even(['a', 'b', 'c']), 'c', 'a', 'left')
    expect(tilesOf(t).sort()).toEqual(['a', 'b', 'c'])
    expect(area(t)).toBeCloseTo(1)
    expect(rect(t, 'c').x).toBe(0)
  })

  it('swaps two tiles dropped on each other\'s middle', () => {
    const t = place(two, 'a', 'b', 'center')
    expect(rect(t, 'a').x).toBe(0.5)
    expect(rect(t, 'b').x).toBe(0)
  })

  it('a terminal dropped at the bottom-left of a pair takes a quarter there', () => {
    const t = place(two, 'term:1', 'a', 'bottom')
    expect(rect(t, 'term:1')).toEqual({ x: 0, y: 0.5, w: 0.5, h: 0.5 })
  })

  it('dropping a tile on itself changes nothing', () => {
    expect(place(two, 'a', 'a', 'left')).toBe(two)
  })
})

describe('adding a tile without saying where', () => {
  it('starts the grid', () => {
    expect(add(null, 'a')).toEqual({ kind: 'leaf', tile: 'a' })
  })

  it('splits the biggest tile along its longer side', () => {
    const t = add(even(['a', 'b']), 'c')
    expect(tilesOf(t)).toHaveLength(3)
    expect(area(t)).toBeCloseTo(1)
  })

  it('puts a terminal along the bottom, full width', () => {
    const t = add(even(['a', 'b']), 'term:1')
    expect(rect(t, 'term:1').x).toBe(0)
    expect(rect(t, 'term:1').w).toBe(1)
    expect(rect(t, 'term:1').y).toBeGreaterThan(0.5)
    expect(rect(t, 'a').w).toBeCloseTo(0.5)
  })

  it('adds everything missing, once', () => {
    expect(tilesOf(addAll(add(null, 'b'), ['a', 'b', 'c'])).sort()).toEqual(['a', 'b', 'c'])
  })
})

describe('taking tiles out and resizing', () => {
  it('lets the neighbour take the space', () => {
    const t = remove(even(['a', 'b', 'c']), 'b')
    expect(tilesOf(t).sort()).toEqual(['a', 'c'])
    expect(area(t)).toBeCloseTo(1)
    expect(remove(add(null, 'a'), 'a')).toBeNull()
  })

  it('keeps only what passes the test', () => {
    expect(tilesOf(keepOnly(even(['a', 'b', 'c']), (t) => t !== 'b'))).toEqual(['a', 'c'])
  })

  it('moves a gutter, resizing both sides, and keeps it clear of the edges', () => {
    const t = resizeAt(even(['a', 'b']), [], 0.3)
    expect(rect(t, 'a').w).toBeCloseTo(0.3)
    expect(rect(t, 'b').w).toBeCloseTo(0.7)
    expect(rect(resizeAt(t, [], 0.01), 'a').w).toBeGreaterThanOrEqual(0.12)
    expect(rect(resizeAt(t, [], 5), 'b').w).toBeGreaterThanOrEqual(0.12)
  })

  it('has one gutter fewer than tiles, each reachable by its path', () => {
    for (const n of [2, 3, 4, 7]) {
      const t = even(Array.from({ length: n }, (_, i) => `t${i}`))
      const gutters = splitsOf(t)
      expect(gutters).toHaveLength(n - 1)
      for (const g of gutters) expect(rect(resizeAt(t, g.path, 0.3), 't0')).toBeDefined()
    }
  })
})

describe('saved layouts', () => {
  it('round-trips the current shape', () => {
    const t = even(['a', 'b', 'c'])
    expect(readLayout(JSON.parse(JSON.stringify({ root: t })))).toEqual({ root: t })
    expect(readLayout({ root: null })).toEqual({ root: null })
  })

  it('reads the older list and grid shapes', () => {
    expect(tilesOf(readLayout({ panes: ['a', 'b', 'a'] })!.root)).toEqual(['a', 'b'])
    expect(tilesOf(readLayout({ cols: 2, rows: 1, cells: ['a', null] })!.root)).toEqual(['a'])
  })

  it('refuses anything else, and a tile shown twice is kept once', () => {
    expect(readLayout('x')).toBeNull()
    expect(readLayout({ root: { kind: 'split' } })).toBeNull()
    const dup = { root: { kind: 'split', dir: 'row', at: 0.5, a: { kind: 'leaf', tile: 'a' }, b: { kind: 'leaf', tile: 'a' } } }
    expect(tilesOf(readLayout(dup)!.root)).toEqual(['a'])
  })
})

describe('hiding a tile for a while without touching the layout', () => {
  const two = even(['a', 'b'])
  const four = even(['a', 'b', 'c', 'd'])

  it('gives the space of the hidden tile to its neighbour, and leaves the others where they are', () => {
    const shown = collapse(two, 'b')
    expect(rect(shown, 'a')).toEqual({ x: 0, y: 0, w: 1, h: 1 })
    expect(rect(shown, 'b').w).toBe(0)
    const grid = collapse(four, 'a')
    expect(rect(grid, 'b')).toEqual({ x: 0, y: 0, w: 1, h: 0.5 })
    expect(rect(grid, 'c')).toEqual(rect(four, 'c'))
    expect(rect(grid, 'd')).toEqual(rect(four, 'd'))
  })

  it('keeps every tile in the tree and every split where it was, so edits made meanwhile apply to the real layout', () => {
    const shown = collapse(four, 'c')
    expect(tilesOf(shown)).toEqual(tilesOf(four))
    expect(splitsOf(shown).map((s) => s.path)).toEqual(splitsOf(four).map((s) => s.path))
  })

  it('changes nothing for a tile that is not in the layout, or when nothing is hidden', () => {
    expect(collapse(four, null)).toBe(four)
    expect(collapse(four, 'zzz')).toBe(four)
    expect(collapse(null, 'a')).toBeNull()
  })

  it('does not alter the layout it was given, so showing the tile again puts it back exactly', () => {
    const before = JSON.stringify(four)
    collapse(four, 'b')
    expect(JSON.stringify(four)).toBe(before)
    expect(rect(four, 'b')).toEqual({ x: 0.5, y: 0, w: 0.5, h: 0.5 })
  })
})

describe('mapTiles', () => {
  it('swaps tile ids and keeps the shape of the tiling', () => {
    const root = place(even(['a1', 'term:old']), 'a2', 'a1', 'bottom')
    expect(tilesOf(mapTiles(root, (t) => (t === 'term:old' ? 'term:new' : t)))).toEqual(tilesOf(root).map((t) => (t === 'term:old' ? 'term:new' : t)))
    expect(mapTiles(root, (t) => t)).toEqual(root)
    expect(mapTiles(null, (t) => t)).toBeNull()
  })
})
