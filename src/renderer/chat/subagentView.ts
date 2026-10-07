import type { ChatItem, SubagentInfo } from '../../shared/chat'

/**
 * A fork's file starts with a copy of the call that made it (with the task as its prompt), the answer "Fork started", and the
 * fork's standing instructions. It reads better as what it is: the task it was given, as the first message.
 */
export function trimFork(items: ChatItem[]): ChatItem[] {
  const first = items[0]
  const forked = first?.kind === 'tool' && (first.name === 'Agent' || first.name === 'Task') && items.some((i) => i.kind === 'user' && i.text.startsWith('<fork-boilerplate>'))
  if (!forked || first.kind !== 'tool') return items
  const task: ChatItem = { kind: 'user', id: first.id, at: first.at, text: String(first.input.prompt ?? first.input.description ?? '') }
  const rest = items.slice(1).filter((i) => !(i.kind === 'tool-result' && i.toolUseId === first.toolUseId) && !(i.kind === 'user' && i.text.startsWith('<fork-boilerplate>')))
  return [task, ...rest]
}

const DOING: Record<string, string> = { Bash: 'running a command', Read: 'reading', Grep: 'reading', Glob: 'reading', WebFetch: 'reading', WebSearch: 'reading', Edit: 'writing code', Write: 'writing code', NotebookEdit: 'writing code', Agent: 'delegating', Task: 'delegating' }

/** What a working subagent is at this moment, from its last call that has no answer yet; null once it is over. */
export function liveLine(items: ChatItem[], state: string): string | null {
  if (state !== 'working') return null
  const answered = new Set(items.filter((i) => i.kind === 'tool-result').map((i) => (i.kind === 'tool-result' ? i.toolUseId : '')))
  const open = [...items].reverse().find((i) => i.kind === 'tool' && !answered.has(i.toolUseId))
  return open && open.kind === 'tool' ? (DOING[open.name] ?? 'using a tool') : 'thinking'
}

/** Cheap to compare: how many lines there are and which one is last, so a poll that found nothing new changes nothing on screen. */
export const signature = (items: ChatItem[]) => `${items.length}:${items.at(-1)?.id ?? ''}`

/** The name on a subagent's tab: its task, cut to fit. */
export function tabLabel(i: SubagentInfo): string {
  const d = i.description.trim()
  if (!d) return i.type
  return d.length > 26 ? `${d.slice(0, 26)}…` : d
}
