import { describe, expect, it } from 'vitest'
import { DEVICES, fitScale, frameOf, pageScale, sizeOf, viewOf } from './devices'

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
  it('gives the page the size an agent set, in the frame of that kind of screen, and its own size when the agent set none', () => {
    expect(frameOf({ w: 390, h: 844 }, { w: 375, h: 667, label: 'phone' })).toEqual({ size: { w: 375, h: 667 }, kind: 'mobile' })
    expect(frameOf(null, { w: 820, h: 1180, label: 'tablet' })).toEqual({ size: { w: 820, h: 1180 }, kind: 'tablet' })
    expect(frameOf(null, { w: 1440, h: 900, label: 'desktop' })).toEqual({ size: { w: 1440, h: 900 }, kind: 'desktop' })
    expect(frameOf({ w: 390, h: 844 }, null)).toEqual({ size: { w: 390, h: 844 }, kind: null })
    expect(frameOf(null, undefined)).toEqual({ size: null, kind: null })
  })
  it('works out how wide to make a frame from what the page really sees, not from a guess about zoom', () => {
    // the page saw 468 px in a frame that is 468 px wide here: one page pixel is one pixel of the frame, so a 390 px device is a 390 px frame
    expect(pageScale(468, 468, 1.2)).toBe(1)
    // the page saw 390 in a frame 468 wide: the frame must be 1.2 times the device's width
    expect(pageScale(390, 468, 1)).toBeCloseTo(1.2)
    // nothing measured yet (no page, or one that is hidden and has no width): the guess stands
    expect(pageScale(0, 468, 1.2)).toBe(1.2)
    expect(pageScale(468, 0, 1.2)).toBe(1.2)
    expect(pageScale(Number.NaN, 468, 1.2)).toBe(1.2)
  })
})
