import { randomUUID } from 'node:crypto'
import { noReplyTail, replyTail } from '../shared/mail'
import type { BroadcastState } from '../shared/mail'
import type { AgentMessage } from '../shared/types'

interface AgentInfo {
  id: string
  name: string
  online: boolean
  /** The project the agent works in: names are only unique inside one. */
  repoPath?: string
}

interface Deps {
  agents: () => AgentInfo[]
  /** Type the text into the recipient's terminal as its next prompt. */
  deliver: (agentId: string, text: string) => void
  notify: (m: AgentMessage) => void
  now?: () => number
}

// Two agents replying to each other's replies can loop forever; past this the user decides.
const PAIR_LIMIT = 6
const PAIR_WINDOW_MS = 10 * 60 * 1000

// 'starting': the TUI is not accepting input yet, so treat it like busy.
type State = 'starting' | 'idle' | 'busy'

// Messages are pasted into another agent's terminal. Escape sequences (a paste terminator above all) and
// control bytes such as CR would let a sender type raw keystrokes there, so only printable text, tab and
// newline survive.
const unsafe = (s: string) => s.replace(/\x1b\[20[01]~/g, '').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, ' ')

export function formatDelivery(fromName: string, rawText: string, expectsReply: boolean) {
  const text = unsafe(rawText)
  const tail = expectsReply ? replyTail(fromName) : noReplyTail
  return `[Agent World] Message from ${fromName}: ${text}\n\n${tail}`
}

/** A broadcast as the recipient reads it: who sent it, who else was told (so they need not tell each other), and how to answer the sender. */
export function formatBroadcast(fromName: string, rawText: string, expectsReply: boolean, also: string[]) {
  const tail = expectsReply ? replyTail(fromName) : noReplyTail
  return `[Agent World] Broadcast from ${fromName}${also.length ? ` (also sent to: ${also.join(', ')})` : ''}: ${unsafe(rawText)}\n\n${tail}`
}

export interface BroadcastResult {
  id: string
  name: string
  status: BroadcastState
  /** Why nothing was sent, for asleep and limit. */
  reason?: string
}

/** Agent-to-agent mail: straight into an idle recipient's prompt, otherwise held until its turn ends. */
export class Mailbox {
  private readonly state = new Map<string, State>()
  private readonly queues = new Map<string, AgentMessage[]>()
  private readonly expects = new Map<string, boolean>()
  /** What a broadcast's copy says when it is typed in, by message id, since it names who else was told. */
  private readonly rendered = new Map<string, string>()
  /** Messages from the office itself (an answer to a plan), by agent: they go before mail from agents. */
  private readonly office = new Map<string, string[]>()
  /** What the person typed in the app for an agent that was not ready to take it (the first message to a new agent), by agent. */
  private readonly person = new Map<string, string[]>()
  private readonly history: { pair: string; at: number }[] = []

  constructor(private readonly deps: Deps) {}

  send(fromId: string, toName: string, text: string, o: { expectsReply?: boolean } = {}): 'delivered' | 'queued' {
    const all = this.deps.agents()
    const named = all.filter((a) => a.name.toLowerCase() === toName.trim().toLowerCase())
    // The same name can be in two projects: the sender means its own project's, and elsewhere a name must be only one agent's.
    const mine = all.find((a) => a.id === fromId)?.repoPath
    const near = named.filter((a) => a.repoPath === mine)
    const to = near.length === 1 ? near[0] : named.length > 1 ? undefined : named[0]
    if (!to && named.length > 1) throw new Error(`There is more than one agent named ${toName} in the office. Use list_agents and ask the user which one is meant.`)
    if (!to) throw new Error(`No agent named ${toName}. Use list_agents to see who is in the office.`)
    if (to.id === fromId) throw new Error('You cannot send a message to yourself.')
    if (!to.online) throw new Error(`${to.name} is not running right now; ask the user to wake it, or try later.`)
    const now = (this.deps.now ?? Date.now)()
    const pair = [fromId, to.id].sort().join('|')
    while (this.history[0] && now - this.history[0].at > PAIR_WINDOW_MS) this.history.shift()
    if (this.history.filter((h) => h.pair === pair).length >= PAIR_LIMIT)
      throw new Error(`Message limit reached between you and ${to.name} (${PAIR_LIMIT} in 10 minutes). Stop and ask the user how to proceed.`)
    this.history.push({ pair, at: now })
    const m: AgentMessage = { id: randomUUID(), fromId, toId: to.id, text, status: 'queued', at: now }
    this.expects.set(m.id, o.expectsReply ?? true)
    const queue = this.queues.get(to.id) ?? []
    queue.push(m)
    this.queues.set(to.id, queue)
    this.deps.notify(m)
    this.flush(to.id)
    return m.status === 'delivered' ? 'delivered' : 'queued'
  }

  /**
   * One message to every other agent of the sender's project. An idle agent gets it at once and a busy one when its turn ends; one that is not running is only
   * marked asleep (only the person can wake it), and one over the message limit with the sender is marked too. Nothing waits for replies: they come back as mail.
   */
  broadcast(fromId: string, text: string, o: { expectsReply?: boolean } = {}): { id: string; results: BroadcastResult[] } {
    const all = this.deps.agents()
    const me = all.find((a) => a.id === fromId)
    if (!me) throw new Error('Unknown agent.')
    const others = all.filter((a) => a.id !== fromId && a.repoPath === me.repoPath)
    if (others.length === 0) throw new Error('There is no other agent in this project to tell.')
    const now = (this.deps.now ?? Date.now)()
    while (this.history[0] && now - this.history[0].at > PAIR_WINDOW_MS) this.history.shift()
    const id = randomUUID()
    const pairOf = (to: string) => [fromId, to].sort().join('|')
    const blocked = new Map<string, { status: 'asleep' | 'limit'; reason: string }>()
    for (const to of others) {
      if (!to.online) blocked.set(to.id, { status: 'asleep', reason: 'only the person can wake it' })
      else if (this.history.filter((h) => h.pair === pairOf(to.id)).length >= PAIR_LIMIT) blocked.set(to.id, { status: 'limit', reason: `${PAIR_LIMIT} messages in 10 minutes with you` })
    }
    const told = others.filter((a) => !blocked.has(a.id))
    const results: BroadcastResult[] = []
    for (const to of others) {
      const stop = blocked.get(to.id)
      const m: AgentMessage = { id: randomUUID(), fromId, toId: to.id, text, status: stop?.status ?? 'queued', at: now, broadcast: id, ...(stop && { reason: stop.reason }) }
      if (stop) {
        this.deps.notify(m)
        results.push({ id: to.id, name: to.name, status: stop.status, reason: stop.reason })
        continue
      }
      this.history.push({ pair: pairOf(to.id), at: now })
      this.expects.set(m.id, o.expectsReply ?? true)
      this.rendered.set(m.id, formatBroadcast(me.name, text, o.expectsReply ?? true, told.filter((a) => a.id !== to.id).map((a) => a.name)))
      const queue = this.queues.get(to.id) ?? []
      queue.push(m)
      this.queues.set(to.id, queue)
      this.deps.notify(m)
      this.flush(to.id)
      results.push({ id: to.id, name: to.name, status: m.status === 'delivered' ? 'delivered' : 'queued' })
    }
    return { id, results }
  }

  /** The office tells an agent something (the person's answer to its plan). No reply is asked for. */
  fromOffice(agentId: string, text: string) {
    this.office.set(agentId, [...(this.office.get(agentId) ?? []), text])
    this.flush(agentId)
  }

  /** The person's own message, sent for them once the agent can take it, as they wrote it: no prefix, since it is their turn to speak. */
  fromPerson(agentId: string, text: string) {
    this.person.set(agentId, [...(this.person.get(agentId) ?? []), text])
    this.flush(agentId)
  }

  pending(agentId: string) {
    return this.queues.get(agentId)?.length ?? 0
  }

  ready(agentId: string) {
    this.turnEnded(agentId)
  }

  /** The terminal is showing its input box for the first time; only matters while still starting up. */
  started(agentId: string) {
    if ((this.state.get(agentId) ?? 'starting') === 'starting') this.turnEnded(agentId)
  }

  /** Whether the agent has not shown its input box yet (just started, relaunched, or not known): what is typed into its terminal now would be lost. */
  isStarting(agentId: string) {
    return (this.state.get(agentId) ?? 'starting') === 'starting'
  }

  /** The terminal is being relaunched; hold mail (don't drop it) until the new one shows its input box. */
  restarting(agentId: string) {
    this.state.set(agentId, 'starting')
  }

  /**
   * The screen says the agent is idle (input box up, no menu, nothing drawn for a while) although no
   * end-of-turn hook arrived, e.g. after Esc. Delivers any mail that was waiting.
   */
  looksIdle(agentId: string) {
    if (this.state.get(agentId) === 'busy') this.turnEnded(agentId)
  }

  busy(agentId: string) {
    this.state.set(agentId, 'busy')
  }

  turnEnded(agentId: string) {
    this.state.set(agentId, 'idle')
    this.flush(agentId)
  }

  gone(agentId: string) {
    for (const m of this.queues.get(agentId) ?? []) (this.rendered.delete(m.id), this.expects.delete(m.id), this.deps.notify({ ...m, status: 'dropped' }))
    this.queues.delete(agentId)
    this.office.delete(agentId)
    this.person.delete(agentId)
    this.state.set(agentId, 'starting')
  }

  private flush(agentId: string) {
    if ((this.state.get(agentId) ?? 'starting') !== 'idle') return
    const said = this.person.get(agentId)?.shift()
    if (said !== undefined) {
      this.state.set(agentId, 'busy')
      return this.deps.deliver(agentId, unsafe(said))
    }
    const note = this.office.get(agentId)?.shift()
    if (note !== undefined) {
      this.state.set(agentId, 'busy')
      return this.deps.deliver(agentId, `[Agent World] ${unsafe(note)}`)
    }
    const m = this.queues.get(agentId)?.shift()
    if (!m) return
    const from = this.deps.agents().find((a) => a.id === m.fromId)?.name ?? 'another agent'
    // The delivered message starts the recipient's next turn.
    this.state.set(agentId, 'busy')
    this.deps.deliver(agentId, this.rendered.get(m.id) ?? formatDelivery(from, m.text, this.expects.get(m.id) ?? true))
    this.expects.delete(m.id)
    this.rendered.delete(m.id)
    m.status = 'delivered'
    this.deps.notify(m)
  }
}
