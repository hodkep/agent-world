import { describe, expect, it } from 'vitest'
import { zoomKey, zoomTo } from './previewZoom'

const key = (k: string, o: object = {}) => ({ type: 'keyDown', key: k, meta: false, control: false, alt: false, ...o })

describe('which key press zooms the page', () => {
  it('on a Mac is Command with +, = , - or 0, and reads Shift+= as +', () => {
    expect(zoomKey(key('=', { meta: true }), true)).toBe('in')
    expect(zoomKey(key('+', { meta: true }), true)).toBe('in')
    expect(zoomKey(key('-', { meta: true }), true)).toBe('out')
    expect(zoomKey(key('_', { meta: true }), true)).toBe('out')
    expect(zoomKey(key('0', { meta: true }), true)).toBe('reset')
  })
  it('elsewhere is Control, and the other modifier alone is not it', () => {
    expect(zoomKey(key('=', { control: true }), false)).toBe('in')
    expect(zoomKey(key('=', { meta: true }), false)).toBeNull()
    expect(zoomKey(key('=', { control: true }), true)).toBeNull()
  })
  it('is not a key release, a plain key, or a chord with Alt', () => {
    expect(zoomKey({ ...key('=', { meta: true }), type: 'keyUp' }, true)).toBeNull()
    expect(zoomKey(key('='), true)).toBeNull()
    expect(zoomKey(key('=', { meta: true, alt: true }), true)).toBeNull()
    expect(zoomKey(key('a', { meta: true }), true)).toBeNull()
  })
})

describe('the zoom a key goes to', () => {
  // A page's 100% is the browser's own, whatever the app's zoom (the app opens at 120%).
  it('steps up and down from where the page is, in fixed steps from 100%', () => {
    expect(zoomTo('in', 1)).toBeCloseTo(1.1)
    expect(zoomTo('out', 1)).toBeCloseTo(0.9)
    expect(zoomTo('in', 1.1)).toBeCloseTo(1.25)
  })
  it('goes to the next step when the page is between two', () => {
    expect(zoomTo('in', 1.05)).toBeCloseTo(1.1)
    expect(zoomTo('out', 1.05)).toBeCloseTo(1)
  })
  it('stops at the smallest and the largest', () => {
    expect(zoomTo('in', 3)).toBeCloseTo(3)
    expect(zoomTo('out', 0.25)).toBeCloseTo(0.25)
  })
  it('goes back to 100% on reset, not to the app’s 120%', () => {
    expect(zoomTo('reset', 2)).toBe(1)
    expect(zoomTo('reset', 1.2)).toBe(1)
  })
})
