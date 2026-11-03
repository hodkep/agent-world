import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LedgerEvent } from '../../shared/ledger'
import type { Prefs } from '../../shared/types'
import { createVoiceHub, type HubOut } from './hub'
import type { VoiceOut } from '../../shared/voiceEvent'
import type { SessionDeps } from './session'

const voice = (o: Partial<Prefs['voice']> = {}): Prefs['voice'] => ({ enabled: true, model: 'gemini-3.8-live', mode: 'ptt', speak: 'milestones', extra: 'Call me P.', items: ['brainstorm'], capMinutes: 30, confirm: false, sounds: true, ...o })

function rig(o: { key?: string | null; prefs?: Partial<Prefs['voice']>; summary?: string } = {}) {
  const out: HubOut[] = []
  const calls: { fn: string; arg?: unknown }[] = []
  const ledger: LedgerEvent[] = []
  const sent: unknown[] = []
  const todos: unknown[] = []
  let deps!: SessionDeps
  let now = 1_000_000
  const saved: unknown[] = []
  const logged: string[] = []
  const flags = { failSend: false }
  const hub = createVoiceHub({
    log: (l) => void logged.push(l),
    key: () => (o.key === undefined ? 'AIzaKey' : o.key),
    prefs: () => voice(o.prefs),
    agents: () => [{ name: 'ada', state: 'working', doing: 'fixing rounding' }, { name: 'hai', state: 'idle' }],
    needsYou: () => [],
    todos: (_p, f) => (f?.status === 'blocked' ? [{ id: '1', title: 'Stuck thing', status: 'blocked', list: 'Chat' }] : []),
    todo: (_p, id) => (id === '1' ? { id: '1', title: 'Stuck thing' } : null),
    workflows: (p) => ({ enabled: true, workflows: [{ id: p, name: 'Standard' }] }),
    runs: (p) => ({ open: [{ in: p }], recent: [] }),
    notes: () => [],
    items: (ids) => ids.map((id) => ({ id, title: 'Brainstorm', text: 'Ask what problem first.', core: true })),
    limits: async () => [{ window: '5-hour', leftPct: 12 }],
    usage: async (p, days) => ({ project: p, days }),
    agentStats: (p, name) => [{ p, name: name ?? 'all' }],
    chat: (_p, name, count) => (name === 'ada' ? [{ who: 'agent' as const, text: `ada's last of ${count}` }] : null),
    send: async (...a) => {
      if (flags.failSend) throw new Error('chat down')
      sent.push(a)
    },
    addTodo: (...a) => void todos.push(a),
    record: (e) => void ledger.push(e),
    lastSummary: () => 'We chose percent discounts.',
    saveTalk: (_p, t) => void saved.push(t),
    summarize: async () => o.summary ?? 'Settled: percent first.',
    emit: (e) => out.push(e),
    now: () => now,
    makeSession: (d) => {
      deps = d
      return { state: () => 'listening', start: async () => void calls.push({ fn: 'start' }), audio: (b) => void calls.push({ fn: 'audio', arg: b }), audioEnd: () => void calls.push({ fn: 'audioEnd' }), context: (t, s) => void calls.push({ fn: 'context', arg: [t, s] }), mute: (m) => void calls.push({ fn: 'mute', arg: m }), end: () => void calls.push({ fn: 'end' }) }
    }
  })
  const emit = (e: VoiceOut) => deps.emit(e)
  return { flags, get failSend() { return flags.failSend }, set failSend(v: boolean) { flags.failSend = v }, hub, out, calls, ledger, sent, todos, saved, logged, emit, deps: () => deps, tick: (ms: number) => (now += ms) }
}
const path = '/work/shop'

afterEach(() => vi.useRealTimers())

describe('the voice hub', () => {
  it('writes down what happens in a talk, so a talk that goes wrong can be looked at afterwards', async () => {
    const r = rig()
    await r.hub.start(path, 'shop')
    r.emit({ type: 'state', state: 'speaking', muted: false })
    r.emit({ type: 'notice', text: 'Reconnecting… (lost)' })
    r.emit({ type: 'error', text: 'Lost the connection to Gemini.' })
    await r.hub.stop('the person ended it')
    const text = r.logged.join('\n')
    expect(text).toMatch(/start shop/)
    expect(text).toMatch(/state speaking/)
    expect(text).toMatch(/notice Reconnecting… \(lost\)/)
    expect(text).toMatch(/error Lost the connection to Gemini\./)
    expect(text).toMatch(/stop \(the person ended it\)/)
  })
  it('says why a talk ended when the time limit does it', async () => {
    vi.useFakeTimers()
    const r = rig({ prefs: { capMinutes: 15 } })
    await r.hub.start(path, 'shop')
    vi.advanceTimersByTime(15 * 60_000 + 10)
    await Promise.resolve()
    expect(r.logged.join('\n')).toMatch(/stop \(time limit\)/)
  })
  it('says held news once the person has stopped talking, without waiting for a turn to end', async () => {
    vi.useFakeTimers()
    const r = rig()
    await r.hub.start(path, 'shop')
    r.emit({ type: 'caption', who: 'you', text: 'so I was thinking' })
    r.tick(1500)
    r.hub.alert(path, { kind: 'finished', agent: 'ada', text: 'Agent ada: finished.' })
    expect(r.calls.filter((c) => c.fn === 'context').length).toBe(1)
    r.tick(5000)
    vi.advanceTimersByTime(2600)
    expect(r.calls.at(-1)).toEqual({ fn: 'context', arg: ['Agent ada: finished.', true] })
  })
  it('will not start without a key', async () => {
    expect(await rig({ key: null }).hub.start(path, 'shop')).toEqual({ ok: false, reason: 'nokey' })
  })
  it('starts a session told about the workspace, the ticked playbook, the person\'s words and the last talk, then hands it a silent digest', async () => {
    const r = rig()
    expect(await r.hub.start(path, 'shop')).toEqual({ ok: true })
    const t = r.deps().instructions
    expect(t).toMatch(/workspace "shop"/)
    expect(t).toMatch(/Ask what problem first/)
    expect(t).toMatch(/Call me P\./)
    expect(t).toMatch(/We chose percent discounts/)
    expect(r.deps().model).toBe('gemini-3.8-live')
    expect(r.calls.find((c) => c.fn === 'context')!.arg).toEqual([expect.stringMatching(/ada \(working: fixing rounding\)/), false])
  })
  it('keeps what each side said as turns, and saves the talk with its summary when it ends', async () => {
    const r = rig()
    await r.hub.start(path, 'shop')
    r.emit({ type: 'caption', who: 'you', text: 'Let us add' })
    r.emit({ type: 'caption', who: 'you', text: ' discount codes.' })
    r.emit({ type: 'turnComplete' })
    r.emit({ type: 'caption', who: 'it', text: 'Percent first?' })
    await r.hub.stop()
    expect(r.saved).toEqual([{ at: 1_000_000, summary: 'Settled: percent first.', turns: 2 }])
    expect(r.out.at(-1)).toEqual({ type: 'ended', summary: 'Settled: percent first.' })
    expect(r.calls.some((c) => c.fn === 'end')).toBe(true)
  })
  it('saves nothing for a talk with no words', async () => {
    const r = rig()
    await r.hub.start(path, 'shop')
    await r.hub.stop()
    expect(r.saved).toEqual([])
  })
  it('records what each turn cost in the usage ledger, as the voice', async () => {
    const r = rig()
    await r.hub.start(path, 'shop')
    r.emit({ type: 'usage', usage: { responseTokensDetails: [{ modality: 'AUDIO', tokenCount: 1_000_000 }] } })
    expect(r.ledger).toEqual([expect.objectContaining({ k: 'cost', agent: 'voice', project: 'shop', provider: 'gemini', model: 'gemini-3.8-live', usd: 12 })])
  })
  it('speaks of a finish at a pause on milestones, and only tells itself the rest', async () => {
    const r = rig()
    await r.hub.start(path, 'shop')
    r.tick(120_000)
    r.hub.alert(path, { kind: 'finished', agent: 'ada', text: 'Agent ada: finished its turn.' })
    expect(r.calls.at(-1)).toEqual({ fn: 'context', arg: ['Agent ada: finished its turn.', true] })
    r.tick(120_000)
    r.hub.alert(path, { kind: 'started', agent: 'ada', text: 'Agent ada: started.' })
    expect(r.calls.at(-1)).toEqual({ fn: 'context', arg: ['Agent ada: started.', false] })
  })
  it('holds news back while the voice is talking and says it when the turn is over', async () => {
    const r = rig()
    await r.hub.start(path, 'shop')
    r.tick(120_000)
    r.emit({ type: 'state', state: 'speaking', muted: false })
    r.hub.alert(path, { kind: 'finished', agent: 'ada', text: 'Agent ada: finished.' })
    expect(r.calls.filter((c) => c.fn === 'context').length).toBe(1)
    r.emit({ type: 'state', state: 'listening', muted: false })
    r.tick(5000)
    r.emit({ type: 'turnComplete' })
    expect(r.calls.at(-1)).toEqual({ fn: 'context', arg: ['Agent ada: finished.', true] })
  })
  it('ignores news from another workspace', async () => {
    const r = rig()
    await r.hub.start(path, 'shop')
    const before = r.calls.length
    r.hub.alert('/work/other', { kind: 'finished', agent: 'x', text: 'x' })
    expect(r.calls.length).toBe(before)
  })
  it('passes a message on to the agent at once, as the person, and tells the voice whether that agent was busy', async () => {
    const r = rig()
    await r.hub.start(path, 'shop')
    expect(await r.deps().runTool('send_message', { to: 'ada', message: 'Add percent discounts.' })).toMatchObject({ sent: true, to: 'ada', busy: true })
    expect(await r.deps().runTool('send_message', { to: 'hai', message: 'Take the rounding bug.' })).toMatchObject({ sent: true, to: 'hai', busy: false })
    expect(r.sent).toEqual([[path, 'ada', 'Add percent discounts.'], [path, 'hai', 'Take the rounding bug.']])
    expect(r.out.some((e) => e.type === 'draft')).toBe(false)
  })
  it('adds a todo at once', async () => {
    const r = rig()
    await r.hub.start(path, 'shop')
    await r.deps().runTool('add_todo', { title: 'Add discount codes', notes: 'percent' })
    expect(r.todos).toEqual([[path, { title: 'Add discount codes', notes: 'percent' }]])
  })
  it('does not send faster than a person could mean to, so a loop cannot flood the agents', async () => {
    const r = rig()
    await r.hub.start(path, 'shop')
    for (let i = 0; i < 8; i++) await r.deps().runTool('send_message', { to: 'hai', message: `m${i}` })
    await expect(r.deps().runTool('send_message', { to: 'hai', message: 'one too many' })).rejects.toThrow(/too fast/i)
    r.tick(61_000)
    await expect(r.deps().runTool('send_message', { to: 'hai', message: 'later' })).resolves.toMatchObject({ sent: true })
  })
  it('when the person asked to confirm first, shows a draft and sends nothing until Send, then sends it as them', async () => {
    const r = rig({ prefs: { confirm: true } })
    await r.hub.start(path, 'shop')
    expect(await r.deps().runTool('send_message', { to: 'ada', message: 'Add percent discounts.' })).toMatchObject({ drafted: true })
    const draft = r.out.find((e) => e.type === 'draft') as Extract<HubOut, { type: 'draft' }>
    expect(draft.draft).toMatchObject({ kind: 'message', to: 'ada', text: 'Add percent discounts.' })
    expect(r.sent).toEqual([])
    await r.hub.draftSend(draft.draft.id)
    expect(r.sent).toEqual([[path, 'ada', 'Add percent discounts.']])
    expect(r.out.at(-1)).toEqual({ type: 'draftGone', id: draft.draft.id })
  })
  it('keeps a draft whose send failed, so Send can be tried again from the same card', async () => {
    const r = rig({ prefs: { confirm: true } })
    await r.hub.start(path, 'shop')
    await r.deps().runTool('send_message', { to: 'ada', message: 'Hello' })
    const id = (r.out.find((e) => e.type === 'draft') as Extract<HubOut, { type: 'draft' }>).draft.id
    r.failSend = true
    await expect(r.hub.draftSend(id)).rejects.toThrow()
    expect(r.out.some((e) => e.type === 'draftGone')).toBe(false)
    r.failSend = false
    await r.hub.draftSend(id)
    expect(r.sent).toEqual([[path, 'ada', 'Hello']])
  })
  it('when asked to confirm first, adds a drafted todo only on Send, and drops a discarded draft', async () => {
    const r = rig({ prefs: { confirm: true } })
    await r.hub.start(path, 'shop')
    await r.deps().runTool('add_todo', { title: 'Add discount codes', notes: 'percent' })
    await r.deps().runTool('add_todo', { title: 'Another' })
    const ids = r.out.filter((e) => e.type === 'draft').map((e: any) => e.draft.id)
    expect(r.todos).toEqual([])
    await r.hub.draftSend(ids[0])
    r.hub.draftDiscard(ids[1])
    expect(r.todos).toEqual([[path, { title: 'Add discount codes', notes: 'percent' }]])
    await expect(r.hub.draftSend(ids[1])).rejects.toThrow(/no such draft/i)
  })
  it('knows which agent the person has open, tells the voice when that changes, and marks it in the list', async () => {
    const r = rig()
    await r.hub.start(path, 'shop', 'ada')
    expect(await r.deps().runTool('list_agents', {})).toMatchObject({ agents: [{ name: 'ada', open: true }, { name: 'hai' }] })
    const before = r.calls.length
    r.hub.focus('hai')
    expect(r.calls.slice(before)).toEqual([{ fn: 'context', arg: ['The person now has agent hai open in the app.', false] }])
    expect(await r.deps().runTool('list_agents', {})).toMatchObject({ agents: [{ name: 'ada' }, { name: 'hai', open: true }] })
    r.hub.focus('hai')
    expect(r.calls.length).toBe(before + 1)
  })
  it('tells a session that had to start clean what it had been told, and what was said in this talk', async () => {
    const r = rig()
    await r.hub.start(path, 'shop')
    r.emit({ type: 'caption', who: 'you', text: 'We are adding discount codes.' })
    const before = r.calls.length
    r.deps().onFresh!()
    const told = r.calls.slice(before).filter((c) => c.fn === 'context').map((c) => (c.arg as [string, boolean])[0])
    expect(told.join('\n')).toMatch(/Workspace "shop"/)
    expect(told.join('\n')).toMatch(/Earlier in this talk[\s\S]*discount codes/)
  })
  it('writes down the news it was given and what was done with it, and the tools it used', async () => {
    const r = rig()
    await r.hub.start(path, 'shop')
    r.tick(120_000)
    r.hub.alert(path, { kind: 'finished', agent: 'ada', text: 'Agent ada: finished.' })
    await r.deps().runTool('send_message', { to: 'hai', message: 'hello' })
    const text = r.logged.join('\n')
    expect(text).toMatch(/alert finished ada: speak/)
    expect(text).toMatch(/tool send_message/)
    expect(text).toMatch(/sent to hai/)
  })
  it('gives the voice the limits, the spend and the agent numbers of the talk\'s own workspace', async () => {
    const r = rig()
    await r.hub.start(path, 'shop')
    expect(await r.deps().runTool('get_limits', {})).toEqual({ limits: [{ window: '5-hour', leftPct: 12 }] })
    expect(await r.deps().runTool('get_usage', { days: 14 })).toEqual({ project: path, days: 14 })
    expect(await r.deps().runTool('get_agent_stats', { name: 'ada' })).toEqual({ agents: [{ p: path, name: 'ada' }] })
  })
  it('gives the voice todos and workflows of the talk\'s own workspace, read only', async () => {
    const r = rig()
    await r.hub.start(path, 'shop')
    expect(await r.deps().runTool('list_todos', { status: 'blocked' })).toMatchObject({ todos: [{ id: '1', title: 'Stuck thing', status: 'blocked', list: 'Chat' }] })
    expect(await r.deps().runTool('get_todo', { id: '1' })).toMatchObject({ todo: { id: '1', title: 'Stuck thing' } })
    expect(await r.deps().runTool('list_workflows', {})).toEqual({ enabled: true, workflows: [{ id: path, name: 'Standard' }] })
    expect(await r.deps().runTool('list_workflow_runs', {})).toEqual({ open: [{ in: path }], recent: [] })
  })
  it('reads an agent\'s recent conversation from the talk\'s own workspace', async () => {
    const r = rig()
    await r.hub.start(path, 'shop')
    expect(await r.deps().runTool('read_agent', { name: 'ada', count: 5 })).toMatchObject({ agent: 'ada', recent: [{ who: 'agent', text: "ada's last of 5" }] })
  })
  it('reads a playbook item only if the person ticked it for the voice', async () => {
    const r = rig()
    await r.hub.start(path, 'shop')
    expect(await r.deps().runTool('get_playbook_item', { id: 'brainstorm' })).toEqual({ text: 'Ask what problem first.' })
    expect(await r.deps().runTool('get_playbook_item', { id: 'secret-skill' })).toEqual({ error: 'no such playbook item' })
  })
  it('passes the person\'s speech and mute to the session', async () => {
    const r = rig()
    await r.hub.start(path, 'shop')
    r.hub.audio('AAAA'); r.hub.audioEnd(); r.hub.mute(true)
    expect(r.calls.slice(-3)).toEqual([{ fn: 'audio', arg: 'AAAA' }, { fn: 'audioEnd' }, { fn: 'mute', arg: true }])
  })
})
