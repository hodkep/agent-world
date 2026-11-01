import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startClock } from './clock'

describe('a once-a-second clock that rests while the window is away', () => {
  let away = false
  let back: () => void = () => {}
  const env = { away: () => away, onReturn: (cb: () => void) => ((back = cb), () => (back = () => {})) }

  beforeEach(() => {
    vi.useFakeTimers()
    away = false
  })
  afterEach(() => vi.useRealTimers())

  it('ticks every second while the window is in use', () => {
    const tick = vi.fn()
    startClock(tick, env)
    vi.advanceTimersByTime(3000)
    expect(tick).toHaveBeenCalledTimes(3)
  })

  it('does not tick while the window is away, and ticks once when it comes back', () => {
    const tick = vi.fn()
    startClock(tick, env)
    away = true
    vi.advanceTimersByTime(10_000)
    expect(tick).not.toHaveBeenCalled()
    away = false
    back()
    expect(tick).toHaveBeenCalledTimes(1)
  })

  it('stops for good once stopped', () => {
    const tick = vi.fn()
    const stop = startClock(tick, env)
    stop()
    vi.advanceTimersByTime(5000)
    expect(tick).not.toHaveBeenCalled()
  })
})
