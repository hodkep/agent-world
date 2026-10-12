import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isWork, requestTitle } from '../../shared/todoTracking'
import { askMessage, type AskMode } from '../../shared/todoAsk'
import { searchTodos, type TodoHit } from '../../shared/todoSearch'
import { matchItems } from '../library/match'
import {
  addList, addTodo, askedTodo, assignTodo, attachWork, claimTodo, doneTodo, emptyBoard, excerptOf, knowledgeLine, markStale, moveTodo, needsYou, removeList, removeTodo, renameList, reopenTodo, updateTodo,
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
  /** Writes a line into the project's shared memory. */
  remember: (repoPath: string, text: string, by: string) => void
  now?: () => number
  onChange: (workspace: string) => void
}

const YOU: Actor = { kind: 'human', name: 'you' }

/** The todo boards, one per project, kept in files and changed either by the person (in the window) or by an agent (through the office tools). */
export function createTodoService(d: TodoDeps) {
  const now = d.now ?? Date.now
  const cache = new Map<string, TodoBoard>()
  mkdirSync(d.dir, { recursive: true })
  const fileOf = (key: string) => join(d.dir, `${key.replace(/[^a-zA-Z0-9._-]/g, '_')}.json`)

  function load(key: string): TodoBoard {
    const hit = cache.get(key)
    if (hit) return hit
    let b = emptyBoard()
    try {
      if (existsSync(fileOf(key))) {
        const j = JSON.parse(readFileSync(fileOf(key), 'utf8')) as Partial<TodoBoard>
        if (Array.isArray(j.lists) && Array.isArray(j.todos) && typeof j.next === 'number') b = j as TodoBoard
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
  // Finished tasks pointed at an agent, and when, so the same one is not pointed at again at once.
  const asks = new Map<string, number>()
  const shown = new Map<string, number>()
  const POINT_GAP = 10
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
      return change(a.repoPath, (b) => {
        const made = addTodo(b, { title: requestTitle(prompt), list: 'Requests', notes: prompt.trim().length > 120 ? prompt.trim().slice(0, 1000) : '', auto: true }, YOU, now(), d.lastRequest(a.id, prompt))
        const board = claimTodo(made.board, made.todo.id, actor(a), now())
        return { board, out: lastTodo(board, made.todo.id) }
      })
    },
    /** An agent's turn ended: what was made for its requests and it is still on is flagged, so the board does not claim work is in hand. */
    turnEnded(agentId: string) {
      const a = d.agent(agentId)
      if (!a) return
      const key = keyOf(a.repoPath)
      const b = load(key)
      const next = markStale(b, agentId, now())
      if (next.todos.some((t, i) => t.stale !== b.todos[i]!.stale)) save(key, next)
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
        const r = addTodo(b, i, actor(a), now(), l && { ...l, excerpt: excerptOf(l.excerpt, 800) })
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
    doneByAgent(agentId: string, id: string, note: string, extra?: { how?: string; files?: string[] }): Todo {
      const a = agentOf(agentId)
      const t = change(a.repoPath, (b) => {
        const l = d.lastMessage(a.id)
        const board = doneTodo(b, id, actor(a), note, now(), l && { ...l, excerpt: excerptOf(l.excerpt, 2000) }, extra)
        return { board, out: lastTodo(board, id) }
      })
      recordWork(a, id)
      return t
    },
    updateByAgent(agentId: string, id: string, p: { title?: string; notes?: string; needsYou?: boolean; status?: TodoStatus; blockedWhy?: string }): Todo {
      const a = agentOf(agentId)
      return change(a.repoPath, (b) => {
        const board = updateTodo(b, id, p, actor(a), now())
        return { board, out: lastTodo(board, id) }
      })
    }
  }
}

export type TodoService = ReturnType<typeof createTodoService>
