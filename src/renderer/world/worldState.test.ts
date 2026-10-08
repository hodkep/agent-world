import { describe, expect, it } from 'vitest'
import { applyEvent, emptyWorld, placeFor, readingCaption, roleOf } from './worldState'

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
    // An agent reading a library item walks to the shelf; one at rest, or a subagent, does not.
    expect(placeFor('implementing', false, undefined, true)).toBe('shelf')
    expect(placeFor('thinking', false, 'plan', true)).toBe('shelf')
    expect(placeFor('idle', false, undefined, true)).toBe('lounge')
    expect(placeFor('implementing', true, undefined, true)).toBe('intern')
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

describe('plans, tasks and modes', () => {
  const ev = (e: object) => ({ agentId: s, sessionId: s, ...e }) as Parameters<typeof applyEvent>[1]

  it('planning agents work at the whiteboard; the same work outside plan mode is at the desk', () => {
    expect(placeFor('researching', false, 'plan')).toBe('whiteboard')
    expect(placeFor('permission', false, 'plan')).toBe('whiteboard')
    expect(placeFor('researching', false, 'default')).toBe('desk')
    expect(placeFor('idle', false, 'plan')).toBe('lounge')
  })

  it('a blocked agent (rate limit, overload) waits in the lounge; compacting stays at the desk', () => {
    expect(placeFor('blocked', false)).toBe('lounge')
    expect(placeFor('compacting', false)).toBe('desk')
  })

  it('remembers the permission mode from events', () => {
    const w = applyEvent(emptyWorld(), ev({ type: 'activity', activity: 'researching', mode: 'plan' }))
    expect(w[s]!.mode).toBe('plan')
  })

  it('keeps the latest plan and its steps', () => {
    const w = applyEvent(emptyWorld(), ev({ type: 'plan', plan: '# p', steps: ['a', 'b'] }))
    expect(w[s]).toMatchObject({ plan: '# p', planSteps: ['a', 'b'] })
  })

  it('builds the task list from create and update events, and forgets deleted tasks', () => {
    let w = applyEvent(emptyWorld(), ev({ type: 'task', id: '1', subject: 'Write hello.txt', status: 'pending' }))
    w = applyEvent(w, ev({ type: 'task', id: '2', subject: 'Check it', status: 'pending' }))
    w = applyEvent(w, ev({ type: 'task', id: '1', status: 'in_progress' }))
    w = applyEvent(w, ev({ type: 'task', id: '2', status: 'deleted' }))
    expect(w[s]!.tasks).toEqual([{ id: '1', subject: 'Write hello.txt', status: 'in_progress' }])
  })

  it('a new session (after /clear) starts with an empty task list and no plan', () => {
    let w = applyEvent(emptyWorld(), ev({ type: 'task', id: '1', subject: 'x', status: 'pending' }))
    w = applyEvent(w, ev({ type: 'plan', plan: '# p', steps: [] }))
    w = applyEvent(w, { type: 'session-start', agentId: s, sessionId: 'new' })
    expect(w[s]).toMatchObject({ tasks: [], plan: null })
  })

  it('follows the permission mode read from the screen without disturbing what the agent is doing', () => {
    let w = applyEvent(emptyWorld(), { type: 'activity', agentId: 'a', sessionId: 's', activity: 'implementing', tool: 'Edit' })
    w = applyEvent(w, { type: 'mode', agentId: 'a', sessionId: 's', mode: 'plan' })
    expect(w.a).toMatchObject({ mode: 'plan', activity: 'implementing' })
  })
})

describe('the words over an agent reading from the library', () => {
  it('say what it reads, and stay short enough to fit over one desk', () => {
    expect(readingCaption('tdd')).toBe('read tdd')
    expect(readingCaption('database-schema-design')).toBe('read database-schema')
  })
})
