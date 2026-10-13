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

/** Why the app closed a task on its own, if it did (a task closed before this was recorded was closed when a turn ended). */
export const autoClosed = (t: Todo): 'turn' | 'stopped' | undefined => t.closedBy ?? (t.closedAtTurnEnd ? 'turn' : undefined)

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

export interface ActivityLine {
  text: string
  at: number
  /** Worth a coloured mark: something happened, not just an edit. */
  key: boolean
  /** The app did it on its own, nobody said so: drawn with a dashed mark. */
  app?: boolean
}

/** What happened to a task, in words, oldest first: the events that matter, with plain edits folded into one line ("Edited 3 times"). */
export function activityOf(t: Todo): ActivityLine[] {
  const out: ActivityLine[] = []
  const lastDone = [...t.history].reverse().find((e) => e.what === 'done')
  for (const e of t.history) {
    const by = e.by.name
    if (e.what === 'updated') {
      const last = out.at(-1)
      const n = last && !last.key && /^Edited \d+ times?$/.test(last.text) ? Number(/\d+/.exec(last.text)![0]) + 1 : 1
      const line = { text: `Edited ${n} time${n === 1 ? '' : 's'}`, at: e.at, key: false }
      if (last && !last.key && /^Edited/.test(last.text)) out[out.length - 1] = line
      else out.push(line)
      continue
    }
    const text =
      e.what === 'created' ? `Made by ${by}${e.link ? ' from its message' : ''}`
      : e.what === 'claimed' ? `Claimed by ${by}`
      : e.what === 'assigned' ? `${by} put ${e.note ?? 'an agent'} on it`
      : e.what === 'asked' ? `${by} asked ${e.note ?? ''}`.trim()
      : e.what === 'done' && autoClosed(t) && e === lastDone ? (autoClosed(t) === 'stopped' ? `Closed by Agent World: ${by} had stopped, nobody said it was done` : `Closed by Agent World when ${by}'s turn ended, nobody said it was done`)
      : e.what === 'done' ? `Done by ${by}${e.note ? `: ${e.note}` : ''}`
      : e.what === 'reopened' ? `Reopened by ${by}`
      : `${by} moved it ${e.note ?? ''}`.trim()
    out.push({ text, at: e.at, key: true, ...(e.what === 'done' && autoClosed(t) && e === lastDone && { app: true }) })
  }
  return out
}

/** The names of agents that made tasks here, for the filter chips. */
export const makers = (b: TodoBoard): string[] => [...new Set(b.todos.filter((t) => t.createdBy.kind === 'agent').map((t) => t.createdBy.name))].sort()

/** Shift-click: everything between the last task picked and this one (in the order they are drawn) is picked too. */
export function pickRange(order: string[], anchor: string | undefined, id: string, picked: Set<string>): Set<string> {
  const to = order.indexOf(id)
  const from = anchor === undefined ? -1 : order.indexOf(anchor)
  const out = new Set(picked)
  if (from < 0 || to < 0) return out.add(id)
  for (const k of order.slice(Math.min(from, to), Math.max(from, to) + 1)) out.add(k)
  return out
}

/** The box at the top of a list: picks all of its tasks, or, when they are all picked already, lets go of them. */
export function pickList(ids: string[], picked: Set<string>): Set<string> {
  const out = new Set(picked)
  if (ids.length && ids.every((i) => out.has(i))) for (const i of ids) out.delete(i)
  else for (const i of ids) out.add(i)
  return out
}
