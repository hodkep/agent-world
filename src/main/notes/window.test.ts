import { describe, expect, it } from 'vitest'


describe('where the notes window goes', () => {
  it('is put back where it was when that is on a screen, and at the right edge of the first screen when it is not', async () => {
    const { placeFor } = await import('./window')
    const screens = [{ x: 0, y: 0, width: 1440, height: 900 }]
    expect(placeFor({ x: 100, y: 120, width: 400, height: 500 }, screens)).toEqual({ x: 100, y: 120, width: 400, height: 500 })
    expect(placeFor({ x: 5000, y: 120 }, screens)).toEqual({ x: 1440 - 380 - 40, y: 80, width: 380, height: 560 })
    expect(placeFor(undefined, screens)).toEqual({ x: 1020, y: 80, width: 380, height: 560 })
  })
  it('is never smaller than it can work at', async () => {
    const { placeFor } = await import('./window')
    expect(placeFor({ x: 0, y: 0, width: 10, height: 10 }, [{ x: 0, y: 0, width: 1440, height: 900 }])).toMatchObject({ width: 280, height: 220 })
  })
})

describe('making room beside the notes window for a panel', () => {
  const area = { x: 0, y: 0, width: 1440, height: 900 }
  it('grows it to the right when there is room, and to the left when there is not, and gives back the same bounds', async () => {
    const { growBounds, shrinkBounds } = await import('./window')
    const mid = { x: 100, y: 80, width: 380, height: 560 }
    expect(growBounds(mid, area, 300)).toEqual({ side: 'right', bounds: { x: 100, y: 80, width: 680, height: 560 } })
    const edge = { x: 1020, y: 80, width: 380, height: 560 }
    const g = growBounds(edge, area, 300)
    expect(g).toEqual({ side: 'left', bounds: { x: 720, y: 80, width: 680, height: 560 } })
    expect(shrinkBounds(g.bounds, 'left', 300)).toEqual(edge)
    expect(shrinkBounds(growBounds(mid, area, 300).bounds, 'right', 300)).toEqual(mid)
  })
  it('does not go off the screen on the left either', async () => {
    const { growBounds } = await import('./window')
    expect(growBounds({ x: 20, y: 0, width: 1400, height: 500 }, area, 300).bounds.x).toBeGreaterThanOrEqual(0)
  })
})

