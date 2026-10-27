import { describe, expect, it } from 'vitest'
import { agentDot, agentMarks, createDoneTracker, projectDot } from './attention'

const a = (id: string, repoPath: string, activity: string) => ({ id, repoPath, activity })

describe('an agent that finished while you were looking elsewhere', () => {
  it('is one that went from working to idle; one that was idle already, or only waits, is not', () => {
    const t = createDoneTracker()
    t.observe([a('a1', '/p', 'thinking'), a('a2', '/p', 'idle'), a('a3', '/p', 'implementing')])
    t.observe([a('a1', '/p', 'idle'), a('a2', '/p', 'idle'), a('a3', '/p', 'permission')])
    expect([...t.agents()]).toEqual(['a1'])
    expect([...t.projects()]).toEqual(['/p'])
  })
  it('counts the turn ending in Claude\'s idle prompt, shown as waiting, and keeps it when that settles to idle', () => {
    const t = createDoneTracker()
    t.observe([a('a1', '/p', 'running')])
    t.observe([a('a1', '/p', 'waiting')])
    expect([...t.agents()]).toEqual(['a1'])
    t.observe([a('a1', '/p', 'idle')])
    expect([...t.agents()]).toEqual(['a1'])
  })
  it('counts a first sight of an agent that is already idle as nothing, and any kind of work as work', () => {
    const t = createDoneTracker()
    t.observe([a('a1', '/p', 'idle')])
    expect(t.agents().size).toBe(0)
    for (const work of ['thinking', 'researching', 'implementing', 'running', 'delegating']) {
      const u = createDoneTracker()
      u.observe([a('x', '/q', work)])
      u.observe([a('x', '/q', 'idle')])
      expect(u.agents().has('x'), work).toBe(true)
    }
  })
  it('is forgotten when its project is opened or the agent is selected, not before', () => {
    const t = createDoneTracker()
    t.observe([a('a1', '/p', 'running'), a('a2', '/q', 'running')])
    t.observe([a('a1', '/p', 'idle'), a('a2', '/q', 'idle')])
    expect([...t.projects()].sort()).toEqual(['/p', '/q'])
    t.opened('/p')
    expect([...t.projects()]).toEqual(['/q'])
    // The agent of the project you are in still waits to be looked at, until it is selected.
    expect([...t.agents()].sort()).toEqual(['a1', 'a2'])
    t.selected('a2')
    expect(t.projects().size).toBe(0)
    t.selected('a1')
    expect(t.agents().size).toBe(0)
  })
  it('keeps an agent of the project you are in marked when it finishes while the project is open', () => {
    const t = createDoneTracker()
    t.observe([a('a1', '/p', 'thinking')])
    t.observe([a('a1', '/p', 'idle')])
    t.opened('/p')
    expect([...t.agents()]).toEqual(['a1'])
    expect(t.projects().size).toBe(0)
  })
  it('keeps nothing for an agent that is gone', () => {
    const t = createDoneTracker()
    t.observe([a('a1', '/p', 'running')])
    t.observe([a('a1', '/p', 'idle')])
    t.observe([])
    expect(t.agents().size).toBe(0)
  })
})

describe('the dot on the project button', () => {
  const act = { '/here': { waiting: 3, working: 0 }, '/b': { waiting: 0, working: 1 }, '/c': { waiting: 0, working: 0 } }
  it('is red when another project waits for you, and never for the project you are in', () => {
    expect(projectDot({ activity: { ...act, '/b': { waiting: 1, working: 0 } }, active: '/here', done: new Set() })).toBe('need')
    expect(projectDot({ activity: act, active: '/here', done: new Set() })).toBeNull()
  })
  it('is green when an agent in another project finished and nothing waits; red wins over it', () => {
    expect(projectDot({ activity: act, active: '/here', done: new Set(['/c']) })).toBe('done')
    expect(projectDot({ activity: { ...act, '/b': { waiting: 2, working: 0 } }, active: '/here', done: new Set(['/c']) })).toBe('need')
    expect(projectDot({ activity: act, active: '/here', done: new Set(['/here']) })).toBeNull()
  })
})

describe('the dot on the agent number', () => {
  it('is red when another agent here waits, green when another finished, red over green, and nothing for the agent you are on', () => {
    const agents = [{ id: 'a1', asks: true }, { id: 'a2', asks: false }, { id: 'a3', asks: false }]
    expect(agentDot({ selected: 'a1', agents, done: new Set() })).toBeNull()
    expect(agentDot({ selected: 'a2', agents, done: new Set() })).toBe('need')
    expect(agentDot({ selected: 'a1', agents, done: new Set(['a3']) })).toBe('done')
    expect(agentDot({ selected: 'a2', agents, done: new Set(['a3']) })).toBe('need')
    expect(agentDot({ selected: 'a3', agents: agents.map((x) => ({ ...x, asks: false })), done: new Set(['a3']) })).toBeNull()
  })
})

describe('the marks on the agent tiles', () => {
  const agents = [{ id: 'a1', asks: false }, { id: 'a2', asks: true }, { id: 'a3', asks: false }, { id: 'a4', asks: false }]
  it('mark each other agent red when it needs you, else green when it finished unseen, else nothing', () => {
    const m = agentMarks({ selected: 'a1', agents, done: new Set(['a3', 'a2']) })
    expect(m.get('a2')).toBe('need')
    expect(m.get('a3')).toBe('done')
    expect(m.has('a4')).toBe(false)
  })
  it('never mark the agent you are on, so the count is of the others', () => {
    const m = agentMarks({ selected: 'a2', agents, done: new Set(['a2', 'a3']) })
    expect(m.has('a2')).toBe(false)
    expect(m.size).toBe(1)
  })
})
