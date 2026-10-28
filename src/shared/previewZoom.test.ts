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
  const base = 1.2 // the app opens at 120%: that is the page's 100%
  it('steps up and down from where the page is, in fixed steps', () => {
    expect(zoomTo('in', base, base)).toBeCloseTo(1.2 * 1.1)
    expect(zoomTo('out', base, base)).toBeCloseTo(1.2 * 0.9)
    expect(zoomTo('in', 1.2 * 1.1, base)).toBeCloseTo(1.2 * 1.25)
  })
  it('goes to the next step when the page is between two', () => {
    expect(zoomTo('in', 1.2 * 1.05, base)).toBeCloseTo(1.2 * 1.1)
    expect(zoomTo('out', 1.2 * 1.05, base)).toBeCloseTo(1.2)
  })
  it('stops at the smallest and the largest', () => {
    expect(zoomTo('in', 1.2 * 3, base)).toBeCloseTo(1.2 * 3)
    expect(zoomTo('out', 1.2 * 0.25, base)).toBeCloseTo(1.2 * 0.25)
  })
  it('goes back to the app size on reset', () => {
    expect(zoomTo('reset', 1.2 * 2, base)).toBe(base)
  })
})
