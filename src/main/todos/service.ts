import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isWork, requestTitle } from '../../shared/todoTracking'
import { askMessage, type AskMode } from '../../shared/todoAsk'
import { parseTidy, tidyPrompt } from '../../shared/todoTidy'
import { searchTodos, type TodoHit } from '../../shared/todoSearch'
import { matchItems } from '../library/match'
import {
  INBOX, MAX_LISTS, addList, addTodo, askedTodo, assignTodo, attachWork, claimTodo, doneTodo, emptyBoard, excerptOf, isGenericList, knowledgeLine, markStale, resolveList, moveTodo, needsYou, removeList, removeTodo, renameList, reopenTodo, updateTodo,
  type Actor, type MessageLink, type Todo, type TodoBoard, type TodoStatus
} from '../../shared/todos'

export interface TodoDeps {
  /** Where the boards are kept: one file per project. */
  dir: string
  workspaceKey: (repoPath: string) => string
  agent: (id: string) => { id: string; name: string; provider: string; repoPath: string; /** For a subagent: the main agent it works for. */ forMain?: string } | undefined
  /** The message an agent most recently said, so a task can point back at it. */
  lastMessage: (agentId: string) => MessageLink | undefined
  /** The message the person just sent an agent (its words are given), so the task made for it points at it. */
  lastRequest: (agentId: string, text: string) => MessageLink | undefined
  /** What git shows an agent committed since a time (ms): its commits and the files they touched. */
  workSince: (agentId: string, since: number) => Promise<{ commits: { sha: string; subject: string }[]; files: string[] }>
  /** Whether an agent is working right now (a request of its that is open may still be being answered). */
  busy?: (agentId: string) => boolean
  /** A small model asked to name and sort a task: its answer as text, or '' when it cannot be asked. Not set when there is none to ask. */
  ask?: (prompt: string) => Promise<string>
  /** Writes a line into the project's shared memory. */
  remember: (repoPath: string, text: string, by: string) => void
  now?: () => number
  onChange: (workspace: string) => void
}

const YOU: Actor = { kind: 'human', name: 'you' }
/** The app itself, when it names a task or closes one. */
const APP: Actor = { kind: 'human', name: 'app' }

/** The todo boards, one per project, kept in files and changed either by the person (in the window) or by an agent (through the office tools). */
export function createTodoService(d: TodoDeps) {
  const now = d.now ?? Date.now
  const cache = new Map<string, TodoBoard>()
  mkdirSync(d.dir, { recursive: true })
  const fileOf = (key: string) => join(d.dir, `${key.replace(/[^a-zA-Z0-9._-]/g, '_')}.json`)

  /** A board made before tasks were sorted by area: what the app made for requests leaves "Requests" for the Inbox and is named by its own words; a task someone wrote keeps its list. */
  function tidy(b: TodoBoard, key: string): TodoBoard {
    const old = b.todos.filter((t) => t.auto && t.list === 'Requests')
    if (!old.length) return b
    const todos = b.todos.map((t) => (old.includes(t) ? { ...t, list: INBOX, title: t.createdLink?.excerpt ? requestTitle(t.createdLink.excerpt) : t.title } : t))
    const lists = [...b.lists.filter((l) => l !== INBOX), INBOX]
    const next = { ...b, todos, lists: lists.filter((l) => l !== 'Requests' || todos.some((t) => t.list === 'Requests')) }
    // Saved straight away, so this happens once; the change event is for open windows and there are none yet.
    try {
      writeFileSync(`${fileOf(key)}.tmp`, JSON.stringify(next, null, 1))
      renameSync(`${fileOf(key)}.tmp`, fileOf(key))
    } catch {
      /* it is tidied again next time */
    }
    return next
  }

  function load(key: string): TodoBoard {
    const hit = cache.get(key)
    if (hit) return hit
    let b = emptyBoard()
    try {
      if (existsSync(fileOf(key))) {
        const j = JSON.parse(readFileSync(fileOf(key), 'utf8')) as Partial<TodoBoard>
        if (Array.isArray(j.lists) && Array.isArray(j.todos) && typeof j.next === 'number') b = tidy(j as TodoBoard, key)
      }
    } catch {
      /* a damaged file starts an empty board; the next change replaces it */
    }
    cache.set(key, b)
    return b
  }
  function save(key: string, b: TodoBoard) {
    cache.set(key, b)
    const tmp = `${fileOf(key)}.tmp`
    writeFileSync(tmp, JSON.stringify(b, null, 1))
    renameSync(tmp, fileOf(key))
    d.onChange(key)
  }
  const keyOf = (repoPath: string) => d.workspaceKey(repoPath)
  const agentOf = (id: string) => {
    const a = d.agent(id)
    if (!a) throw new Error('Only an agent in this office can use the todo board.')
    return a
  }
  const actor = (a: { id: string; name: string; provider: string; forMain?: string }): Actor => ({ kind: 'agent', id: a.id, name: a.name, provider: a.provider, ...(a.forMain && { forMain: a.forMain }) })
  /** Runs a change on a project's board and saves it. */
  const change = <T>(repoPath: string, f: (b: TodoBoard) => { board: TodoBoard; out: T }): T => {
    const key = keyOf(repoPath)
    const { board, out } = f(load(key))
    save(key, board)
    return out
  }
  // Finishing a task is answered at once; what git shows and the memory line follow, so a slow git never holds an agent up.
  const inflight = new Set<Promise<void>>()
  const sinceOf = (t: Todo) => [...t.history].reverse().find((e) => e.what === 'claimed' || e.what === 'assigned')?.at ?? t.createdAt
  function recordWork(a: { id: string; name: string; repoPath: string }, id: string) {
    const key = keyOf(a.repoPath)
    const t = load(key).todos.find((x) => x.id === id)
    if (!t) return
    const p: Promise<void> = (async () => {
      let work: { commits: { sha: string; subject: string }[]; files: string[] } = { commits: [], files: [] }
      try {
        work = await d.workSince(a.id, sinceOf(t))
      } catch {
        /* not a repository, or git is not there: the task keeps what the agent said */
      }
      const cur = load(key)
      if (!cur.todos.some((x) => x.id === id)) return
      if (work.commits.length || work.files.length) save(key, attachWork(cur, id, work))
      await tidyOne(a.repoPath, id)
      const line = knowledgeLine(load(key).todos.find((x) => x.id === id)!)
      if (line) {
        try {
          d.remember(a.repoPath, line, a.name)
        } catch {
          /* memory is a help, not a part of finishing */
        }
      }
    })().finally(() => void inflight.delete(p))
    inflight.add(p)
  }
  /** Names and sorts one task the agent left with the person's words, by asking a small model once; false when nothing was done. */
  async function tidyOne(repoPath: string, id: string): Promise<boolean> {
    if (!d.ask) return false
    const key = keyOf(repoPath)
    const t = load(key).todos.find((x) => x.id === id)
    if (!t || !t.auto || t.named) return false
    const lists = load(key).lists.filter((l) => l !== INBOX)
    let out: ReturnType<typeof parseTidy> = null
    try {
      out = parseTidy(await d.ask(tidyPrompt({ request: t.createdLink?.excerpt ?? t.title, reply: t.doneLink?.excerpt ?? t.doneNote ?? '', commits: (t.doneCommits ?? []).map((c) => c.subject), lists })))
    } catch {
      /* no answer: the task keeps the words it has */
    }
    if (!out) return false
    const answer = out
    change(repoPath, (b) => {
      let list: string | undefined
      try {
        list = answer.list ? listFor(b, answer.list) : undefined
      } catch {
        list = answer.list ? resolveList(b.lists.filter((l) => l !== INBOX), answer.list) : undefined
        if (list && !b.lists.includes(list)) list = undefined
      }
      return { board: updateTodo(b, id, { title: answer.title, ...(list && { list }) }, APP, now()), out: undefined }
    })
    return true
  }
  // Finished tasks pointed at an agent, and when, so the same one is not pointed at again at once.
  const asks = new Map<string, number>()
  const shown = new Map<string, number>()
  const POINT_GAP = 10
  /** The list an agent's name stands for: an existing list that means it, else a new one; a name that says no area, or a new list past the limit, is refused with the lists to use instead. */
  function listFor(b: TodoBoard, name: string): string {
    const areas = b.lists.filter((l) => l !== INBOX)
    const have = areas.length ? ` The lists are: ${areas.join(', ')}.` : ''
    if (isGenericList(name)) throw new Error(`“${name}” says nothing about the area. Put it in a list for the part of the project it belongs to, or name a new area.${have}`)
    const list = resolveList(b.lists, name)
    if (!b.lists.includes(list) && areas.length >= MAX_LISTS) throw new Error(`The board already has ${areas.length} lists; use one of them for this.${have}`)
    return list
  }
  const lastTodo = (b: TodoBoard, id: string) => b.todos.find((t) => t.id === id)!
  const sorted = (ts: Todo[]) => [...ts].sort((x, y) => x.order - y.order)

  return {
    board: (repoPath: string): TodoBoard => load(keyOf(repoPath)),
    needsYou: (repoPath: string) => needsYou(load(keyOf(repoPath))),

    // The person, in the window.
    addList: (repoPath: string, name: string) => change(repoPath, (b) => ({ board: addList(b, name), out: undefined })),
    renameList: (repoPath: string, from: string, to: string) => change(repoPath, (b) => ({ board: renameList(b, from, to), out: undefined })),
    removeList: (repoPath: string, name: string) => change(repoPath, (b) => ({ board: removeList(b, name), out: undefined })),
    addByPerson: (repoPath: string, i: { title: string; list?: string; notes?: string; needsYou?: boolean }) =>
      change(repoPath, (b) => {
        const r = addTodo(b, i, YOU, now())
        return { board: r.board, out: r.todo }
      }),
    updateByPerson: (repoPath: string, id: string, p: { title?: string; notes?: string; needsYou?: boolean; status?: TodoStatus; blockedWhy?: string }) =>
      change(repoPath, (b) => ({ board: updateTodo(b, id, p, YOU, now()), out: undefined })),
    removeByPerson: (repoPath: string, id: string) => change(repoPath, (b) => ({ board: removeTodo(b, id), out: undefined })),
    doneByPerson: (repoPath: string, id: string, note = '') => change(repoPath, (b) => ({ board: doneTodo(b, id, YOU, note, now()), out: undefined })),
    reopenByPerson: (repoPath: string, id: string) => change(repoPath, (b) => ({ board: reopenTodo(b, id, YOU, now()), out: undefined })),
    moveByPerson: (repoPath: string, id: string, list: string, index: number) => change(repoPath, (b) => ({ board: moveTodo(b, id, list, index, YOU, now()), out: undefined })),

    /** The person asks an agent about a task or puts it on one: the board records it and the message to send the agent is given back. */
    askAgent(repoPath: string, id: string, agentId: string, mode: AskMode, words: string): { message: string } {
      const a = agentOf(agentId)
      return change(repoPath, (b) => {
        const board = mode === 'work' ? assignTodo(b, id, actor(a), YOU, now()) : askedTodo(b, id, actor(a), YOU, now(), words || 'a question')
        return { board, out: { message: askMessage(lastTodo(board, id), mode, words) } }
      })
    },
    /** Resolves when the git and memory work after finished tasks is done (for tests, and for quitting). */
    async settled() {
      while (inflight.size) await Promise.all([...inflight])
    },
    /** The lists by area on an agent's board (not the Inbox), for telling it which exist. */
    listsOf(agentId: string): string[] {
      return load(keyOf(agentOf(agentId).repoPath)).lists.filter((l) => l !== INBOX)
    },
    /** Tasks of the agent's project that match words, done ones included. */
    searchForAgent(agentId: string, query: string, o: { status?: TodoStatus | 'any'; limit?: number }): TodoHit[] {
      return searchTodos(load(keyOf(agentOf(agentId).repoPath)), query, o)
    },
    /** Finished tasks that look like what an agent was just asked, best first, and none it was already pointed at in the last few messages. */
    similarDone(agentId: string, prompt: string): { id: string; title: string; by: string }[] {
      const a = d.agent(agentId)
      if (!a) return []
      const turn = (asks.get(agentId) ?? 0) + 1
      asks.set(agentId, turn)
      const done = load(keyOf(a.repoPath)).todos.filter((t) => t.status === 'done' && (t.doneNote || t.doneHow || t.doneCommits?.length))
      const entries = done.map((t) => ({ id: t.id, name: t.title, description: '', when: [t.title, t.doneNote, t.doneHow].filter(Boolean).join(' ') }))
      return matchItems(prompt, entries, 2)
        .filter((m) => turn - (shown.get(`${agentId}:${m.id}`) ?? -Infinity) >= POINT_GAP)
        .map((m) => {
          shown.set(`${agentId}:${m.id}`, turn)
          return { id: m.id, title: m.name, by: done.find((t) => t.id === m.id)?.doneBy?.name ?? 'someone' }
        })
    },
    /** Fully tracked mode: a message the person sent becomes a task, in "Requests", that the agent is on. Small talk makes none. */
    trackRequest(agentId: string, prompt: string): Todo | undefined {
      const a = agentOf(agentId)
      if (!isWork(prompt)) return undefined
      const title = requestTitle(prompt)
      const same = load(keyOf(a.repoPath)).todos.find((t) => t.auto && t.status !== 'done' && t.title === title && t.claimedBy?.id === a.id)
      if (same) return same
      return change(a.repoPath, (b) => {
        const made = addTodo(b, { title, list: INBOX, notes: prompt.trim().length > 120 ? prompt.trim().slice(0, 1000) : '', auto: true }, YOU, now(), d.lastRequest(a.id, prompt))
        const board = claimTodo(made.board, made.todo.id, actor(a), now())
        return { board, out: lastTodo(board, made.todo.id) }
      })
    },
    /** An agent's turn ended. What the app made for its requests and it is still on is finished (the request was answered), unless the turn was cut off: then it is flagged, so the board does not claim work is in hand. */
    turnEnded(agentId: string, o: { interrupted?: boolean } = {}) {
      const a = d.agent(agentId)
      if (!a) return
      const key = keyOf(a.repoPath)
      const b = load(key)
      if (o.interrupted) {
        const next = markStale(b, agentId, now())
        if (next.todos.some((t, i) => t.stale !== b.todos[i]!.stale)) save(key, next)
        return
      }
      const open = b.todos.filter((t) => t.auto && t.status === 'doing' && t.claimedBy?.id === agentId)
      if (!open.length) return
      const link = d.lastMessage(a.id)
      let board = b
      for (const t of open) {
        board = doneTodo(board, t.id, actor(a), 'Closed when its turn ended', now(), link && { ...link, excerpt: excerptOf(link.excerpt, 2000) })
        board = { ...board, todos: board.todos.map((x) => (x.id === t.id ? { ...x, closedAtTurnEnd: true } : x)) }
      }
      save(key, board)
      for (const t of open) recordWork(a, t.id)
    },
    /** Names and sorts every task waiting in the Inbox that an agent left with the person's words; how many were named. */
    async tidyInbox(repoPath: string): Promise<number> {
      const key = keyOf(repoPath)
      // A request left open by an agent that is not working any more was answered: its turn is over.
      const left = load(key).todos.filter((t) => t.auto && t.status === 'doing' && t.claimedBy?.id && !d.busy?.(t.claimedBy.id))
      if (left.length) {
        let board = load(key)
        for (const t of left) {
          board = doneTodo(board, t.id, t.claimedBy!, 'Closed: its turn had ended', now())
          board = { ...board, todos: board.todos.map((x) => (x.id === t.id ? { ...x, closedAtTurnEnd: true } : x)) }
        }
        save(key, board)
      }
      let n = 0
      for (const t of load(key).todos.filter((x) => x.auto && !x.named).slice(0, 30)) if (await tidyOne(repoPath, t.id)) n++
      return n
    },

    // An agent, through the office tools: who it is and which message it said come from the app, not from the call.
    listForAgent(agentId: string, f: { list?: string; status?: TodoStatus; mine?: boolean }): Todo[] {
      const a = agentOf(agentId)
      return sorted(load(keyOf(a.repoPath)).todos).filter((t) => (f.status ? t.status === f.status : t.status !== 'done') && (!f.list || t.list === f.list) && (!f.mine || t.claimedBy?.id === a.id))
    },
    getForAgent(agentId: string, id: string): Todo {
      const a = agentOf(agentId)
      const t = load(keyOf(a.repoPath)).todos.find((x) => x.id === id)
      if (!t) throw new Error(`No todo ${id}.`)
      return t
    },
    addByAgent(agentId: string, i: { title: string; list?: string; notes?: string; needsYou?: boolean }): Todo {
      const a = agentOf(agentId)
      return change(a.repoPath, (b) => {
        const l = d.lastMessage(a.id)
        const r = addTodo(b, { ...i, list: i.list?.trim() ? listFor(b, i.list) : INBOX }, actor(a), now(), l && { ...l, excerpt: excerptOf(l.excerpt, 800) })
        return { board: r.board, out: r.todo }
      })
    },
    claimByAgent(agentId: string, id: string): Todo {
      const a = agentOf(agentId)
      return change(a.repoPath, (b) => {
        const board = claimTodo(b, id, actor(a), now())
        return { board, out: lastTodo(board, id) }
      })
    },
    doneByAgent(agentId: string, id: string, note: string, extra?: { how?: string; files?: string[]; title?: string; list?: string }): Todo {
      const a = agentOf(agentId)
      const t = change(a.repoPath, (b0) => {
        // Naming the task and sorting it into a list can be done as it is finished, which costs no call of its own.
        const b = extra?.title?.trim() || extra?.list?.trim() ? updateTodo(b0, id, { ...(extra.title?.trim() && { title: extra.title }), ...(extra.list?.trim() && { list: listFor(b0, extra.list) }) }, actor(a), now()) : b0
        const l = d.lastMessage(a.id)
        const board = doneTodo(b, id, actor(a), note, now(), l && { ...l, excerpt: excerptOf(l.excerpt, 2000) }, extra)
        return { board, out: lastTodo(board, id) }
      })
      recordWork(a, id)
      return t
    },
    updateByAgent(agentId: string, id: string, p: { title?: string; notes?: string; needsYou?: boolean; status?: TodoStatus; blockedWhy?: string; list?: string }): Todo {
      const a = agentOf(agentId)
      return change(a.repoPath, (b) => {
        const board = updateTodo(b, id, { ...p, ...(p.list?.trim() && { list: listFor(b, p.list) }) }, actor(a), now())
        return { board, out: lastTodo(board, id) }
      })
    }
  }
}

export type TodoService = ReturnType<typeof createTodoService>
