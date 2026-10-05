import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AgentEvent, AgentRecord, PermissionRequest } from '../../../shared/types'
import type { EventSourceOptions } from '../ports'
import { createAgyEvents } from './events'

const fx = (n: string) => readFileSync(join(__dirname, 'fixtures', `${n}.txt`), 'utf8')
const agent = (o: Partial<AgentRecord> = {}): AgentRecord => ({ id: 'a1', name: 'ada', sessionId: 'uuid-made-by-app', repoPath: '/r', cwd: '/w/ada', branch: 'aw/ada', started: false, provider: 'agy', ...o })

function setup(opts: { agents?: AgentRecord[]; conversations?: { id: string; workspace?: string; bornAt?: number }[] } = {}) {
  const agents = opts.agents ?? [agent()]
  const screens: Record<string, string> = { a1: fx('idle') }
  const events: AgentEvent[] = []
  const asked: PermissionRequest[] = []
  const settled: string[] = []
  const sessions: [string, string][] = []
  const written: string[] = []
  const statuses: (string | null)[][] = []
  const o: EventSourceOptions = {
    agentForToken: () => null,
    permissionTimeoutMs: 1000,
    onEvent: (e) => events.push(e),
    onPermission: (r) => asked.push(r),
    onPermissionSettled: (id) => settled.push(id),
    onStatus: (st) => statuses.push([st.model, st.effort]),
    onSession: (id, s) => {
      sessions.push([id, s])
      agents.find((a) => a.id === id)!.sessionId = s
    },
    terminal: { agents: () => agents, screen: (id) => screens[id] ?? '', write: (_id, k) => written.push(k), startedAt: () => 1000 }
  }
  const src = createAgyEvents(o, { conversations: () => (opts.conversations ?? []).map((c) => ({ bornAt: 2000, ...c })), sleep: async () => {} })
  return { src, screens, events, asked, settled, sessions, written, agents, statuses }
}
const acts = (e: AgentEvent[]) => e.filter((x) => x.type === 'activity').map((x) => (x as { activity: string }).activity)

describe('agy activity, read from its screen', () => {
  it('tells idle, working and idle again, once per change', () => {
    const t = setup({ agents: [agent({ started: true, sessionId: 'c1' })] })
    t.src.tick()
    t.src.tick()
    t.screens.a1 = fx('working')
    t.src.tick()
    t.src.tick()
    t.screens.a1 = fx('idle')
    t.src.tick()
    expect(acts(t.events)).toEqual(['idle', 'thinking', 'idle'])
  })
  it('says nothing for an agent whose terminal is not running', () => {
    const t = setup()
    t.screens.a1 = ''
    t.src.tick()
    expect(t.events).toEqual([])
  })
})

describe('what the footer says about the model', () => {
  it('is reported once, and again only when it changes', () => {
    const t = setup({ agents: [agent({ started: true, sessionId: 'c1' })] })
    t.src.tick()
    t.src.tick()
    t.screens.a1 = fx('working')
    t.src.tick()
    expect(t.statuses).toEqual([['Gemini 3.8 Flash', 'high']])
    t.screens.a1 = fx('idle').replace('Gemini 3.8 Flash · high', 'Gemini 3.1 Pro · low')
    t.src.tick()
    expect(t.statuses.at(-1)).toEqual(['Gemini 3.1 Pro', 'low'])
  })
})

describe('agy asking permission', () => {
  const resolved = { started: true, sessionId: 'c1' }
  it('raises one card for the question, and settles it when the question goes away', () => {
    const t = setup({ agents: [agent(resolved)] })
    t.screens.a1 = fx('permission')
    t.src.tick()
    t.src.tick()
    expect(t.asked).toHaveLength(1)
    expect(t.asked[0]).toMatchObject({ agentId: 'a1', tool: 'Bash', detail: 'sleep 4' })
    expect(acts(t.events)).toContain('permission')
    t.screens.a1 = fx('working')
    t.src.tick()
    expect(t.settled).toEqual([t.asked[0]!.id])
  })
  it('answers allow by choosing the first option, and deny by cancelling', async () => {
    const t = setup({ agents: [agent(resolved)] })
    t.screens.a1 = fx('permission')
    t.src.tick()
    t.src.handle.decide(t.asked[0]!.id, 'deny')
    expect(t.written).toEqual(['\x1b'])
    t.written.length = 0
    t.src.tick()
    t.screens.a1 = fx('permission')
    t.src.handle.decide('nope', 'allow')
    expect(t.written).toEqual([])
  })
  it('answers only the question the card showed: if agy has moved on to another, nothing is pressed', () => {
    const t = setup({ agents: [agent(resolved)] })
    t.screens.a1 = fx('permission')
    t.src.tick()
    const id = t.asked[0]!.id
    t.screens.a1 = fx('permission').replaceAll('sleep 4', 'rm -rf ~')
    t.src.handle.decide(id, 'allow')
    t.src.handle.decide(id, 'deny')
    expect(t.written).toEqual([])
    t.screens.a1 = fx('permission')
    t.src.handle.decide(id, 'allow')
    expect(t.written).toEqual(['\r'])
  })
  it('shows the agent as waiting but raises no card for a question whose text imitates agy\'s box', () => {
    const t = setup({ agents: [agent(resolved)] })
    t.screens.a1 = fx('permission').replace('   sleep 4', '   rm -rf ~\n   ' + '─'.repeat(40) + '\n   ls')
    t.src.tick()
    expect(t.asked).toEqual([])
    expect(acts(t.events)).toEqual(['permission'])
  })
  it('never presses Enter for allow when the first answer is not a plain yes', () => {
    const t = setup({ agents: [agent(resolved)] })
    t.screens.a1 = fx('permission').replace('Yes, run command', 'No, cancel it all')
    t.src.tick()
    t.src.handle.decide(t.asked[0]!.id, 'allow')
    expect(t.written).toEqual([])
  })
  it('knows which agents have a question open', () => {
    const t = setup({ agents: [agent(resolved)] })
    t.screens.a1 = fx('permission')
    t.src.tick()
    expect(t.src.handle.hasPending('a1')).toBe(true)
    expect(t.src.handle.hasPending('other')).toBe(false)
  })
})

describe('finding the conversation agy gave a new agent', () => {
  it('waits to say anything until it knows which conversation is the agent\'s, then names it', () => {
    const t = setup({ conversations: [{ id: 'conv-9', workspace: '/w/ada' }] })
    t.screens.a1 = fx('working')
    t.src.tick()
    expect(t.sessions).toEqual([['a1', 'conv-9']])
    expect(acts(t.events)).toEqual(['thinking'])
  })
  it('takes a conversation whose folder is not known yet when it began after this terminal did', () => {
    const t = setup({ conversations: [{ id: 'conv-new', bornAt: 1500 }] })
    t.screens.a1 = fx('working')
    t.src.tick()
    expect(t.sessions).toEqual([['a1', 'conv-new']])
  })
  it('ignores a conversation that began before this terminal did', () => {
    const t = setup({ conversations: [{ id: 'conv-old', bornAt: 100 }] })
    t.screens.a1 = fx('working')
    t.src.tick()
    expect(t.sessions).toEqual([])
  })
  it('holds back while there is no conversation for its folder yet', () => {
    const t = setup({ conversations: [{ id: 'conv-x', workspace: '/w/other' }] })
    t.screens.a1 = fx('working')
    t.src.tick()
    expect(t.sessions).toEqual([])
    expect(t.events).toEqual([])
  })
  it('says nothing, not even idle, before the conversation is known', () => {
    const t = setup()
    t.src.tick()
    expect(t.events).toEqual([])
  })
  it('does not take a conversation another agent already has', () => {
    const t = setup({ agents: [agent(), agent({ id: 'a2', sessionId: 'conv-9', started: true, cwd: '/w/ada' })], conversations: [{ id: 'conv-9', workspace: '/w/ada' }] })
    t.screens.a1 = fx('working')
    t.src.tick()
    expect(t.sessions).toEqual([])
  })
})
