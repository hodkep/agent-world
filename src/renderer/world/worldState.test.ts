import { describe, expect, it } from 'vitest'
import { applyEvent, emptyWorld, roleOf } from './worldState'

const s = 's1'

describe('world state', () => {
  it('tracks the latest activity and detail per session', () => {
    let w = applyEvent(emptyWorld(), { type: 'activity', sessionId: s, activity: 'researching', tool: 'Grep', detail: 'foo' })
    w = applyEvent(w, { type: 'activity', sessionId: s, activity: 'implementing', tool: 'Edit', detail: 'a.ts' })
    expect(w[s]).toMatchObject({ activity: 'implementing', detail: 'a.ts' })
  })

  it('an agent is senior until it has live interns, then it is the boss', () => {
    let w = applyEvent(emptyWorld(), { type: 'activity', sessionId: s, activity: 'thinking' })
    expect(roleOf(w[s]!)).toBe('senior')
    w = applyEvent(w, { type: 'subagent-start', sessionId: s, subagentId: 'i1', subagentType: 'Explore' })
    expect(roleOf(w[s]!)).toBe('boss')
    w = applyEvent(w, { type: 'subagent-stop', sessionId: s, subagentId: 'i1' })
    expect(roleOf(w[s]!)).toBe('senior')
  })

  it('subagent activity goes to the intern, not the boss', () => {
    let w = applyEvent(emptyWorld(), { type: 'activity', sessionId: s, activity: 'delegating' })
    w = applyEvent(w, { type: 'subagent-start', sessionId: s, subagentId: 'i1', subagentType: 'Explore' })
    w = applyEvent(w, { type: 'activity', sessionId: s, subagentId: 'i1', activity: 'researching', detail: 'x.md' })
    expect(w[s]!.activity).toBe('delegating')
    expect(w[s]!.interns.i1).toMatchObject({ type: 'Explore', activity: 'researching', detail: 'x.md' })
  })

  it('activity for an intern we never saw start still creates it', () => {
    const w = applyEvent(emptyWorld(), { type: 'activity', sessionId: s, subagentId: 'i9', activity: 'running' })
    expect(w[s]!.interns.i9).toMatchObject({ activity: 'running' })
  })

  it('session end puts the agent to sleep and sends interns home', () => {
    let w = applyEvent(emptyWorld(), { type: 'subagent-start', sessionId: s, subagentId: 'i1', subagentType: 'x' })
    w = applyEvent(w, { type: 'session-end', sessionId: s })
    expect(w[s]).toMatchObject({ activity: 'asleep', interns: {} })
  })

  it('does not mutate the previous state', () => {
    const a = applyEvent(emptyWorld(), { type: 'activity', sessionId: s, activity: 'thinking' })
    applyEvent(a, { type: 'activity', sessionId: s, activity: 'idle' })
    expect(a[s]!.activity).toBe('thinking')
  })
})
