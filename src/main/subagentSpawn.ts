import type { ChatItem, SubagentInfo } from '../shared/chat'
import { spawnLabel } from '../shared/spawn'

/** Standing limits, which Settings can change. A child may start children of its own, a grandchild may not. */
export const MAX_DEPTH = 2
/** Children one agent may have working at once. */
export const MAX_RUNNING = 3
export interface Limits {
  maxDepth: number
  maxRunning: number
}
export const DEFAULT_LIMITS: Limits = { maxDepth: MAX_DEPTH, maxRunning: MAX_RUNNING }

interface Tree {
  id: string
  parent?: string
}

/** How many parents are above an agent. A loop in the records counts as too deep rather than running for ever. */
export function depthOf(agents: Tree[], id: string): number {
  let depth = 0
  // A longer chain than any limit can be is a loop.
  for (let at = agents.find((a) => a.id === id); at?.parent; at = agents.find((a) => a.id === at!.parent)) if (++depth > 20) break
  return depth
}

/** Why this agent may not start another subagent now, or null when it may. */
export function checkSpawn(agents: Tree[], parentId: string, running: Set<string>, limits: Limits = DEFAULT_LIMITS): string | null {
  if (!agents.some((a) => a.id === parentId)) return 'Unknown agent.'
  if (depthOf(agents, parentId) >= limits.maxDepth) return `Subagents nest ${limits.maxDepth} deep at most, so this one is too deep to start another. Do the work yourself, or hand it back.`
  const working = agents.filter((a) => a.parent === parentId && running.has(a.id)).length
  if (working >= limits.maxRunning) return `This agent already has ${working} subagents working, which is the most at once. Wait for one to finish (await_subagents), then start the next.`
  return null
}

/** What the child is told when it starts: the task, whose it is, where to work, and that its last message is the answer. */
export function subagentPrompt(task: string, parentName: string, where: { branch: string | null; worktree: boolean }): string {
  const place = where.worktree && where.branch ? `You work on your own branch, ${where.branch}, in a folder of your own: commit your work there.` : 'You share the folder with the agent that asked, so only read: do not edit files or change anything.'
  return `${parentName} asked you to do this as a subagent:\n\n${task}\n\n${place}\nWhen you are finished, your final message is your answer to ${parentName}: say what you did, what you found, and anything left undone. Keep it short and concrete.`
}

/** The child's answer: the last thing it said, once it has been asked something and is idle. */
export function finalReport(items: ChatItem[], idle: boolean): string | null {
  if (!idle) return null
  const asked = items.findIndex((i) => i.kind === 'user')
  if (asked < 0) return null
  const last = items.slice(asked).reverse().find((i) => i.kind === 'assistant')
  return last && last.kind === 'assistant' && last.text.trim() ? last.text.trim() : null
}

const detailOf = (input: Record<string, unknown>) => {
  const v = input.command ?? input.file_path ?? input.pattern ?? input.AbsolutePath ?? input.Path ?? Object.values(input).find((x) => typeof x === 'string')
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').slice(0, 60) : ''
}

/** A child agent as the parent's list of subagents shows it. Its provider is its type, so the chip says which program runs it. */
export function childInfo(child: { id: string; provider?: string; task?: string; hiredAt?: number }, items: ChatItem[], idle: boolean, alive: boolean, now = Date.now(), model?: string): SubagentInfo {
  const report = finalReport(items, idle)
  const first = items.find((i) => i.kind === 'user')
  return {
    agentId: child.id,
    toolUseId: `spawn:${child.id}`,
    type: child.provider ?? 'claude',
    description: spawnLabel(child.task ?? ''),
    startedAt: first?.at ?? child.hiredAt ?? now,
    // One that is still working is working now, however long its step takes; the chat would call it stopped after a quiet spell.
    updatedAt: report === null && alive ? now : (items.at(-1)?.at ?? first?.at ?? 0),
    done: report !== null,
    calls: items.flatMap((i) => (i.kind === 'tool' ? [{ at: i.at, name: i.name, detail: detailOf(i.input) }] : [])),
    result: report ?? '',
    depth: 1,
    background: false,
    spawns: [],
    // Not running and never answered: it was stopped, or the app closed on it.
    stopped: report === null && !alive,
    ...(model && { model })
  }
}

/**
 * A subagent is not in the office, so a permission it asks for would have no card to be answered on. It is put on the card of the agent at
 * the top of its chain, with the subagent named. The request keeps its id, so the answer finds it.
 */
export function shownTo<R extends { id: string; agentId: string; sessionId: string; detail: string }>(agents: { id: string; name: string; sessionId: string; parent?: string }[], r: R): R {
  const asker = agents.find((a) => a.id === r.agentId)
  if (!asker?.parent) return r
  let top = asker
  for (let hops = 0; top.parent && hops < 20; hops++) top = agents.find((a) => a.id === top.parent) ?? top
  return top === asker ? r : { ...r, agentId: top.id, sessionId: top.sessionId, detail: `${asker.name} (subagent) wants: ${r.detail}` }
}

/** Subagents are saved with the agents; one whose parent is no longer there (removed, or lost) has nobody to answer to, so it goes too. */
export function withoutOrphans<T extends Tree>(agents: T[]): T[] {
  const keep = (a: T, hops = 0): boolean => !a.parent || (hops < 20 && agents.some((p) => p.id === a.parent && keep(p, hops + 1)))
  return agents.filter((a) => keep(a))
}

/**
 * A program that asks to trust a folder before it starts waits for an answer a subagent cannot give (it is not in the office). The
 * folder its parent already works in, and one the office made for it, are the user's own, so those are answered yes.
 */
export function mayTrust(agents: { id: string; cwd: string; parent?: string }[], id: string, worktreeRoot: string): boolean {
  const a = agents.find((x) => x.id === id)
  const parent = a?.parent ? agents.find((x) => x.id === a.parent) : undefined
  return !!a && !!parent && (a.cwd === parent.cwd || a.cwd.startsWith(`${worktreeRoot.replace(/\/$/, '')}/`))
}

/** How long a finished subagent stays in its parent's list (for reading what it did) before it is cleared away. */
export const KEEP_MS = 3_600_000

/** The subagents to clear away: their program has ended and they were made more than an hour ago. */
export function staleChildren(agents: { id: string; parent?: string; hiredAt?: number }[], running: Set<string>, now: number): string[] {
  return agents.filter((a) => a.parent && !running.has(a.id) && now - (a.hiredAt ?? 0) > KEEP_MS).map((a) => a.id)
}
