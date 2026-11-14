import { isAppLine } from './todoTracking'
import { INBOX, type Todo } from './todos'

/** What a small model is asked about a task of the board. */
export interface CleanupRow {
  id: string
  list: string
  status: string
  title: string
}

/** What the model said about one task; every field is optional. */
export interface CleanupAnswer {
  id: string
  /** Not work: a message the app wrote, or a chore (a rebase, a test instance, an approval of a step). */
  drop?: 'echo' | 'chore'
  /** The kind of work: feature, bug, research, design, test, release. */
  kind?: string
  /** The number of the earliest task of the same piece of work, when it is not that one. */
  family?: string
  /** The list it belongs in, when not the one it is in. */
  list?: string
}

/** What a tidy would do, in four groups. */
export interface TidyPlan {
  /** How many tasks were read. */
  read: number
  remove: { id: string; title: string; why: 'echo' | 'chore' }[]
  nest: { id: string; title: string; parent: string; parentTitle: string }[]
  label: { id: string; title: string; label: string }[]
  move: { id: string; title: string; from: string; to: string }[]
}

const AREA_MIN = 5

/** What the model is asked about a batch of tasks: one line each, an array of answers back. */
export function cleanupPrompt(rows: CleanupRow[], areas: string[]): string {
  return [
    'You tidy a project\'s todo board. Below, one task per line: number | list | state | title. Answer with a JSON array only, one object per task that needs something, in the form {"id": "...", ...}. Leave a task out when nothing applies.',
    'drop: "echo" for a message the app wrote into the conversation (it starts with [Agent World] or [Subagent hand-back]); "chore" only for git and process mechanics: a rebase, merge, push or pull, starting a test instance, an approval, a hold or a report of a workflow step, a branch clean-up. Never "chore" for a title that builds, adds, fixes or changes what the app does, even when it also mentions a push or a merge.',
    'kind: the kind of work, one word: feature, bug, research, design, test or release.',
    'family: the number of the earliest task above that is the same piece of work (a repeat of the same request, or a small part of it); leave it out when the task stands alone.',
    `list: one of ${areas.length ? areas.slice(0, 12).join(', ') : 'the lists of the board'}, only when the task belongs in a different list than its own.`,
    ...rows.map((r) => `${r.id} | ${r.list} | ${r.status} | ${r.title.slice(0, 140)}`)
  ].join('\n')
}

/** The answers the model gave: only for numbers it was asked about, only the fields that make sense. */
export function parseCleanup(text: string, ids: string[]): CleanupAnswer[] {
  const m = /\[[\s\S]*\]/.exec(text)
  if (!m) return []
  let j: unknown
  try {
    j = JSON.parse(m[0])
  } catch {
    return []
  }
  if (!Array.isArray(j)) return []
  const known = new Set(ids)
  const seen = new Set<string>()
  const out: CleanupAnswer[] = []
  for (const e of j) {
    if (!e || typeof e !== 'object') continue
    const o = e as Record<string, unknown>
    const id = typeof o.id === 'string' || typeof o.id === 'number' ? String(o.id) : ''
    if (!known.has(id) || seen.has(id)) continue
    seen.add(id)
    const a: CleanupAnswer = { id }
    if (o.drop === 'echo' || o.drop === 'chore') a.drop = o.drop
    const kind = typeof o.kind === 'string' ? o.kind.trim().toLowerCase() : ''
    if (/^[a-z][a-z0-9-]{1,24}$/.test(kind)) a.kind = kind
    if (typeof o.family === 'string' || typeof o.family === 'number') a.family = String(o.family)
    if (typeof o.list === 'string' && o.list.trim()) a.list = o.list.trim().slice(0, 60)
    out.push(a)
  }
  return out
}

// What a chore's title reads like: git and process work, or a step of the workflow written down as a task. A model that calls real work a chore does not get it removed.
const CHORE_TITLE = /^(?:push|pull|rebase|merged?|commit|approv(?:e|ed)|hold|skip|retry|reopen|request admin|confirm|verify|run (?:the )?review|test seeded|delete stale|build approved|opened?\s+(?:pr|pull request|scratch|a test|the test)|start\s+(?:[\w/-]+\s+)*?(?:test (?:instance|app|copy)|instance|pull request step|project build))\b/i

/** A task someone typed on the board: the tidy never removes, nests or moves it. */
const written = (t: Todo) => t.createdBy.kind === 'human' && !t.auto

/** Whether a tidy may remove a task at all, whatever the plan says: finished, made by the app, with no parts. */
export const removable = (t: Todo, todos: Todo[]): boolean => !!t.auto && t.status === 'done' && !todos.some((x) => x.parent === t.id)

/** The plan a tidy would follow, from the tasks and what the model said of them. Nothing is changed here. */
export function planTidy(todos: Todo[], answers: CleanupAnswer[]): TidyPlan {
  const byId = new Map(todos.map((t) => [t.id, t]))
  const said = new Map(answers.map((a) => [a.id, a]))
  const hasParts = (id: string) => todos.some((t) => t.parent === id)

  // Removed: finished tasks the app made that are not work. A task with parts stays, so its parts keep their parent.
  const remove: TidyPlan['remove'] = []
  for (const t of todos) {
    if (!removable(t, todos)) continue
    // Only a title the app wrote: an agent that renamed the task to the work it did has made it work, whatever message it began from.
    const echo = isAppLine(t.title)
    const why = echo ? 'echo' : said.get(t.id)?.drop === 'chore' && CHORE_TITLE.test(t.title) ? 'chore' : undefined
    if (why) remove.push({ id: t.id, title: t.title, why })
  }
  const gone = new Set(remove.map((r) => r.id))

  // Nested: a task that is the same work as an earlier one goes under it; the parent stays on top, so there is one level and no cycle.
  const wanted = todos.flatMap((t) => {
    const a = said.get(t.id)
    const p = a?.family ? byId.get(a.family) : undefined
    return p && p.id !== t.id && !t.parent && !hasParts(t.id) && !written(t) && !gone.has(t.id) ? [{ t, p }] : []
  })
  const moving = new Set(wanted.map((w) => w.t.id))
  const nest = wanted.filter(({ p }) => !gone.has(p.id) && !p.parent && !moving.has(p.id)).map(({ t, p }) => ({ id: t.id, title: t.title, parent: p.id, parentTitle: p.title }))
  const nested = new Set(nest.map((n) => n.id))

  const label = todos.flatMap((t) => {
    const kind = said.get(t.id)?.kind
    return kind && !t.labels?.length && !gone.has(t.id) ? [{ id: t.id, title: t.title, label: kind }] : []
  })

  // Moved: out of the Inbox or a list too small to be an area, into a list that is one.
  const count = new Map<string, number>()
  for (const t of todos) count.set(t.list, (count.get(t.list) ?? 0) + 1)
  const areas = [...count].filter(([l, n]) => l !== INBOX && n >= AREA_MIN).map(([l]) => l)
  const move = todos.flatMap((t) => {
    const to = areas.find((l) => l.toLowerCase() === said.get(t.id)?.list?.toLowerCase())
    const small = t.list === INBOX || (count.get(t.list) ?? 0) < AREA_MIN
    return to && to !== t.list && small && !written(t) && !t.parent && !gone.has(t.id) && !nested.has(t.id) ? [{ id: t.id, title: t.title, from: t.list, to }] : []
  })

  return { read: todos.length, remove, nest, label, move }
}
