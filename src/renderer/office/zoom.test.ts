import { describe, expect, it } from 'vitest'
import { zoomStep } from './zoom'

describe('the viewer zoom', () => {
  it('goes up and down the scale from 100%', () => {
    expect(zoomStep(1, 1)).toBe(1.25)
    expect(zoomStep(1.25, 1)).toBe(1.5)
    expect(zoomStep(1, -1)).toBe(0.75)
    expect(zoomStep(0.75, -1)).toBe(0.5)
  })
  it('stops at both ends', () => {
    expect(zoomStep(3, 1)).toBe(3)
    expect(zoomStep(0.5, -1)).toBe(0.5)
  })
  it('takes the next mark in that direction when the level sits between two', () => {
    expect(zoomStep(1.1, 1)).toBe(1.25)
    expect(zoomStep(1.1, -1)).toBe(1)
  })
})
