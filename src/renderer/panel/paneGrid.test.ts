import { describe, expect, it } from 'vitest'
import { fill, place, resize, swap, type GridLayout } from './PaneGrid'

const two: GridLayout = { cols: 2, rows: 1, cells: ['a', 'b'] }

describe('pane grid layout', () => {
  it('keeps each agent in its cell when the grid grows', () => {
    expect(resize(two, 2, 2).cells).toEqual(['a', 'b', null, null])
    expect(resize({ cols: 2, rows: 2, cells: ['a', 'b', 'c', 'd'] }, 3, 2).cells).toEqual(['a', 'b', null, 'c', 'd', null])
  })
  it('drops the agents that no longer fit when it shrinks', () => {
    expect(resize({ cols: 2, rows: 2, cells: ['a', 'b', 'c', 'd'] }, 2, 1).cells).toEqual(['a', 'b'])
  })
  it('puts an agent in a cell, swapping with where it was so it is never shown twice', () => {
    expect(place(two, 0, 'b').cells).toEqual(['b', 'a'])
    expect(place({ cols: 2, rows: 1, cells: ['a', null] }, 1, 'c').cells).toEqual(['a', 'c'])
    expect(place({ cols: 2, rows: 1, cells: ['a', null] }, 1, 'a').cells).toEqual([null, 'a'])
  })
  it('swaps two cells', () => {
    expect(swap(two, 0, 1).cells).toEqual(['b', 'a'])
  })
  it('fills empty cells with agents not shown yet, in order', () => {
    expect(fill({ cols: 2, rows: 2, cells: ['b', null, null, null] }, ['a', 'b', 'c', 'd', 'e']).cells).toEqual(['b', 'a', 'c', 'd'])
  })
})
