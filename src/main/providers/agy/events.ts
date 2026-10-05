import { randomUUID } from 'node:crypto'
import { readdirSync, realpathSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Activity, AgentEvent, AgentRecord } from '../../../shared/types'
import type { EventHandle, EventSourceOptions, TerminalIO } from '../ports'
import { agyScreen } from './screen'
import { agyHome, agyTranscript, conversationWorkspace } from './transcript'

const POLL_MS = 500
/** The conversation file is read every this many looks (about every ten seconds). */
const USAGE_EVERY = 20

export interface Conversation {
  id: string
  /** When agy created its file. */
  bornAt: number
  /** The folder it runs in, once its first step is saved; unknown before that. */
  workspace?: string
}

export interface Deps {
  conversations: () => Conversation[]
  /** Tokens used so far in an agent's conversation. */
  usage: (a: AgentRecord) => { input: number; output: number; context: number } | null
  sleep: (ms: number) => Promise<void>
}

/** Conversations agy keeps, newest first. Its file appears as soon as the session starts, but says nothing of the folder until the first step is saved. */
function savedConversations(): Conversation[] {
  const dir = join(agyHome(), 'conversations')
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.db'))
      .map((f) => ({ id: f.slice(0, -3), bornAt: statSync(join(dir, f)).birthtimeMs }))
      .sort((a, b) => b.bornAt - a.bornAt)
      .slice(0, 30)
      .map((c) => ({ ...c, workspace: conversationWorkspace(c.id) }))
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

/** What the question is about: a command, or a tool of a connected server (named in the question). */
const toolOf = (m: { title: string; context: string }) => (m.title === 'MCP' ? m.context.split('\n')[0]! : 'Bash')

interface Seen {
  readAt?: number
  usage?: { input: number; output: number; context: number } | null
  model: string | null
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
  let turn = 0
  const seen = new Map<string, Seen>()
  const pending = new Map<string, { agentId: string; question: string }>()

  const io = (id: string): TerminalIO => ({ screen: () => term.screen(id), write: (k) => term.write(id, k), sleep: deps.sleep })
  const say = (e: AgentEvent) => o.onEvent(e)

  /** An agent that has not named its conversation yet is matched to the newest one that began in its own folder, and is not another agent's. */
  function resolve(a: AgentRecord): boolean {
    if (a.started) return true
    const taken = new Set(term.agents().filter((x) => x !== a && x.started).map((x) => x.sessionId))
    const since = term.startedAt(a.id) - 300
    // agy creates the file as the session starts but names the folder only with the first saved step: a file with no folder yet
    // belongs to the oldest session started since this terminal began, and one with a folder must be this agent's.
    const hit = deps
      .conversations()
      .filter((c) => !taken.has(c.id) && c.bornAt >= since && (c.workspace === undefined || same(c.workspace, a.cwd)))
      .at(-1)
    if (!hit) return false
    if (hit.id !== a.sessionId) o.onSession?.(a.id, hit.id)
    return true
  }

  function look(a: AgentRecord) {
    const screen = term.screen(a.id)
    if (!screen) return
    const s = seen.get(a.id) ?? { model: null, activity: null, question: null, requestId: null }
    seen.set(a.id, s)
    // What the footer names is the nearest thing agy gives to statistics: the model and its effort.
    const shown = agyScreen.readModel?.(screen)
    // The conversation file is read the first time and then every so often: it is the only place agy records tokens.
    const due = a.started && turn - (s.readAt ?? -USAGE_EVERY) >= USAGE_EVERY
    if (due) s.readAt = turn
    if (due) s.usage = deps.usage(a) ?? s.usage
    const key = `${shown?.model}|${shown?.effort}|${s.usage?.input}|${s.usage?.output}`
    if (shown && key !== s.model && resolve(a)) {
      s.model = key
      // Each report replaces the last, so the tokens go with every one.
      o.onStatus({ sessionId: a.sessionId, model: shown.model, effort: shown.effort, contextPct: null, costUsd: 0, linesAdded: 0, linesRemoved: 0, fast: false, limits: { fiveHour: null, sevenDay: null }, ...(s.usage && { tokens: s.usage }) }, a.id)
    }
    const menu = agyScreen.genericMenu(screen)
    let activity: Activity | null = null
    if (menu) activity = 'permission'
    // A question the app will not draw a card for (its text imitates agy's own box) still waits on the user, in the terminal.
    else if (agyScreen.anyMenu(screen) && !agyScreen.trustPrompt(screen)) activity = 'permission'
    else if (agyScreen.looksWorking(screen)) activity = /^\s*[⠀-⣿]\s+Running/m.test(screen) ? 'running' : 'thinking'
    else if (agyScreen.inputReady(screen)) activity = 'idle'
    // The first event marks the agent started, and a restart resumes by its conversation: so nothing is said before that is known.
    if (activity && !resolve(a)) return

    if (menu && s.question !== menu.context) {
      s.question = menu.context
      s.requestId = randomUUID()
      pending.set(s.requestId, { agentId: a.id, question: menu.context })
      o.onPermission({ id: s.requestId, agentId: a.id, sessionId: a.sessionId, tool: toolOf(menu), detail: menu.context })
    } else if (!menu && s.requestId) {
      pending.delete(s.requestId)
      o.onPermissionSettled(s.requestId)
      s.requestId = null
      s.question = null
    }
    if (activity && activity !== s.activity) {
      s.activity = activity
      say({ type: 'activity', agentId: a.id, sessionId: a.sessionId, activity, ...(menu ? { tool: toolOf(menu), detail: menu.context } : activity === 'permission' && { detail: 'asks something; answer it in the terminal' }) })
    }
  }

  const handle: EventHandle = {
    url: '',
    decide(requestId, d) {
      const p = pending.get(requestId)
      if (!p) return
      // The answer is for the question the card showed. If agy has moved on to another, nothing is pressed: the new one gets its own card.
      const ofCard = (scr: string) => {
        const m = agyScreen.genericMenu(scr)
        return m && m.context === p.question ? m : null
      }
      if (!ofCard(term.screen(p.agentId))) return
      // Choosing "Yes, run command" walks the menu with the screen in view; refusing is Esc, which agy treats as "No, cancel".
      // Allow presses the first answer, so it must be a "Yes" (Enter on anything else could refuse, or pick "always").
      if (d === 'allow') {
        if (!/^Yes\b/.test(ofCard(term.screen(p.agentId))?.options[0] ?? '')) return
        void agyScreen.answerMenu(io(p.agentId), (scr) => { const m = ofCard(scr); return m ? { highlighted: m.highlighted } : null }, 0)
      }
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
  return { tick: () => (turn++, term.agents().forEach(look)), handle }
}

export const agyEvents = {
  async start(o: EventSourceOptions): Promise<EventHandle> {
    const { tick, handle } = createAgyEvents(o, { conversations: savedConversations, usage: (a) => agyTranscript.usage?.(a) ?? null, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) })
    const timer = setInterval(tick, POLL_MS)
    return { ...handle, close: () => clearInterval(timer) }
  }
}
