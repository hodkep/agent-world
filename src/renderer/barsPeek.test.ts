import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPeek } from './barsPeek'

describe('when the hidden top bars slide down, and when they go back', () => {
  const set = vi.fn()
  beforeEach(() => {
    vi.useFakeTimers()
    set.mockClear()
  })
  afterEach(() => vi.useRealTimers())

  it('opens once the pointer has rested on the top edge, not the moment it touches it', () => {
    const p = createPeek({ set, openMs: 150, closeMs: 350 })
    p.point(true)
    vi.advanceTimersByTime(149)
    expect(set).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(set).toHaveBeenCalledWith(true)
  })

  it('does not open for a pass over the edge on the way to somewhere else', () => {
    const p = createPeek({ set, openMs: 150, closeMs: 350 })
    p.point(true)
    vi.advanceTimersByTime(80)
    p.point(false)
    vi.advanceTimersByTime(1000)
    expect(set).not.toHaveBeenCalled()
  })

  it('opens even when the pointer keeps moving on the edge: each move is not a new wait', () => {
    const p = createPeek({ set, openMs: 150, closeMs: 350 })
    for (let t = 0; t < 200; t += 20) {
      p.point(true)
      vi.advanceTimersByTime(20)
    }
    expect(set).toHaveBeenCalledWith(true)
  })

  it('goes back a little after the pointer leaves the bars, and stays if it comes back in time', () => {
    const p = createPeek({ set, openMs: 0, closeMs: 350 })
    p.point(true)
    vi.advanceTimersByTime(1)
    set.mockClear()
    p.point(false)
    vi.advanceTimersByTime(300)
    p.point(true)
    vi.advanceTimersByTime(1000)
    expect(set).not.toHaveBeenCalled()
    p.point(false)
    vi.advanceTimersByTime(350)
    expect(set).toHaveBeenCalledWith(false)
  })

  it('closes at once on reset, and a late timer does nothing', () => {
    const p = createPeek({ set, openMs: 150, closeMs: 350 })
    p.point(true)
    p.reset()
    expect(set).toHaveBeenLastCalledWith(false)
    set.mockClear()
    vi.advanceTimersByTime(1000)
    expect(set).not.toHaveBeenCalled()
  })
})
