import { describe, expect, it } from 'vitest'
import { opensPreview } from './browserOpen'

const act = (o: object = {}) => ({ agentId: 'a1', connections: 1, at: 100_000, action: { pill: 'CLICKING' }, ...o })

describe('when the Preview opens by itself as an agent starts browsing', () => {
  const on = { setting: true, selected: 'a1', view: 'chat' }
  it('does when the setting is on, for the agent you are looking at, at the start of a run', () => {
    expect(opensPreview({ ...on, prev: undefined, next: act() })).toBe(true)
    expect(opensPreview({ ...on, prev: act({ connections: 0, at: 99_000 }), next: act() })).toBe(true)
    expect(opensPreview({ ...on, prev: act({ at: 50_000 }), next: act({ at: 100_000 }) })).toBe(true)
  })
  it('never when the setting is off', () => {
    expect(opensPreview({ ...on, setting: false, prev: undefined, next: act() })).toBe(false)
  })
  it('never for an agent you are not looking at, so it does not pull you from another', () => {
    expect(opensPreview({ ...on, selected: 'a2', prev: undefined, next: act() })).toBe(false)
  })
  it('not again while the run goes on, nor when it is already open', () => {
    expect(opensPreview({ ...on, prev: act({ at: 99_000 }), next: act({ at: 100_000 }) })).toBe(false)
    expect(opensPreview({ ...on, view: 'preview', prev: undefined, next: act() })).toBe(false)
  })
  it('not for a command that says nothing of what the agent is doing, nor for a tool that left', () => {
    expect(opensPreview({ ...on, prev: undefined, next: act({ action: undefined }) })).toBe(false)
    expect(opensPreview({ ...on, prev: undefined, next: act({ connections: 0 }) })).toBe(false)
  })
})
