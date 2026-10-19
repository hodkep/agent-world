import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHoverMenu } from './hoverMenu'

let seen: { open: boolean; pinned: boolean }[]
const make = () => createHoverMenu({ onChange: (s) => seen.push(s) })
const now = () => seen.at(-1) ?? { open: false, pinned: false }

beforeEach(() => {
  vi.useFakeTimers()
  seen = []
})
afterEach(() => vi.useRealTimers())

describe('a menu that opens on hover and stays on a click', () => {
  it('opens when the pointer has rested on it for a moment, not on a pass over it', () => {
    const m = make()
    m.enter()
    vi.advanceTimersByTime(100)
    expect(now().open).toBe(false)
    m.leave()
    vi.advanceTimersByTime(1000)
    expect(now().open).toBe(false)
    m.enter()
    vi.advanceTimersByTime(160)
    expect(now()).toEqual({ open: true, pinned: false })
  })
  it('closes a moment after the pointer leaves, and not if it comes back (the gap between the button and the panel)', () => {
    const m = make()
    m.enter()
    vi.advanceTimersByTime(200)
    m.leave()
    vi.advanceTimersByTime(200)
    expect(now().open).toBe(true)
    m.enter()
    vi.advanceTimersByTime(1000)
    expect(now().open).toBe(true)
    m.leave()
    vi.advanceTimersByTime(350)
    expect(now().open).toBe(false)
  })
  it('a click opens it and keeps it open when the pointer leaves, until a click elsewhere or Esc', () => {
    const m = make()
    m.click()
    expect(now()).toEqual({ open: true, pinned: true })
    m.leave()
    vi.advanceTimersByTime(2000)
    expect(now().open).toBe(true)
    m.away()
    expect(now()).toEqual({ open: false, pinned: false })
    m.click()
    m.esc()
    expect(now().open).toBe(false)
  })
  it('a click on the button while it is open only from hovering keeps it open (never closes what hovering just opened)', () => {
    const m = make()
    m.enter()
    vi.advanceTimersByTime(200)
    m.click()
    expect(now()).toEqual({ open: true, pinned: true })
    m.click()
    expect(now().open).toBe(false)
  })
  it('closes when something is chosen, and a pending open is forgotten', () => {
    const m = make()
    m.click()
    m.chosen()
    expect(now().open).toBe(false)
    m.enter()
    m.chosen()
    vi.advanceTimersByTime(1000)
    expect(now().open).toBe(false)
  })
  it('does nothing more after it is disposed', () => {
    const m = make()
    m.enter()
    m.dispose()
    vi.advanceTimersByTime(1000)
    expect(seen).toEqual([])
  })
})
