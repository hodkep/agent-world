import type { Todo, TodoBoard, TodoStatus } from './todos'

export interface TodoHit {
  todo: Todo
  score: number
  /** Which parts of the task the words were found in ("title", "how", "files"…). */
  where: string[]
  /** A short piece of the best place the words were found. */
  snippet: string
}

interface Field {
  name: string
  weight: number
  text: string
}

const stem = (w: string) => w.toLowerCase().replace(/(ing|ed|es|s)$/, '')
const words = (q: string) => [...new Set((q.toLowerCase().match(/[a-z0-9_.#/-]+/g) ?? []).filter((w) => w.length > 1).map(stem))]

const fieldsOf = (t: Todo): Field[] =>
  [
    { name: 'title', weight: 4, text: t.title },
    { name: 'note', weight: 3, text: t.doneNote ?? '' },
    { name: 'how', weight: 3, text: t.doneHow ?? '' },
    { name: 'notes', weight: 2, text: t.notes },
    { name: 'files', weight: 2, text: (t.doneFiles ?? []).join(' ') },
    { name: 'commits', weight: 2, text: (t.doneCommits ?? []).map((c) => c.subject).join(' ') },
    { name: 'message', weight: 1, text: t.doneLink?.excerpt ?? t.createdLink?.excerpt ?? '' }
  ].filter((f) => f.text)

/** Looks for words across what a task holds, done ones included: its title, notes, how it was done, the files and commits, and the message it came from. Every word is wanted; when no task has them all, half is enough. */
export function searchTodos(b: TodoBoard, query: string, o: { status?: TodoStatus | 'any'; limit?: number } = {}): TodoHit[] {
  const q = words(query)
  if (!q.length) return []
  const scored = b.todos
    .filter((t) => !o.status || o.status === 'any' || t.status === o.status)
    .map((todo) => {
      let score = 0
      const found = new Set<string>()
      const where = new Set<string>()
      let best: { n: number; weight: number; text: string; word: string } | null = null
      for (const f of fieldsOf(todo)) {
        const hay = f.text.toLowerCase().split(/[^a-z0-9_.#/-]+/).map(stem)
        const joined = f.text.toLowerCase()
        const here = q.filter((w) => hay.includes(w) || joined.includes(w))
        for (const w of here) {
          score += f.weight
          found.add(w)
          where.add(f.name)
        }
        // The snippet comes from the place with the most of the words, then the heaviest.
        if (here.length && (!best || here.length > best.n || (here.length === best.n && f.weight > best.weight))) best = { n: here.length, weight: f.weight, text: f.text, word: here[0]! }
      }
      const at = best ? best.text.toLowerCase().indexOf(best.word) : -1
      const snippet = best ? best.text.replace(/\s+/g, ' ').slice(Math.max(0, at - 40), Math.max(0, at - 40) + 140).trim() : ''
      return { todo, score, found: found.size, where: [...where], snippet }
    })
  const all = scored.filter((x) => x.found === q.length)
  const pool = all.length ? all : scored.filter((x) => x.found >= Math.ceil(q.length / 2) && x.found > 0)
  return pool
    .sort((a, b) => b.score - a.score || (b.todo.doneAt ?? b.todo.updatedAt) - (a.todo.doneAt ?? a.todo.updatedAt))
    .slice(0, o.limit ?? 10)
    .map(({ todo, score, where, snippet }) => ({ todo, score, where, snippet }))
}
