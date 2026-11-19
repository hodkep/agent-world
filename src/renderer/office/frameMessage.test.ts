import { describe, expect, it } from 'vitest'
import { gridOf, parseFrameMessage } from './frameMessage'

describe('what the viewer frame may tell the app', () => {
  it('accepts the shapes it sends', () => {
    expect(parseFrameMessage({ t: 'ready' })).toEqual({ t: 'ready' })
    expect(parseFrameMessage({ t: 'selection', on: true })).toEqual({ t: 'selection', on: true })
    const key = { t: 'key', key: 'L', code: 'KeyL', meta: true, ctrl: false, shift: true, alt: false }
    expect(parseFrameMessage(key)).toEqual(key)
    expect(parseFrameMessage({ t: 'words', text: 'hi', where: 'slide 2' })).toEqual({ t: 'words', text: 'hi', where: 'slide 2' })
    expect(parseFrameMessage({ t: 'found', count: 2, index: 1 })).toEqual({ t: 'found', count: 2, index: 1 })
    expect(parseFrameMessage({ t: 'error', message: 'bad file' })).toEqual({ t: 'error', message: 'bad file' })
    const cells = { t: 'cells', sheet: 'S', r1: 1, c1: 1, r2: 2, c2: 2, header: ['a', 'b'], rows: [['1', '2'], ['3', '4']] }
    expect(parseFrameMessage(cells)).toEqual(cells)
  })

  it('rejects anything else', () => {
    for (const bad of [null, 'x', 5, [], {}, { t: 'run' }, { t: 'words' }, { t: 'words', text: 5 }, { t: 'selection', on: 'yes' }, { t: 'key', key: 'L' }, { t: 'key', key: 'x'.repeat(21), code: 'KeyL', meta: true, ctrl: false, shift: true, alt: false }, { t: 'found', count: -1, index: 0 }, { t: 'found', count: 1.5, index: 0 }, { t: 'error' }]) expect(parseFrameMessage(bad)).toBeNull()
  })

  it('rejects text, cells or names that are too big, and cell ranges that do not make sense', () => {
    expect(parseFrameMessage({ t: 'words', text: 'x'.repeat(50_001) })).toBeNull()
    expect(parseFrameMessage({ t: 'words', text: 'x', where: 'y'.repeat(61) })).toBeNull()
    const ok = { t: 'cells', sheet: 'S', r1: 0, c1: 0, r2: 0, c2: 0, header: ['a'], rows: [['1']] }
    expect(parseFrameMessage({ ...ok, sheet: 's'.repeat(129) })).toBeNull()
    expect(parseFrameMessage({ ...ok, r1: -1 })).toBeNull()
    expect(parseFrameMessage({ ...ok, r2: 2_000_000 })).toBeNull()
    expect(parseFrameMessage({ ...ok, rows: [[5]] })).toBeNull()
    expect(parseFrameMessage({ ...ok, rows: Array.from({ length: 601 }, () => ['x']) })).toBeNull()
    expect(parseFrameMessage({ ...ok, rows: [['x'.repeat(2001)]] })).toBeNull()
  })

  it('puts the frame cells back where they sit in the sheet', () => {
    const m = parseFrameMessage({ t: 'cells', sheet: 'S', r1: 2, c1: 1, r2: 3, c2: 2, header: ['H1', 'H2'], rows: [['a', 'b'], ['c', 'd']] })
    if (m?.t !== 'cells') throw new Error('not cells')
    const g = gridOf(m)
    expect([g[0]![1], g[0]![2], g[2]![1], g[3]![2]]).toEqual(['H1', 'H2', 'a', 'd'])
  })
})
