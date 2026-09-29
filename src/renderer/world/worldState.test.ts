import { describe, expect, it } from 'vitest'
import { applyEvent, emptyWorld, placeFor, roleOf } from './worldState'

const s = 's1'

describe('world state', () => {
  it('tracks the latest activity and detail per session', () => {
    let w = applyEvent(emptyWorld(), { type: 'activity', agentId: s, sessionId: s, activity: 'researching', tool: 'Grep', detail: 'foo' })
    w = applyEvent(w, { type: 'activity', agentId: s, sessionId: s, activity: 'implementing', tool: 'Edit', detail: 'a.ts' })
    expect(w[s]).toMatchObject({ activity: 'implementing', detail: 'a.ts' })
  })

  it('an agent is senior until it has live interns, then it is the boss', () => {
    let w = applyEvent(emptyWorld(), { type: 'activity', agentId: s, sessionId: s, activity: 'thinking' })
    expect(roleOf(w[s]!)).toBe('senior')
    w = applyEvent(w, { type: 'subagent-start', agentId: s, sessionId: s, subagentId: 'i1', subagentType: 'Explore' })
    expect(roleOf(w[s]!)).toBe('boss')
    w = applyEvent(w, { type: 'subagent-stop', agentId: s, sessionId: s, subagentId: 'i1' })
    expect(roleOf(w[s]!)).toBe('senior')
  })

  it('subagent activity goes to the intern, not the boss', () => {
    let w = applyEvent(emptyWorld(), { type: 'activity', agentId: s, sessionId: s, activity: 'delegating' })
    w = applyEvent(w, { type: 'subagent-start', agentId: s, sessionId: s, subagentId: 'i1', subagentType: 'Explore' })
    w = applyEvent(w, { type: 'activity', agentId: s, sessionId: s, subagentId: 'i1', activity: 'researching', detail: 'x.md' })
    expect(w[s]!.activity).toBe('delegating')
    expect(w[s]!.interns.i1).toMatchObject({ type: 'Explore', activity: 'researching', detail: 'x.md' })
  })

  it('activity for an intern we never saw start still creates it', () => {
    const w = applyEvent(emptyWorld(), { type: 'activity', agentId: s, sessionId: s, subagentId: 'i9', activity: 'running' })
    expect(w[s]!.interns.i9).toMatchObject({ activity: 'running' })
  })

  it('session end puts the agent to sleep and sends interns home', () => {
    let w = applyEvent(emptyWorld(), { type: 'subagent-start', agentId: s, sessionId: s, subagentId: 'i1', subagentType: 'x' })
    w = applyEvent(w, { type: 'session-end', agentId: s, sessionId: s })
    expect(w[s]).toMatchObject({ activity: 'asleep', interns: {} })
  })

  it('does not mutate the previous state', () => {
    const a = applyEvent(emptyWorld(), { type: 'activity', agentId: s, sessionId: s, activity: 'thinking' })
    applyEvent(a, { type: 'activity', agentId: s, sessionId: s, activity: 'idle' })
    expect(a[s]!.activity).toBe('thinking')
  })
})

describe('place follows state', () => {
  it('active agents sit at their desk, finished ones rest in the lounge, dead ones leave', () => {
    for (const a of ['thinking', 'researching', 'implementing', 'running', 'delegating', 'permission'] as const) expect(placeFor(a, false), a).toBe('desk')
    expect(placeFor('idle', false)).toBe('lounge')
    expect(placeFor('waiting', false)).toBe('lounge')
    expect(placeFor('asleep', false)).toBe('gone')
  })

  it('interns always work at the meeting table while they exist', () => {
    expect(placeFor('running', true)).toBe('intern')
    expect(placeFor('idle', true)).toBe('intern')
  })
})

describe('work done', () => {
  it('each file written or edited adds a sheet to the agent\'s pile', () => {
    let w = applyEvent(emptyWorld(), { type: 'activity', agentId: s, sessionId: s, activity: 'implementing', tool: 'Write', detail: 'a.ts' })
    w = applyEvent(w, { type: 'activity', agentId: s, sessionId: s, activity: 'implementing', tool: 'Edit', detail: 'a.ts' })
    w = applyEvent(w, { type: 'activity', agentId: s, sessionId: s, activity: 'running', tool: 'Bash', detail: 'ls' })
    expect(w[s]!.files).toBe(2)
  })

  it('a permission request for a write is not a second sheet', () => {
    let w = applyEvent(emptyWorld(), { type: 'activity', agentId: s, sessionId: s, activity: 'implementing', tool: 'Write' })
    w = applyEvent(w, { type: 'activity', agentId: s, sessionId: s, activity: 'permission', tool: 'Write' })
    expect(w[s]!.files).toBe(1)
  })

  it('interns\' edits count toward their boss\'s pile', () => {
    const w = applyEvent(emptyWorld(), { type: 'activity', agentId: s, sessionId: s, subagentId: 'i1', activity: 'implementing', tool: 'Edit' })
    expect(w[s]!.files).toBe(1)
  })
})
