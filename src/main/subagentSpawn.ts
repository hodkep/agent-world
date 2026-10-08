import type { ChatItem, SubagentInfo } from '../shared/chat'

/** A child may start children of its own, a grandchild may not. */
export const MAX_DEPTH = 2
/** Children one agent may have working at once. */
export const MAX_RUNNING = 3

interface Tree {
  id: string
  parent?: string
}

/** How many parents are above an agent. A loop in the records counts as too deep rather than running for ever. */
export function depthOf(agents: Tree[], id: string): number {
  let depth = 0
  for (let at = agents.find((a) => a.id === id); at?.parent; at = agents.find((a) => a.id === at!.parent)) if (++depth > MAX_DEPTH + 1) break
  return depth
}

/** Why this agent may not start another subagent now, or null when it may. */
export function checkSpawn(agents: Tree[], parentId: string, running: Set<string>): string | null {
  if (!agents.some((a) => a.id === parentId)) return 'Unknown agent.'
  if (depthOf(agents, parentId) >= MAX_DEPTH) return `Subagents nest ${MAX_DEPTH} deep at most, so this one is too deep to start another. Do the work yourself, or hand it back.`
  const working = agents.filter((a) => a.parent === parentId && running.has(a.id)).length
  if (working >= MAX_RUNNING) return `This agent already has ${working} subagents working, which is the most at once. Wait for one to finish (await_subagents), then start the next.`
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
export function childInfo(child: { id: string; provider?: string; task?: string }, items: ChatItem[], idle: boolean): SubagentInfo {
  const report = finalReport(items, idle)
  const first = items.find((i) => i.kind === 'user')
  return {
    agentId: child.id,
    toolUseId: `spawn:${child.id}`,
    type: child.provider ?? 'claude',
    description: (child.task ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
    startedAt: first?.at ?? 0,
    updatedAt: items.at(-1)?.at ?? first?.at ?? 0,
    done: report !== null,
    calls: items.flatMap((i) => (i.kind === 'tool' ? [{ at: i.at, name: i.name, detail: detailOf(i.input) }] : [])),
    result: report ?? '',
    depth: 1,
    background: false,
    spawns: [],
    stopped: false
  }
}
