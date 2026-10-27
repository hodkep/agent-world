import { useSyncExternalStore } from 'react'
import type { MessageLink, TodoBoard } from '../../shared/todos'

/** What the chat needs to know about the open project's tasks to draw a link to one: its title and state. Kept apart from the board window so a link works anywhere. */
export interface TodoBrief {
  title: string
  state: 'open' | 'need' | 'doing' | 'blocked' | 'done'
  /** The message it was finished in, else the one it was made in. */
  link?: MessageLink
  /** The task this one is a part of. */
  parent?: string
}

let briefs = new Map<string, TodoBrief>()
let current: TodoBoard | null = null
let version = 0
const listeners = new Set<() => void>()

export function setTodoBoard(board: TodoBoard | null) {
  current = board
  briefs = new Map((board?.todos ?? []).map((t) => [t.id, { title: t.title, state: t.status === 'done' ? 'done' : t.status === 'doing' ? 'doing' : t.status === 'blocked' ? 'blocked' : t.needsYou ? 'need' : 'open', ...((t.doneLink ?? t.createdLink) && { link: (t.doneLink ?? t.createdLink)! }), ...(t.parent && { parent: t.parent }) }]))
  version++
  for (const l of listeners) l()
}

/** The open project's whole board, for a number made from it (how many tasks an agent changed). */
export const todoBoardNow = (): TodoBoard | null => current

export const todoBrief = (id: string): TodoBrief | undefined => briefs.get(id)

/** A task's number, after its umbrella's when it is a part of one: "#2 › #3". */
export function todoPath(id: string, prefix = '#'): string {
  const parent = briefs.get(id)?.parent
  return parent ? `${prefix}${parent} › ${prefix}${id}` : `${prefix}${id}`
}

/** Re-renders when any task's title or state changes. */
export function useTodoVersion(): number {
  return useSyncExternalStore((cb) => (listeners.add(cb), () => void listeners.delete(cb)), () => version)
}

export const OPEN_TODO = 'aw-open-todo'

/** Opens the Todos window on a task, from anywhere a link to it is drawn. */
export const openTodo = (id: string) => window.dispatchEvent(new CustomEvent(OPEN_TODO, { detail: id }))

export const OPEN_MESSAGE = 'aw-open-message'

/** Opens the chat of the agent that said something, at that message (what a task points back at). */
export const openMessage = (link: MessageLink) => window.dispatchEvent(new CustomEvent(OPEN_MESSAGE, { detail: link }))
