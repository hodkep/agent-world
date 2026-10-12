import { randomUUID } from 'node:crypto'
import { noReplyTail, replyTail } from '../shared/mail'
import type { AgentMessage } from '../shared/types'

interface AgentInfo {
  id: string
  name: string
  online: boolean
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

/** Agent-to-agent mail: straight into an idle recipient's prompt, otherwise held until its turn ends. */
export class Mailbox {
  private readonly state = new Map<string, State>()
  private readonly queues = new Map<string, AgentMessage[]>()
  private readonly expects = new Map<string, boolean>()
  /** Messages from the office itself (an answer to a plan), by agent: they go before mail from agents. */
  private readonly office = new Map<string, string[]>()
  private readonly history: { pair: string; at: number }[] = []

  constructor(private readonly deps: Deps) {}

  send(fromId: string, toName: string, text: string, o: { expectsReply?: boolean } = {}): 'delivered' | 'queued' {
    const all = this.deps.agents()
    const to = all.find((a) => a.name.toLowerCase() === toName.trim().toLowerCase())
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

  /** The office tells an agent something (the person's answer to its plan). No reply is asked for. */
  fromOffice(agentId: string, text: string) {
    this.office.set(agentId, [...(this.office.get(agentId) ?? []), text])
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
    for (const m of this.queues.get(agentId) ?? []) this.deps.notify({ ...m, status: 'dropped' })
    this.queues.delete(agentId)
    this.office.delete(agentId)
    this.state.set(agentId, 'starting')
  }

  private flush(agentId: string) {
    if ((this.state.get(agentId) ?? 'starting') !== 'idle') return
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
    this.deps.deliver(agentId, formatDelivery(from, m.text, this.expects.get(m.id) ?? true))
    this.expects.delete(m.id)
    m.status = 'delivered'
    this.deps.notify(m)
  }
}
