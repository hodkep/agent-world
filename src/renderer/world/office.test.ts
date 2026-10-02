import { describe, expect, it } from 'vitest'
import { OFFICE, RETINUE_SEATS, findPath, parseMap, retinueSpot } from './office'

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
    const all = [...OFFICE.desks, ...OFFICE.interns, ...OFFICE.sofas, ...OFFICE.whiteboard, ...Object.values(OFFICE.overflow).flat()]
    for (const s of all) expect(findPath(OFFICE.map, OFFICE.door, s), `${s.x},${s.y}`).not.toBeNull()
  })

  it('has room for 8 seniors, 6 interns and 11 resting agents', () => {
    expect(OFFICE.desks).toHaveLength(8)
    expect(OFFICE.interns).toHaveLength(6)
    expect(OFFICE.sofas).toHaveLength(11)
  })

  it('has no server room any more', () => {
    expect(OFFICE.rows.join('')).not.toContain('g')
  })
})

describe('subagents gathered around their main agent', () => {
  const tile = (s: { x: number; y: number }) => `${s.x},${s.y}`
  const all = OFFICE.desks.flatMap((d) => Array.from({ length: RETINUE_SEATS }, (_, i) => retinueSpot(d, i)!))

  it('has a seat for each of the first six, and none after that', () => {
    expect(retinueSpot(OFFICE.desks[0]!, RETINUE_SEATS - 1)).toBeTruthy()
    expect(retinueSpot(OFFICE.desks[0]!, RETINUE_SEATS)).toBeNull()
  })

  it('sits them on open floor, never on furniture, a desk chair or another group', () => {
    const chairs = new Set(OFFICE.desks.map(tile))
    for (const s of all) expect(OFFICE.map.walkable(s), tile(s)).toBe(true)
    expect(new Set(all.map(tile)).size).toBe(all.length)
    for (const s of all) expect(chairs.has(tile(s)), tile(s)).toBe(false)
  })

  it('puts every seat beside the main agent, at the sides of the desk, or across the desk from them', () => {
    for (const d of OFFICE.desks)
      for (let i = 0; i < RETINUE_SEATS; i++) {
        const s = retinueSpot(d, i)!
        expect(s.seated).toBe(true)
        // The agent sits across tiles d.x and d.x+1 at the chair row d.y; the desk is the row above it.
        const beside = s.y === d.y || s.y === d.y - 1
        const across = s.y === d.y - 2 && (s.x === d.x || s.x === d.x + 1)
        expect(beside || across, tile(s)).toBe(true)
        if (beside) expect(s.x === d.x - 1 || s.x === d.x + 2, tile(s)).toBe(true)
      }
  })

  it('has every one of them facing the main agent', () => {
    for (const d of OFFICE.desks)
      for (let i = 0; i < RETINUE_SEATS; i++) {
        const s = retinueSpot(d, i)!
        if (s.y === d.y - 2) expect(s.facing).toBe('down')
        else expect(s.facing).toBe(s.x < d.x ? 'right' : 'left')
      }
  })
})
