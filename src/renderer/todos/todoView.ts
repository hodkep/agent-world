import type { Actor, Todo, TodoBoard } from '../../shared/todos'

export interface ActorTag {
  tone: 'me' | 'cl' | 'ag'
  label: string
  /** For a subagent: the main agent it works for. */
  forMain?: string
}

/** Who made or changed something, as the board labels it: a colour for you, Claude and agy. */
export function actorTag(a: Actor): ActorTag {
  if (a.kind === 'human') return { tone: 'me', label: a.name }
  const main = a.forMain ? { forMain: a.forMain } : {}
  return a.provider === 'agy' ? { tone: 'ag', label: `${a.name} · agy`, ...main } : { tone: 'cl', label: `${a.name} · ${a.provider === 'claude' || !a.provider ? 'Claude' : a.provider}`, ...main }
}

export function agoLabel(t: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86_400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86_400)}d ago`
}

/** One list's tasks: the open ones in the order they were put in, the finished ones newest first (those fold under "Done"). */
export function splitList(b: TodoBoard, list: string): { open: Todo[]; done: Todo[] } {
  const here = b.todos.filter((t) => t.list === list)
  return {
    open: here.filter((t) => t.status !== 'done').sort((x, y) => x.order - y.order),
    done: here.filter((t) => t.status === 'done').sort((x, y) => (y.doneAt ?? 0) - (x.doneAt ?? 0))
  }
}

export interface BoardFilter {
  /** 'all', 'you', or an agent's name. */
  who: string
  query: string
}

/** The board a filter leaves: only the tasks that match, but every list stays so an empty one is still there to add to. */
export function filterBoard(b: TodoBoard, f: BoardFilter): TodoBoard {
  const words = f.query.toLowerCase().split(/\s+/).filter(Boolean)
  return {
    ...b,
    todos: b.todos.filter((t) => {
      if (f.who !== 'all' && (f.who === 'you' ? t.createdBy.kind !== 'human' : t.createdBy.name !== f.who)) return false
      const hay = `${t.title} ${t.notes}`.toLowerCase()
      return words.every((w) => hay.includes(w))
    })
  }
}

/** The names of agents that made tasks here, for the filter chips. */
export const makers = (b: TodoBoard): string[] => [...new Set(b.todos.filter((t) => t.createdBy.kind === 'agent').map((t) => t.createdBy.name))].sort()
