import type { Todo } from './todos'

export type AskMode = 'ask' | 'work'

const SOURCE_MAX = 500

/** The message an agent gets when the person asks about a task: the task, what is known about it, and what is wanted. */
export function askMessage(t: Todo, mode: AskMode, words: string): string {
  const link = t.doneLink ?? t.createdLink
  const source = link?.excerpt.trim()
  const lines = [
    `About todo#${t.id} "${t.title}" (${t.list}, ${t.status}).`,
    t.notes && `Notes: ${t.notes}`,
    source && `Came from ${t.doneLink ? 'the message it was finished in' : 'the message it was made in'}:\n${source.length > SOURCE_MAX ? `${source.slice(0, SOURCE_MAX)}…` : source}`,
    mode === 'ask'
      ? 'I have a question about it; answer in your reply, and change nothing on the board unless I ask.'
      : `Please work on it. It is assigned to you already; call todo_done with a one-line note once its change is pushed (when I tell you to push) or has been tested, not when the code is merely written (todo_update with status blocked and why if you cannot).`,
    words.trim()
  ]
  return lines.filter(Boolean).join('\n\n')
}
