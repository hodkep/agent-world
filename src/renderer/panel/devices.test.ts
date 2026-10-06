import { describe, expect, it } from 'vitest'
import { DEVICES, fitScale, sizeOf, viewOf } from './devices'

describe('screen sizes for the preview', () => {
  it('starts as desktop, and tablet and mobile offer a few well-known devices, the first being the default', () => {
    expect(Object.keys(DEVICES)).toEqual(['desktop', 'tablet', 'mobile'])
    expect(DEVICES.desktop.presets).toEqual([])
    expect(DEVICES.mobile.presets[0]).toMatchObject({ name: 'iPhone 14', w: 390, h: 844 })
    expect(DEVICES.tablet.presets[0]).toMatchObject({ w: 820, h: 1180 })
  })
  it('reads a device at its size, turned on its side when rotated', () => {
    expect(sizeOf('mobile', 'iPhone SE', false)).toEqual({ w: 375, h: 667 })
    expect(sizeOf('mobile', 'iPhone SE', true)).toEqual({ w: 667, h: 375 })
    expect(sizeOf('mobile', 'no such phone', false)).toEqual({ w: 390, h: 844 })
    expect(sizeOf('desktop', '', true)).toBeNull()
  })
  it('scales a device down to the room it has, never up', () => {
    expect(fitScale(390, 844, 520, 400)).toBeCloseTo((400 - 24) / 844)
    expect(fitScale(390, 844, 2000, 2000)).toBe(1)
    expect(fitScale(820, 1180, 400, 2000)).toBeCloseTo((400 - 24) / 820)
  })
  it('names the view a page was seen in, for the message to the agent', () => {
    expect(viewOf('mobile', { w: 390, h: 844 })).toEqual({ label: 'Mobile', w: 390, h: 844 })
    expect(viewOf('desktop', { w: 1280, h: 800 })).toEqual({ label: 'Desktop', w: 1280, h: 800 })
  })
})
