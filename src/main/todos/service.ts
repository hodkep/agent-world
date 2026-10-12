import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isWork, requestTitle } from '../../shared/todoTracking'
import { askMessage, type AskMode } from '../../shared/todoAsk'
import {
  addList, addTodo, askedTodo, assignTodo, claimTodo, doneTodo, emptyBoard, markStale, moveTodo, needsYou, removeList, removeTodo, renameList, reopenTodo, updateTodo,
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
        const r = addTodo(b, i, actor(a), now(), d.lastMessage(a.id))
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
    doneByAgent(agentId: string, id: string, note: string): Todo {
      const a = agentOf(agentId)
      return change(a.repoPath, (b) => {
        const board = doneTodo(b, id, actor(a), note, now(), d.lastMessage(a.id))
        return { board, out: lastTodo(board, id) }
      })
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
