import type { ChatItem, SubagentInfo } from '../shared/chat'
import type { SpawnInput, SubagentResult } from './mcpServer'
import { type Limits, checkSpawn, childInfo, finalReport, subagentPrompt } from './subagentSpawn'

interface Rec {
  id: string
  name: string
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
}

const POLL_MS = 1500

/** Agents starting agents as their subagents: either program can start either, and the child shows in its parent's list of subagents. */
export function createSubagents<A extends Rec>(d: SubagentDeps<A>) {
  const sleep = d.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const cut = new Set<string>()
  const children = (parentId: string) => d.agents().filter((a) => a.parent === parentId)
  const report = (id: string) => finalReport(d.items(id), d.idle(id))
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
  // The first of these to finish, or the first already finished.
  async function firstDone(ids: string[]): Promise<A> {
    for (;;) {
      const done = ids.map((id) => d.byId(id)).find((c) => c && finished(c.id))
      if (done) return done
      await sleep(POLL_MS)
    }
  }

  return {
    async spawn(callerId: string, i: SpawnInput): Promise<SubagentResult> {
      const parent = d.byId(callerId)
      const running = new Set(children(callerId).filter((c) => !finished(c.id)).map((c) => c.id))
      const why = checkSpawn(d.agents(), callerId, running, d.limits?.())
      if (why || !parent) throw new Error(why ?? 'Unknown agent.')
      const child = await d.create(parent, i)
      d.deliver(child, subagentPrompt(i.task, parent.name, { branch: child.branch, worktree: i.worktree !== false && child.branch !== null }))
      if (i.background) return result(child)
      await firstDone([child.id])
      return result(child)
    },
    async wait(callerId: string, ids: string[]): Promise<SubagentResult> {
      for (const id of ids) mine(callerId, id)
      return result(await firstDone(ids))
    },
    stop(callerId: string, id: string): string {
      const c = mine(callerId, id)
      cut.add(c.id)
      d.stop(c.id)
      return `Stopped ${c.name}.`
    },
    /** The children of an agent, as its list of subagents shows them. */
    infos: (parentId: string): SubagentInfo[] => children(parentId).map((c) => childInfo(c, d.items(c.id), d.idle(c.id), d.alive(c.id))),
    /** One child's conversation, for its parent only. */
    conversation: (parentId: string, id: string): ChatItem[] => (d.byId(id)?.parent === parentId ? d.items(id) : [])
  }
}
