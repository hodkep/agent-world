import { randomUUID } from 'node:crypto'
import { readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import type { Activity, AgentEvent, AgentRecord } from '../../../shared/types'
import type { EventHandle, EventSourceOptions, TerminalIO } from '../ports'
import { agyScreen } from './screen'
import { agyHome } from './transcript'

const POLL_MS = 500

export interface Deps {
  /** Conversations agy has started, newest first, with the folder each began in. */
  conversations: () => { id: string; workspace: string }[]
  sleep: (ms: number) => Promise<void>
}

/** agy appends a line per prompt to its history; the newest line of each conversation says where it runs. */
function historyConversations() {
  try {
    const seen = new Map<string, string>()
    for (const l of readFileSync(join(agyHome(), 'history.jsonl'), 'utf8').split('\n').reverse()) {
      try {
        const o = JSON.parse(l) as { conversationId?: string; workspace?: string }
        if (o.conversationId && o.workspace && !seen.has(o.conversationId)) seen.set(o.conversationId, o.workspace)
      } catch {
        /* a half-written last line */
      }
    }
    return [...seen].map(([id, workspace]) => ({ id, workspace }))
  } catch {
    return []
  }
}

const same = (a: string, b: string) => {
  const real = (p: string) => {
    try {
      return realpathSync(p)
    } catch {
      return p
    }
  }
  return a === b || real(a) === real(b)
}

interface Seen {
  activity: Activity | null
  question: string | null
  requestId: string | null
}

/**
 * agy sends no events, so what it is doing is read from its screen, as often as the screen changes hands:
 * working, idle, or asking permission (which becomes a card in the office, answered by pressing keys).
 */
export function createAgyEvents(o: EventSourceOptions, deps: Deps) {
  const term = o.terminal!
  const seen = new Map<string, Seen>()
  const pending = new Map<string, { agentId: string }>()

  const io = (id: string): TerminalIO => ({ screen: () => term.screen(id), write: (k) => term.write(id, k), sleep: deps.sleep })
  const say = (e: AgentEvent) => o.onEvent(e)

  /** An agent that has not named its conversation yet is matched to the newest one that began in its own folder, and is not another agent's. */
  function resolve(a: AgentRecord): boolean {
    if (a.started) return true
    const taken = new Set(term.agents().filter((x) => x !== a && x.started).map((x) => x.sessionId))
    const hit = deps.conversations().find((c) => !taken.has(c.id) && same(c.workspace, a.cwd))
    if (!hit) return false
    o.onSession?.(a.id, hit.id)
    return true
  }

  function look(a: AgentRecord) {
    const screen = term.screen(a.id)
    if (!screen) return
    const s = seen.get(a.id) ?? { activity: null, question: null, requestId: null }
    seen.set(a.id, s)
    const menu = agyScreen.genericMenu(screen)
    let activity: Activity | null = null
    if (menu) activity = 'permission'
    else if (agyScreen.looksWorking(screen)) activity = /^\s*[⠀-⣿]\s+Running/m.test(screen) ? 'running' : 'thinking'
    else if (agyScreen.inputReady(screen)) activity = 'idle'
    // The first event marks the agent started, and a restart resumes by its conversation: so nothing is said before that is known.
    if (activity && !resolve(a)) return

    if (menu && s.question !== menu.context) {
      s.question = menu.context
      s.requestId = randomUUID()
      pending.set(s.requestId, { agentId: a.id })
      o.onPermission({ id: s.requestId, agentId: a.id, sessionId: a.sessionId, tool: 'Bash', detail: menu.context })
    } else if (!menu && s.requestId) {
      pending.delete(s.requestId)
      o.onPermissionSettled(s.requestId)
      s.requestId = null
      s.question = null
    }
    if (activity && activity !== s.activity) {
      s.activity = activity
      say({ type: 'activity', agentId: a.id, sessionId: a.sessionId, activity, ...(menu && { tool: 'Bash', detail: menu.context }) })
    }
  }

  const handle: EventHandle = {
    url: '',
    decide(requestId, d) {
      const p = pending.get(requestId)
      if (!p) return
      // Choosing "Yes, run command" walks the menu with the screen in view; refusing is Esc, which agy treats as "No, cancel".
      if (d === 'allow') void agyScreen.answerMenu(io(p.agentId), (scr) => {
        const m = agyScreen.genericMenu(scr)
        return m ? { highlighted: m.highlighted } : null
      }, 0)
      else term.write(p.agentId, '\x1b')
    },
    dismiss(agentId) {
      for (const [id, p] of pending) if (p.agentId === agentId) (pending.delete(id), o.onPermissionSettled(id))
      const s = seen.get(agentId)
      if (s) ((s.requestId = null), (s.question = null))
    },
    hasPending: (agentId) => [...pending.values()].some((p) => p.agentId === agentId),
    close: () => {}
  }
  return { tick: () => term.agents().forEach(look), handle }
}

export const agyEvents = {
  async start(o: EventSourceOptions): Promise<EventHandle> {
    const { tick, handle } = createAgyEvents(o, { conversations: historyConversations, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) })
    const timer = setInterval(tick, POLL_MS)
    return { ...handle, close: () => clearInterval(timer) }
  }
}
