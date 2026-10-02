import type { ChatItem } from '../shared/chat'

/** What an agent counts as working: busy on something itself, not waiting for you, not asleep. */
const WORKING = new Set(['thinking', 'researching', 'implementing', 'running', 'delegating', 'compacting'])
const FILE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

export interface ProfileCounts {
  turns: number
  /** The three most used, most first. */
  tools: [string, number][]
  /** Different files it wrote or edited. */
  files: number
}

/** What it has done, counted from its whole conversation. */
export function profileCounts(items: ChatItem[]): ProfileCounts {
  let turns = 0
  const tools = new Map<string, number>()
  const files = new Set<string>()
  for (const i of items) {
    if (i.kind === 'user') turns++
    else if (i.kind === 'tool') {
      tools.set(i.name, (tools.get(i.name) ?? 0) + 1)
      const path = i.input.file_path ?? i.input.notebook_path
      if (FILE_TOOLS.has(i.name) && typeof path === 'string') files.add(path)
    }
  }
  const top = [...tools].sort((a, b) => b[1] - a[1]).slice(0, 3)
  return { turns, tools: top, files: files.size }
}

export interface WorkClock {
  /** Milliseconds worked in finished stretches. */
  total: number
  /** When the stretch in progress began, if one is. */
  since: number | null
}

/** The clock after the agent's activity changed to `activity` at `now`. */
export function advanceWork(w: WorkClock, activity: string, now: number): WorkClock {
  const busy = WORKING.has(activity)
  if (busy && w.since === null) return { total: w.total, since: now }
  if (!busy && w.since !== null) return { total: w.total + (now - w.since), since: null }
  return w
}

export const workedNow = (w: WorkClock, now: number) => w.total + (w.since === null ? 0 : now - w.since)

/** When it was hired: the time stored with it, or an estimate from its worktree folder or the start of its conversation. */
export function hiredAtOf(a: { hiredAt?: number }, found: { folder: number | null; conversation: number | null }): { at: number | null; estimated: boolean } {
  if (a.hiredAt) return { at: a.hiredAt, estimated: false }
  return { at: found.folder ?? found.conversation, estimated: true }
}
