import { describe, expect, it } from 'vitest'
import { GLYPHS } from '../src/renderer/world/pixelfont'
// @ts-expect-error a plain .mjs script
import { crewChars } from '../scripts/build-site.mjs'
// @ts-expect-error a plain browser script, copied to the site as it is
import { CREW, actionFor, armPixels, castFor, nearestPart, nextPart, scene, SCENES, tankLevel, windowRects } from './office.js'

const chars = crewChars()
const bits = { GLYPHS, CHARS: chars }
const count = (px: (string | null)[][], c: string) => px.flat().filter((p) => p === c).length

describe('the pixel scenes of the site', () => {
  it('lights the facade window by window as the page loads, an agent at a desk in each, and holds the finished picture after', () => {
    const lit = (t: number) => count(scene('facade', bits, t).px, '#d9d5c8') // the CRT shells, one per lit window
    expect(lit(0)).toBe(0)
    expect(lit(600)).toBeGreaterThan(0)
    expect(lit(3000)).toBeGreaterThan(lit(600))
    expect(lit(62_000)).toBe(lit(10_000_000))
  })

  it('shows the five states in the lit windows: a red mark for the agent waiting for you, grey z for the asleep one, green code for the running one, and the agents are the app\'s own characters', () => {
    const { px } = scene('facade', bits, 62_000)
    expect(count(px, chars.ada.own.pal.c)).toBeGreaterThan(0) // ada's hoodie
    expect(count(px, '#d83a3a')).toBeGreaterThan(0)
    expect(count(px, '#5f9e5f')).toBeGreaterThan(0)
    expect(count(px, '#a4a2b8')).toBeGreaterThan(0)
  })

  it('keeps the office alive in small steps: a frame differs from the one a beat later, and every scene has a size', () => {
    for (const name of SCENES) {
      const a = scene(name, bits, 60_000)
      expect(a.w, name).toBeGreaterThan(0)
      expect(a.px.length, name).toBe(a.h)
      expect(a.px, name).not.toEqual(scene(name, bits, 60_000 + 700).px)
    }
  })
})

describe('the crew that builds the page', () => {
  const parts = [{ y: 100, kind: 'text' }, { y: 400, kind: 'box' }, { y: 900, kind: 'pic' }, { y: 2000, kind: 'scene' }]

  it('hands out the parts in page order, only those within reach, and never one twice', () => {
    const taken = new Set<number>()
    expect(nextPart(parts, 1000, taken)).toBe(0)
    taken.add(0)
    expect(nextPart(parts, 1000, taken)).toBe(1)
    taken.add(1).add(2)
    expect(nextPart(parts, 1000, taken)).toBe(-1) // the scene at 2000 is out of reach
    expect(nextPart(parts, 2500, taken)).toBe(3)
  })

  it('gives every kind of part its own work: text is typed, a box hammered, a picture hung, a scene painted', () => {
    expect(['text', 'box', 'pic', 'scene'].map(actionFor)).toEqual(['type', 'hammer', 'hang', 'paint'])
    expect(CREW).toHaveLength(6)
  })
})

describe('the engineers at work', () => {
  it('moves its arms with the work: typing elbows, the hammer up and down, the brush stroking, each frame unlike the last', () => {
    for (const kind of ['type', 'hammer', 'brush', 'wave']) {
      expect(armPixels(kind, 0).length, kind).toBeGreaterThan(0)
      expect(armPixels(kind, 0), kind).not.toEqual(armPixels(kind, 1))
    }
    expect(armPixels('none', 0)).toEqual([])
  })

  it('leaves an engineer alone on a section as itself, and makes the next one its intern (the first then wears the crown), as the office does', () => {
    expect(castFor([], 'a')).toBe('senior')
    expect(castFor([{ section: 'a', name: 'ada' }], 'a')).toBe('intern')
    expect(castFor([{ section: 'b', name: 'ada' }], 'a')).toBe('senior')
  })
})

describe('the scene around the build', () => {
  it('places a hit area over each of the five windows, scaled with the facade as drawn on the page', () => {
    const r = windowRects({ x: 100, y: 200, w: 1200, h: 600 })
    expect(r).toHaveLength(5)
    expect(r[0]).toEqual({ x: 100 + 62 * 5, y: 200 + 36 * 5, w: 150, h: 170, name: 'ada', state: 'idle' })
    expect(r[4]!.state).toBe('asleep')
  })

  it('finds the part nearest to a clicked engineer', () => {
    const parts = [{ x: 0, y: 0, w: 100, h: 20 }, { x: 500, y: 300, w: 100, h: 20 }, { x: 900, y: 900, w: 10, h: 10 }]
    expect(nearestPart(parts, 520, 340)).toBe(1)
    expect(nearestPart(parts, 10, 10)).toBe(0)
  })

  it('fills the tanks as the page builds: brass at first, amber past half, red near the end, as the office does', () => {
    expect(tankLevel(0, 10)).toEqual({ level: 0, tone: '#f2c230' })
    expect(tankLevel(6, 10).tone).toBe('#e0a030')
    expect(tankLevel(9, 10)).toEqual({ level: 0.9, tone: '#d83a3a' })
  })

  it('draws the facade with the door open and the tanks filled when asked, unlike at rest', () => {
    const rest = scene('facade', bits, 62_000).px, open = scene('facade', bits, 62_000, { door: 'open', tanks: 0.9 }).px
    expect(open).not.toEqual(rest)
    expect(count(open, '#d83a3a')).toBeGreaterThan(count(rest, '#d83a3a'))
  })
})
