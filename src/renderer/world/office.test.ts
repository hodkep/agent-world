import { describe, expect, it } from 'vitest'
import { OFFICE, findPath, parseMap } from './office'

// '#' wall, 'D' desk (blocked), '.' floor
const map = parseMap(['#####', '#..D#', '#.#.#', '#...#', '#####'])

describe('office pathfinding', () => {
  it('walks around obstacles with 4-way steps, excluding the start tile', () => {
    expect(findPath(map, { x: 1, y: 1 }, { x: 3, y: 2 })).toEqual([
      { x: 1, y: 2 },
      { x: 1, y: 3 },
      { x: 2, y: 3 },
      { x: 3, y: 3 },
      { x: 3, y: 2 }
    ])
  })

  it('returns an empty path when already there', () => {
    expect(findPath(map, { x: 1, y: 1 }, { x: 1, y: 1 })).toEqual([])
  })

  it('returns null when the target is unreachable or blocked', () => {
    expect(findPath(map, { x: 1, y: 1 }, { x: 3, y: 1 })).toBeNull()
  })

  it('can end a walk on a seat but never walks across one', () => {
    const lounge = parseMap(['#####', '#.S.#', '#...#', '#####'])
    expect(findPath(lounge, { x: 1, y: 1 }, { x: 2, y: 1 })).toEqual([{ x: 2, y: 1 }])
    expect(findPath(lounge, { x: 1, y: 1 }, { x: 3, y: 1 })).toEqual([
      { x: 1, y: 2 },
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 3, y: 1 }
    ])
  })
})

describe('office layout', () => {
  it('every seat and spot is reachable from the entrance', () => {
    const all = [...OFFICE.desks, ...OFFICE.interns, ...OFFICE.sofas, ...OFFICE.consoles, ...OFFICE.coffee, ...OFFICE.bossHeads, ...Object.values(OFFICE.overflow).flat()]
    for (const s of all) expect(findPath(OFFICE.map, OFFICE.door, s), `${s.x},${s.y}`).not.toBeNull()
  })

  it('has room for 8 seniors and 6 interns', () => {
    expect(OFFICE.desks).toHaveLength(8)
    expect(OFFICE.interns).toHaveLength(6)
  })
})
