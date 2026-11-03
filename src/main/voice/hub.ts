import type { LedgerEvent } from '../../shared/ledger'
import type { Prefs } from '../../shared/types'
import type { DraftShown, VoiceEvent, VoiceOut } from '../../shared/voiceEvent'
import type { VoiceState } from '../../shared/voiceState'
import { buildDigest, type AgentLine } from './digest'
import { buildInstructions, type VoiceItem } from './instructions'
import type { ChatTurn } from './agentChat'
import { fallbackSummary, type Turn, type Talk } from './memory'
import { decide, type Alert } from './policy'
import type { SessionDeps } from './session'
import { createToolRunner, voiceToolDeclarations } from './tools'
import { voiceCost } from './usage'

export type HubOut = VoiceEvent
type Session = ReturnType<typeof import('./session').createVoiceSession>

export interface HubDeps {
  key(): string | null
  prefs(): Prefs['voice']
  agents(path: string): AgentLine[]
  needsYou(path: string): string[]
  todos(path: string, f?: { query?: string; status?: string; list?: string; needsYou?: boolean }): { id: string; title: string; status: string; list: string }[]
  todo(path: string, id: string): unknown | null
  workflows(path: string): unknown
  runs(path: string): unknown
  limits(): Promise<unknown>
  usage(path: string, days: number): Promise<unknown>
  agentStats(path: string, name?: string): unknown
  notes(path: string, query: string): string[]
  /** What an agent of the workspace has written lately; null when there is no such agent. */
  chat(path: string, agent: string, count: number): ChatTurn[] | null
  items(ids: string[]): VoiceItem[]
  send(path: string, agent: string, text: string): Promise<void>
  addTodo(path: string, t: { title: string; notes: string }): void
  record(e: LedgerEvent): void
  lastSummary(path: string): string
  saveTalk(path: string, t: Talk): void
  summarize(turns: Turn[]): Promise<string>
  emit(e: HubOut): void
  now(): number
  /** One line of the talk log. */
  log(line: string): void
  makeSession(d: SessionDeps): Session
}

interface Live {
  session: Session
  path: string
  /** The workspace's name: what the usage ledger calls its project. */
  name: string
  startedAt: number
  turns: Turn[]
  newTurn: boolean
  state: VoiceState
  muted: boolean
  lastTalk: number
  lastSpoke: number
  later: Alert[]
  drafts: Map<string, DraftShown>
  /** The agent the person has open in the app. */
  active: string
  /** When messages went out, to keep them to a human pace. */
  sends: number[]
  timers: ReturnType<typeof setTimeout>[]
  /** A re-check of held news is waiting. */
  recheck: boolean
}

/** The voice companion as the main process runs it: one talk at a time, in one workspace, with the agents' news, drafts and the memory of talks around it. */
export function createVoiceHub(d: HubDeps) {
  let cur: Live | null = null
  let draftN = 0

  function speakNow(l: Live, text: string) {
    l.lastSpoke = d.now()
    l.session.context(text, true)
  }
  // Said at the next pause, when the voice has finished and the person is not mid-sentence.
  function flushLater(l: Live) {
    const a = l.later[0]
    if (!a) return
    const v = decide({ alert: a, mode: d.prefs().speak, state: l.state, sinceTalkMs: d.now() - l.lastTalk, sinceSpokeMs: d.now() - l.lastSpoke, muted: l.muted })
    if (v === 'speak') (l.later.shift(), speakNow(l, a.text))
    else if (v === 'silent') (l.later.shift(), l.session.context(a.text, false))
    else scheduleRecheck(l)
  }
  // Held news is looked at again soon: the person may simply have stopped talking, with no turn of the voice's own to end.
  function scheduleRecheck(l: Live) {
    if (l.recheck) return
    l.recheck = true
    const t = setTimeout(() => {
      l.recheck = false
      if (cur === l) flushLater(l)
    }, 2500)
    t.unref?.()
    l.timers.push(t)
  }

  function onOut(l: Live, e: VoiceOut) {
    if (e.type === 'state') {
      if (e.state !== l.state || e.muted !== l.muted) d.log(`state ${e.state}${e.muted ? ' (muted)' : ''}`)
      ;((l.state = e.state), (l.muted = e.muted))
    }
    if (e.type === 'notice' || e.type === 'error') d.log(`${e.type} ${e.text}`)
    if (e.type === 'caption') {
      if (e.who === 'you') l.lastTalk = d.now()
      const last = l.turns.at(-1)
      if (last && last.who === e.who && !l.newTurn) last.text += e.text
      else (l.turns.push({ who: e.who, text: e.text }), (l.newTurn = false))
    }
    if (e.type === 'turnComplete') ((l.newTurn = true), flushLater(l))
    if (e.type === 'usage') {
      const usd = voiceCost(e.usage)
      if (usd > 0) d.record({ k: 'cost', t: d.now(), agent: 'voice', project: l.name, model: d.prefs().model, usd, provider: 'gemini', name: 'Voice', est: true })
    }
    d.emit(e)
  }

  async function start(path: string, name: string, active?: string): Promise<{ ok: true } | { ok: false; reason: 'nokey' }> {
    if (!d.key()) return { ok: false, reason: 'nokey' }
    if (cur) await stop('a new talk began')
    const p = d.prefs()
    const l: Live = { session: undefined as unknown as Session, path, name, startedAt: d.now(), turns: [], newTurn: false, state: 'idle', muted: false, lastTalk: -Infinity, lastSpoke: -Infinity, later: [], drafts: new Map(), active: active ?? '', sends: [], timers: [], recheck: false }
    const items = d.items(p.items)
    const agentsOf = () => d.agents(path).map((a) => (a.name === l.active ? { ...a, open: true } : a))
    const digest = () => buildDigest({ workspace: name, agents: agentsOf(), todos: d.todos(path).map((t) => t.title).slice(0, 8), needsYou: d.needsYou(path), notes: d.notes(path, '').slice(0, 3) })
    // Messages leave at a human pace: more than eight in a minute is a loop, not a person.
    const pace = () => {
      const t = d.now()
      l.sends = l.sends.filter((x) => t - x < 60_000)
      if (l.sends.length >= 8) throw new Error('Messages are going out too fast. Wait a moment.')
      l.sends.push(t)
    }
    const deliver = async (to: string, text: string) => {
      pace()
      await d.send(path, to, text)
      d.log(`sent to ${to}`)
    }
    const run = createToolRunner({
      agents: agentsOf,
      todos: (f) => d.todos(path, f),
      todo: (id) => d.todo(path, id),
      workflows: () => d.workflows(path),
      workflowRuns: () => d.runs(path),
      limits: () => d.limits(),
      usage: (days) => d.usage(path, days),
      agentStats: (who) => d.agentStats(path, who),
      recall: (q) => d.notes(path, q),
      playbookItem: (id) => items.find((i) => i.id === id)?.text ?? null,
      readAgent: (who, count) => d.chat(path, who, count),
      sendMessage: async (to, text) => {
        // The person speaking the request is the yes. Only when they chose to confirm first does it wait for a click.
        if (d.prefs().confirm) {
          const draft: DraftShown = { id: `d${++draftN}`, kind: 'message', to, text }
          l.drafts.set(draft.id, draft)
          d.emit({ type: 'draft', draft })
          return { drafted: true, note: 'Shown to the person on screen; it is sent when they press Send.' }
        }
        const busy = agentsOf().find((a) => a.name === to)?.state === 'working'
        await deliver(to, text)
        return { sent: true, to, busy, ...(busy ? { note: 'It was busy, so this waits in its queue until it is free.' } : {}) }
      },
      addTodo: async (title, notes) => {
        if (d.prefs().confirm) {
          const draft: DraftShown = { id: `d${++draftN}`, kind: 'todo', title, text: notes }
          l.drafts.set(draft.id, draft)
          d.emit({ type: 'draft', draft })
          return { drafted: true, note: 'Shown to the person on screen; it is added when they press Add.' }
        }
        d.addTodo(path, { title, notes })
        d.log('todo added')
        return { added: true }
      }
    })
    const runTool = async (tool: string, args: Record<string, unknown>) => (d.log(`tool ${tool}`), run(tool, args))
    // Told again, silently, to a session that had to start clean: the workspace and what was said so far in this talk.
    const retell = () => {
      l.session.context(digest(), false)
      const recap = fallbackSummary(l.turns)
      if (recap) l.session.context(`Earlier in this talk:\n${recap}`, false)
    }
    l.session = d.makeSession({
      // The connection itself is made by the factory in the app; the hub only supplies what the talk is about.
      connect: undefined as never,
      model: p.model,
      voice: 'Puck',
      instructions: buildInstructions({ workspace: name, items, extra: p.extra, lastSummary: d.lastSummary(path) }),
      tools: [{ functionDeclarations: voiceToolDeclarations }],
      runTool,
      emit: (e) => onOut(l, e),
      onFresh: retell
    })
    cur = l
    d.log(`start ${name} (${p.model}, ${p.mode})`)
    await l.session.start()
    l.state = l.session.state()
    l.session.context(digest(), false)
    // A talk has a time limit: a warning at four fifths of it, and the end.
    if (p.capMinutes > 0) {
      const ms = p.capMinutes * 60_000
      const warn = setTimeout(() => d.emit({ type: 'notice', text: `${Math.max(1, Math.round(p.capMinutes * 0.2))} minutes left in this talk.` }), ms * 0.8)
      const end = setTimeout(() => (d.emit({ type: 'notice', text: 'Time limit reached. The talk has ended.' }), void stop('time limit')), ms)
      warn.unref?.(); end.unref?.()
      l.timers.push(warn, end)
    }
    return { ok: true }
  }

  async function stop(reason = 'the person ended it') {
    const l = cur
    if (!l) return
    cur = null
    d.log(`stop (${reason})`)
    l.timers.forEach(clearTimeout)
    l.session.end()
    const summary = l.turns.length ? await d.summarize(l.turns) : ''
    if (summary) d.saveTalk(l.path, { at: l.startedAt, summary, turns: l.turns.length })
    d.emit({ type: 'ended', summary })
  }

  return {
    start,
    stop,
    active: () => cur !== null,
    audio: (b64: string) => cur?.session.audio(b64),
    audioEnd: () => cur?.session.audioEnd(),
    mute: (on: boolean) => cur?.session.mute(on),
    /** News about an agent of the talk's own workspace: said now, at the next pause, or just let known. */
    alert(path: string, a: Alert) {
      const l = cur
      if (!l || l.path !== path) return
      const v = decide({ alert: a, mode: d.prefs().speak, state: l.state, sinceTalkMs: d.now() - l.lastTalk, sinceSpokeMs: d.now() - l.lastSpoke, muted: l.muted })
      d.log(`alert ${a.kind} ${a.agent}: ${v}`)
      if (v === 'speak') speakNow(l, a.text)
      else if (v === 'later') (l.later.push(a), l.later.length > 5 && l.later.shift(), scheduleRecheck(l))
      else l.session.context(a.text, false)
    },
    /** The person opened another agent in the app. */
    focus(agent: string) {
      const l = cur
      if (!l || !agent || agent === l.active) return
      l.active = agent
      l.session.context(`The person now has agent ${agent} open in the app.`, false)
    },
    async draftSend(id: string) {
      const l = cur
      const x = l?.drafts.get(id)
      if (!l || !x) throw new Error('No such draft.')
      // The draft goes only once it is done, so a send that fails can be tried again from the same card.
      if (x.kind === 'message') {
        await d.send(l.path, x.to!, x.text)
        d.log(`sent to ${x.to}`)
      } else d.addTodo(l.path, { title: x.title!, notes: x.text })
      l.drafts.delete(id)
      d.emit({ type: 'draftGone', id })
    },
    draftDiscard(id: string) {
      if (cur?.drafts.delete(id)) d.emit({ type: 'draftGone', id })
    }
  }
}
