/** The todo board of one project: lists of tasks that people and agents both add to, change and finish. Pure functions over a plain board, so the files, the tools and the window all agree. */
export type TodoStatus = 'open' | 'doing' | 'blocked' | 'done'

export interface Actor {
  kind: 'human' | 'agent'
  id?: string
  name: string
  provider?: string
  /** For a subagent: the main agent it works for. */
  forMain?: string
}

/** Where in a chat something happened: enough to open that message, with a copy of its start for when it is gone. */
export interface MessageLink {
  agentId: string
  itemId: string
  at: number
  excerpt: string
}

export interface TodoEvent {
  at: number
  by: Actor
  what: 'created' | 'updated' | 'claimed' | 'assigned' | 'asked' | 'done' | 'reopened' | 'moved'
  note?: string
  link?: MessageLink
}

export interface Todo {
  id: string
  list: string
  title: string
  notes: string
  status: TodoStatus
  needsYou: boolean
  blockedWhy?: string
  claimedBy?: Actor
  /** Made by the app for a request the person sent, not typed by anyone. */
  auto?: boolean
  /** An agent's turn ended while it was still on this task, and it never said done or blocked. */
  stale?: boolean
  /** Its title and list were set by an agent or by the app, so the words of the request are no longer the title. */
  named?: boolean
  /** Finished by the app when the agent's turn ended cleanly, not by the agent saying so. */
  closedAtTurnEnd?: boolean
  /** Place within its list, lowest first. */
  order: number
  createdAt: number
  createdBy: Actor
  createdLink?: MessageLink
  updatedAt: number
  updatedBy: Actor
  doneAt?: number
  doneBy?: Actor
  doneNote?: string
  doneLink?: MessageLink
  /** How it was done, in the finisher's words. */
  doneHow?: string
  /** The files it touched: those the agent named and those git shows. */
  doneFiles?: string[]
  /** The commits made while it was being done. */
  doneCommits?: { sha: string; subject: string }[]
  history: TodoEvent[]
}

export interface TodoBoard {
  lists: string[]
  todos: Todo[]
  /** The number the next task gets. */
  next: number
}

const TITLE_MAX = 200
const NOTES_MAX = 4000
const NOTE_MAX = 500

const EXCERPT_MAX = 800

/** The start of a message kept with a task, as the writer wrote it (markdown and all), cut at a line when it is long. */
export function excerptOf(text: string, max = EXCERPT_MAX): string {
  const t = text.trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const nl = cut.lastIndexOf('\n')
  return nl > 0 ? `${cut.slice(0, nl).trimEnd()}\n…` : `${cut}…`
}

/** Where a task made from a request waits until it is named and put in a list by area. */
export const INBOX = 'Inbox'
/** How many lists an agent may make before it must reuse one: a board with a list for everything is as little use as one list for all. */
export const MAX_LISTS = 12

const GENERIC = new Set(['request', 'requests', 'misc', 'miscellaneous', 'other', 'others', 'general', 'todo', 'todos', 'to do', 'task', 'tasks', 'stuff', 'things', 'backlog', 'new', 'unsorted', 'various', 'default', 'application', 'applications', 'app'])
const norm = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const STOP = new Set(['and', 'the', 'of', 'for', 'a', 'to'])
const variants = (w: string) => new Set([w, w.replace(/s$/, ''), w.replace(/es$/, ''), w.replace(/ies$/, 'y')])
const sameWord = (a: string, b: string) => [...variants(a)].some((v) => variants(b).has(v))
const wordsOf = (n: string) => norm(n).split(' ').filter((w) => w && !STOP.has(w))

/** A list name that says nothing about an area ("Requests", "Misc", "Other"). Agents are asked to name an area instead. */
export const isGenericList = (n: string): boolean => GENERIC.has(norm(n))

/** The existing list a name means, however it is written (case, plural, a word of a longer name); else the name as given. Keeps the board to a few lists without anyone policing it. */
export function resolveList(lists: string[], name: string): string {
  const given = clip(name, 60)
  const want = wordsOf(given)
  if (!want.length) return given
  const exact = lists.find((l) => norm(l) === norm(given))
  if (exact) return exact
  const ranked = lists
    .map((l) => ({ l, have: wordsOf(l) }))
    .filter(({ have }) => have.length > 0 && (want.every((w) => have.some((h) => sameWord(w, h))) || have.every((h) => want.some((w) => sameWord(w, h)))))
    .map(({ l, have }) => ({ l, overlap: want.filter((w) => have.some((h) => sameWord(w, h))).length, size: have.length }))
    .sort((a, b) => b.overlap - a.overlap || a.size - b.size)
  return ranked[0]?.l ?? given
}

export const emptyBoard = (): TodoBoard => ({ lists: [], todos: [], next: 1 })

const clip = (s: string | undefined, n: number) => (s ?? '').trim().slice(0, n)
const find = (b: TodoBoard, id: string): Todo => {
  const t = b.todos.find((x) => x.id === id)
  if (!t) throw new Error(`No todo ${id}.`)
  return t
}
const put = (b: TodoBoard, t: Todo): TodoBoard => ({ ...b, todos: b.todos.map((x) => (x.id === t.id ? t : x)) })
const stamp = (t: Todo, by: Actor, at: number, ev: Omit<TodoEvent, 'at' | 'by'>): Todo => {
  const next: Todo = { ...t, updatedAt: at, updatedBy: by, history: [...t.history, { at, by, ...ev }] }
  delete next.stale
  return next
}
const lastOrder = (b: TodoBoard, list: string) => b.todos.filter((t) => t.list === list).reduce((n, t) => Math.max(n, t.order), -1)

export function addList(b: TodoBoard, name: string): TodoBoard {
  const n = clip(name, 60)
  if (!n) throw new Error('A list needs a name.')
  return b.lists.includes(n) ? b : { ...b, lists: [...b.lists, n] }
}

export function renameList(b: TodoBoard, from: string, to: string): TodoBoard {
  const n = clip(to, 60)
  if (!n) throw new Error('A list needs a name.')
  if (n !== from && b.lists.includes(n)) throw new Error(`A list called ${n} already exists.`)
  return { ...b, lists: b.lists.map((l) => (l === from ? n : l)), todos: b.todos.map((t) => (t.list === from ? { ...t, list: n } : t)) }
}

export const removeList = (b: TodoBoard, name: string): TodoBoard => ({ ...b, lists: b.lists.filter((l) => l !== name), todos: b.todos.filter((t) => t.list !== name) })

export function addTodo(b: TodoBoard, i: { title: string; list?: string; notes?: string; needsYou?: boolean; auto?: boolean }, by: Actor, at: number, link?: MessageLink): { board: TodoBoard; todo: Todo } {
  const title = clip(i.title, TITLE_MAX)
  if (!title) throw new Error('A todo needs a title.')
  const list = clip(i.list, 60) || b.lists[0] || 'To do'
  const withList = addList(b, list)
  const todo: Todo = {
    id: String(b.next), list, title, notes: clip(i.notes, NOTES_MAX), status: 'open', needsYou: !!i.needsYou, ...(i.auto && { auto: true }), order: lastOrder(withList, list) + 1,
    createdAt: at, createdBy: by, ...(link && { createdLink: link }), updatedAt: at, updatedBy: by, history: [{ at, by, what: 'created', ...(link && { link }) }]
  }
  return { board: { ...withList, todos: [...withList.todos, todo], next: b.next + 1 }, todo }
}

export function updateTodo(b: TodoBoard, id: string, p: { title?: string; notes?: string; needsYou?: boolean; status?: TodoStatus; blockedWhy?: string; list?: string }, by: Actor, at: number): TodoBoard {
  const t = find(b, id)
  // A list named in the patch is the list that already means it, if there is one, and the task is moved there after its fields change.
  const target = p.list?.trim() ? resolveList(b.lists, p.list) : undefined
  const status = p.status ?? t.status
  const next: Todo = {
    ...t,
    ...(p.title !== undefined && { title: clip(p.title, TITLE_MAX) || t.title }),
    ...(p.notes !== undefined && { notes: clip(p.notes, NOTES_MAX) }),
    ...(p.needsYou !== undefined && { needsYou: p.needsYou }),
    ...((p.title?.trim() || p.list?.trim()) && { named: true }),
    status,
    blockedWhy: status === 'blocked' ? clip(p.blockedWhy ?? t.blockedWhy, NOTE_MAX) || undefined : undefined
  }
  if (status !== 'doing' && status !== 'blocked') delete next.claimedBy
  const changed = put(b, stamp(next, by, at, { what: 'updated' }))
  return target && target !== t.list ? moveTodo(changed, id, target, Number.MAX_SAFE_INTEGER, by, at) : changed
}

export function claimTodo(b: TodoBoard, id: string, by: Actor, at: number): TodoBoard {
  const t = find(b, id)
  if (t.claimedBy && t.claimedBy.id !== by.id && t.status === 'doing') throw new Error(`${t.claimedBy.name} is already doing todo ${id}.`)
  return put(b, stamp({ ...t, status: 'doing', claimedBy: by, blockedWhy: undefined }, by, at, { what: 'claimed' }))
}

/** The person puts an agent on a task: it is the agent's now, and the history says who asked. */
export function assignTodo(b: TodoBoard, id: string, agent: Actor, by: Actor, at: number): TodoBoard {
  const t = find(b, id)
  if (t.claimedBy && t.claimedBy.id !== agent.id && t.status === 'doing') throw new Error(`${t.claimedBy.name} is already doing todo ${id}.`)
  return put(b, stamp({ ...t, status: 'doing', claimedBy: agent, blockedWhy: undefined }, by, at, { what: 'assigned', note: agent.name }))
}

/** A question was put to an agent about a task; the task itself is unchanged. */
export function askedTodo(b: TodoBoard, id: string, agent: Actor, by: Actor, at: number, text: string): TodoBoard {
  const t = find(b, id)
  return put(b, stamp(t, by, at, { what: 'asked', note: `${agent.name}: ${clip(text, NOTE_MAX)}` }))
}

const HOW_MAX = 1500
const FILES_MAX = 30
const COMMITS_MAX = 10
const uniqFiles = (fs: string[] | undefined) => [...new Set((fs ?? []).map((f) => f.trim()).filter(Boolean))].slice(0, FILES_MAX)

export function doneTodo(b: TodoBoard, id: string, by: Actor, note: string, at: number, link?: MessageLink, extra?: { how?: string; files?: string[] }): TodoBoard {
  const t = find(b, id)
  const n = clip(note, NOTE_MAX)
  const how = clip(extra?.how, HOW_MAX)
  const files = uniqFiles(extra?.files)
  const next: Todo = { ...t, status: 'done', blockedWhy: undefined, doneAt: at, doneBy: by, doneNote: n || undefined, doneLink: link, ...(how && { doneHow: how }), ...(files.length && { doneFiles: files }) }
  delete next.claimedBy
  return put(b, stamp(next, by, at, { what: 'done', ...(n && { note: n }), ...(link && { link }) }))
}

export function reopenTodo(b: TodoBoard, id: string, by: Actor, at: number): TodoBoard {
  const t = find(b, id)
  const next: Todo = { ...t, status: 'open' }
  delete next.doneAt
  delete next.doneBy
  delete next.doneNote
  delete next.doneLink
  delete next.doneHow
  delete next.doneFiles
  delete next.doneCommits
  return put(b, stamp(next, by, at, { what: 'reopened' }))
}

/** What git shows was done while the task was being done: its commits and files, kept with it. Not an edit, so the history does not change. */
export function attachWork(b: TodoBoard, id: string, work: { commits: { sha: string; subject: string }[]; files: string[] }): TodoBoard {
  const t = find(b, id)
  const files = uniqFiles([...(t.doneFiles ?? []), ...work.files])
  const commits = work.commits.slice(0, COMMITS_MAX).map((c) => ({ sha: c.sha.slice(0, 12), subject: clip(c.subject, 160) }))
  return put(b, { ...t, ...(files.length && { doneFiles: files }), ...(commits.length && { doneCommits: commits }) })
}

/** A line of what was done and how, for the project's shared memory, so an agent that recalls "how did we do X" finds it. Empty when there is nothing to say. */
export function knowledgeLine(t: Todo): string {
  const parts = [t.doneNote, t.doneHow && `How: ${t.doneHow}`, t.doneFiles?.length && `Files: ${t.doneFiles.join(', ')}`, t.doneCommits?.length && `Commits: ${t.doneCommits.map((c) => `${c.sha} ${c.subject}`).join('; ')}`].filter(Boolean)
  if (!parts.length) return ''
  const when = new Date(t.doneAt ?? t.updatedAt).toISOString().slice(0, 10)
  return `Done todo#${t.id} "${t.title}" by ${t.doneBy?.name ?? 'someone'} on ${when}. ${parts.join(' ')}`
}

/** An agent's turn ended: what the app made for its requests and it is still on, without saying done or blocked, is flagged. */
export function markStale(b: TodoBoard, agentId: string, _at: number): TodoBoard {
  return { ...b, todos: b.todos.map((t) => (t.auto && t.status === 'doing' && t.claimedBy?.id === agentId ? { ...t, stale: true } : t)) }
}

export function removeTodo(b: TodoBoard, id: string): TodoBoard {
  find(b, id)
  return { ...b, todos: b.todos.filter((t) => t.id !== id) }
}

/** Puts a task in a list at a place (0 is the top); the others in that list keep their order around it. */
export function moveTodo(b: TodoBoard, id: string, list: string, index: number, by: Actor, at: number): TodoBoard {
  const t = find(b, id)
  const withList = addList(b, list)
  const there = withList.todos.filter((x) => x.list === list && x.id !== id).sort((x, y) => x.order - y.order)
  there.splice(Math.max(0, Math.min(index, there.length)), 0, { ...t, list })
  const order = new Map(there.map((x, k) => [x.id, k]))
  const moved = t.list !== list
  return {
    ...withList,
    todos: withList.todos.map((x) => {
      if (x.id === id) return stamp({ ...x, list, order: order.get(id)! }, by, at, { what: 'moved', note: moved ? `${t.list} → ${list}` : undefined })
      return order.has(x.id) ? { ...x, order: order.get(x.id)! } : x
    })
  }
}

/** How many open tasks are waiting on the person. */
export const needsYou = (b: TodoBoard): number => b.todos.filter((t) => t.needsYou && t.status !== 'done').length
