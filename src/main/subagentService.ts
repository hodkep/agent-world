import type { ChatItem, SubagentInfo } from '../shared/chat'
import type { SpawnInput, SubagentResult } from './mcpServer'
import { type Limits, checkSpawn, childInfo, finalReport, subagentPrompt } from './subagentSpawn'

interface Rec {
  id: string
  name: string
  hiredAt?: number
  provider?: string
  branch: string | null
  parent?: string
  task?: string
}

/** What the office has to supply: the agent records, making one, and what it is doing. Kept apart so the rules can be tested without a program running. */
export interface SubagentDeps<A extends Rec> {
  agents: () => A[]
  byId: (id: string) => A | undefined
  /** Makes the child agent (its branch and folder, its program) and starts it. */
  create: (parent: A, i: SpawnInput) => Promise<A>
  /** Gives the child its first message. */
  deliver: (child: A, text: string) => void
  items: (id: string) => ChatItem[]
  idle: (id: string) => boolean
  /** The child's program is still running. */
  alive: (id: string) => boolean
  stop: (id: string) => void
  sleep?: (ms: number) => Promise<void>
  /** How deep and how many at once, read at each call so a change in Settings counts at once. */
  limits?: () => Limits
  /** How long one call holds on for the answer. A program gives up on a tool call after about a minute, so a longer job is waited for in turns. */
  waitMs?: number
  now?: () => number
  /** The office is told a subagent came or went, so it can be shown at work with the agent that asked for it. */
  announce?: (what: 'start' | 'stop', parent: A, child: A) => void
}

const POLL_MS = 1500
/** Held on to for less than the minute a program waits for a tool, with room for it to be told. */
const WAIT_MS = 45_000

/** Agents starting agents as their subagents: either program can start either, and the child shows in its parent's list of subagents. */
export function createSubagents<A extends Rec>(d: SubagentDeps<A>) {
  const sleep = d.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const cut = new Set<string>()
  // Which have been announced as started, and which as gone.
  const here = new Set<string>()
  const children = (parentId: string) => d.agents().filter((a) => a.parent === parentId)
  // Whoever has answered stays answered: once its program is stopped it no longer looks idle.
  const answered = new Set<string>()
  const report = (id: string) => {
    const r = finalReport(d.items(id), d.idle(id) || answered.has(id))
    if (r !== null) answered.add(id)
    return r
  }
  const finished = (id: string) => report(id) !== null || cut.has(id) || !d.alive(id)
  const mine = (callerId: string, id: string) => {
    const c = d.byId(id)
    if (!c || c.parent !== callerId) throw new Error(`${id} is not your subagent.`)
    return c
  }
  const result = (c: A): SubagentResult => {
    const r = report(c.id)
    if (r !== null) return { id: c.id, name: c.name, status: 'done', branch: c.branch, report: r }
    if (cut.has(c.id) || !d.alive(c.id)) return { id: c.id, name: c.name, status: 'stopped', branch: c.branch, report: cut.has(c.id) ? 'The subagent was stopped before it answered.' : 'The subagent ended without answering.' }
    return { id: c.id, name: c.name, status: 'working', branch: c.branch }
  }
  const now = d.now ?? Date.now
  // The first of these to finish, or the first already finished; null when none has within the time one call may take.
  async function firstDone(ids: string[]): Promise<A | null> {
    const until = now() + (d.waitMs ?? WAIT_MS)
    for (;;) {
      const done = ids.map((id) => d.byId(id)).find((c) => c && finished(c.id))
      if (done) return done
      if (now() >= until) return null
      await sleep(POLL_MS)
    }
  }
  const later = (c: A): SubagentResult => ({ ...result(c), note: `Still working. Call await_subagents with the id ${c.id} to keep waiting for it; do not start it again.` })

  return {
    async spawn(callerId: string, i: SpawnInput): Promise<SubagentResult> {
      const parent = d.byId(callerId)
      const running = new Set(children(callerId).filter((c) => !finished(c.id)).map((c) => c.id))
      const why = checkSpawn(d.agents(), callerId, running, d.limits?.())
      if (why || !parent) throw new Error(why ?? 'Unknown agent.')
      const child = await d.create(parent, i)
      here.add(child.id)
      d.announce?.('start', parent, child)
      d.deliver(child, subagentPrompt(i.task, parent.name, { branch: child.branch, worktree: i.worktree !== false && child.branch !== null }))
      if (i.background) return result(child)
      return (await firstDone([child.id])) ? result(child) : later(child)
    },
    async wait(callerId: string, ids: string[]): Promise<SubagentResult> {
      for (const id of ids) mine(callerId, id)
      const done = await firstDone(ids)
      return done ? result(done) : later(d.byId(ids[0]!)!)
    },
    stop(callerId: string, id: string): string {
      const c = mine(callerId, id)
      cut.add(c.id)
      d.stop(c.id)
      return `Stopped ${c.name}.`
    },
    /** Called every so often: a subagent that has answered, was stopped or ended is announced as gone, once. */
    tick(): void {
      for (const id of [...here]) {
        const c = d.byId(id)
        const parent = c?.parent ? d.byId(c.parent) : undefined
        if (c && parent && !finished(id)) continue
        here.delete(id)
        if (c && parent) d.announce?.('stop', parent, c)
        // It has given its answer: its program has nothing left to do, so it is stopped (its conversation stays to be read).
        if (c && d.alive(id)) d.stop(id)
      }
    },
    /** The children of an agent, as its list of subagents shows them. */
    infos: (parentId: string): SubagentInfo[] => children(parentId).map((c) => childInfo(c, d.items(c.id), d.idle(c.id) || answered.has(c.id), d.alive(c.id))),
    /** One child's conversation, for its parent only. */
    conversation: (parentId: string, id: string): ChatItem[] => (d.byId(id)?.parent === parentId ? d.items(id) : [])
  }
}
