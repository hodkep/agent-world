import { describe, expect, it } from 'vitest'
import { BUSY_EVENT_GRACE_MS, SETTLED_MS, mayCallIdle } from './idleLook'

const quiet = { now: 100_000, lastOutput: 90_000, lastBusyEvent: 0, inputReady: true, menu: false, working: false }

describe('may the screen call an agent idle?', () => {
  it('when its input box shows, nothing is working, no menu is up and the screen has been quiet', () => {
    expect(mayCallIdle(quiet)).toBe(true)
  })
  it('not while the screen still changes, or the input box is not showing, a menu is up, or a spinner is on it', () => {
    expect(mayCallIdle({ ...quiet, lastOutput: quiet.now - SETTLED_MS })).toBe(false)
    expect(mayCallIdle({ ...quiet, inputReady: false })).toBe(false)
    expect(mayCallIdle({ ...quiet, menu: true })).toBe(false)
    expect(mayCallIdle({ ...quiet, working: true })).toBe(false)
  })
  it('not within a few seconds of an event that said the agent is busy: the hook is fresher than a screen that may be stale', () => {
    expect(mayCallIdle({ ...quiet, lastBusyEvent: quiet.now - 1000 })).toBe(false)
    expect(mayCallIdle({ ...quiet, lastBusyEvent: quiet.now - BUSY_EVENT_GRACE_MS + 1 })).toBe(false)
    // An interrupted turn sends no Stop, so after that long the screen is trusted again.
    expect(mayCallIdle({ ...quiet, lastBusyEvent: quiet.now - BUSY_EVENT_GRACE_MS })).toBe(true)
  })
})
