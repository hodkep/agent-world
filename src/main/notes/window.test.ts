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
