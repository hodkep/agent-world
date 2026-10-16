import { describe, expect, it } from 'vitest'
import { createMenuTracker } from './menuTracker'

const menu = { title: 'Select login method', context: 'x', options: ['a', 'b'], hint: '' }

describe('a menu that is on the terminal screen, as the chat is told of it', () => {
  it('is offered only once it has stayed for a moment, and once while it stays', () => {
    let t = 0
    const m = createMenuTracker({ stableMs: 800, now: () => t })
    expect(m.update('a1', menu, false)).toBeNull()
    t = 500
    expect(m.update('a1', menu, false)).toBeNull()
    t = 900
    expect(m.update('a1', menu, false)).toEqual({ send: menu })
    t = 5000
    expect(m.update('a1', menu, false)).toBeNull()
  })

  it('is taken away once, when the screen no longer shows it', () => {
    let t = 0
    const m = createMenuTracker({ stableMs: 800, now: () => t })
    m.update('a1', menu, false)
    t = 1000
    m.update('a1', menu, false)
    expect(m.update('a1', null, false)).toEqual({ clear: true })
    expect(m.update('a1', null, false)).toBeNull()
  })

  it('is left to the card that already handles it (a plan, the trust question)', () => {
    let t = 0
    const m = createMenuTracker({ stableMs: 0, now: () => t })
    expect(m.update('a1', menu, true)).toBeNull()
    t = 100
    expect(m.update('a1', menu, true)).toBeNull()
  })

  it('is offered again when a key was pressed for it and the same menu is still there, so a card that was answered or cancelled to no effect comes back', () => {
    let t = 0
    const m = createMenuTracker({ stableMs: 800, now: () => t })
    m.update('a1', menu, false)
    t = 1000
    expect(m.update('a1', menu, false)).toEqual({ send: menu })
    m.pressed('a1')
    t = 1100
    expect(m.update('a1', menu, false)).toBeNull()
    t = 2000
    expect(m.update('a1', menu, false)).toEqual({ send: menu })
  })

  it('is still taken away when the screen moves on after a key was pressed for it: the card that was out must not stay', () => {
    let t = 0
    const m = createMenuTracker({ stableMs: 800, now: () => t })
    m.update('a1', menu, false)
    t = 1000
    expect(m.update('a1', menu, false)).toEqual({ send: menu })
    m.pressed('a1')
    t = 1100
    expect(m.update('a1', menu, false)).toBeNull()
    expect(m.update('a1', null, false)).toEqual({ clear: true })
    expect(m.update('a1', null, false)).toBeNull()
  })

  it('is a different menu when its words differ, and is offered after its own moment', () => {
    let t = 0
    const m = createMenuTracker({ stableMs: 800, now: () => t })
    m.update('a1', menu, false)
    t = 1000
    m.update('a1', menu, false)
    const next = { ...menu, title: 'Security notes' }
    t = 1100
    expect(m.update('a1', next, false)).toBeNull()
    t = 2000
    expect(m.update('a1', next, false)).toEqual({ send: next })
  })

  it('keeps each agent apart, and forgets everything on request', () => {
    let t = 0
    const m = createMenuTracker({ stableMs: 100, now: () => t })
    m.update('a1', menu, false)
    t = 200
    expect(m.update('a1', menu, false)).toEqual({ send: menu })
    expect(m.update('a2', menu, false)).toBeNull()
    m.forgetAll()
    t = 400
    expect(m.update('a1', menu, false)).toBeNull()
  })
})
