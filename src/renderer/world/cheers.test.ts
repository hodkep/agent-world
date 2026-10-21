import { describe, expect, it } from 'vitest'
import { Cheers } from './cheers'

describe('when an agent finishing is something to cheer', () => {
  it('does not cheer for a turn that ends with a task still open, which may be running something in the background; only the finished task is cheered', () => {
    const c = new Cheers()
    c.observe('a', 'idle', 0, 0, false)
    c.observe('a', 'implementing', 0, 1000, true)
    expect(c.observe('a', 'idle', 0, 20_000, true)).toBeNull()
    c.observe('a', 'implementing', 0, 30_000, true)
    c.observe('a', 'implementing', 1, 45_000, false)
    expect(c.observe('a', 'idle', 1, 50_000, false)).toBe('big')
  })

  it('cheers a little when a turn that took at least 8 s of work ends, and not for a shorter one or at the start', () => {
    const c = new Cheers()
    expect(c.observe('a', 'idle', 0, 0)).toBeNull()
    expect(c.observe('a', 'thinking', 0, 1000)).toBeNull()
    expect(c.observe('a', 'implementing', 0, 6000)).toBeNull()
    expect(c.observe('a', 'idle', 0, 10_000)).toBe('small')
    expect(c.observe('a', 'running', 0, 60_000)).toBeNull()
    expect(c.observe('a', 'idle', 0, 65_000)).toBeNull()
  })

  it('cheers a lot when the task was finished (its done count went up), whether that came before the turn ended or after, even for a short one', () => {
    const c = new Cheers()
    c.observe('a', 'idle', 2, 0)
    c.observe('a', 'implementing', 2, 1000)
    c.observe('a', 'implementing', 3, 5000)
    expect(c.observe('a', 'idle', 3, 8000)).toBe('big')
    expect(c.observe('a', 'idle', 4, 60_000)).toBe('big')
  })

  it('does not cheer again for the same agent within five seconds, and keeps agents apart', () => {
    const c = new Cheers()
    c.observe('a', 'idle', 0, 0)
    c.observe('b', 'idle', 0, 0)
    c.observe('a', 'thinking', 0, 100)
    expect(c.observe('a', 'idle', 1, 40_000)).toBe('big')
    expect(c.observe('a', 'idle', 2, 42_000)).toBeNull()
    expect(c.observe('b', 'idle', 1, 42_000)).toBe('big')
  })

  it('does not count waiting for the person, a permission, or sleeping as work, and the first look at an agent already done is not a cheer', () => {
    const c = new Cheers()
    expect(c.observe('a', 'idle', 5, 0)).toBeNull()
    c.observe('a', 'waiting', 5, 1000)
    expect(c.observe('a', 'idle', 5, 100_000)).toBeNull()
    c.observe('a', 'permission', 5, 110_000)
    expect(c.observe('a', 'asleep', 5, 200_000)).toBeNull()
  })
})
