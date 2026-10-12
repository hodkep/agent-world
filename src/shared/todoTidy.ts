import { isGenericList } from './todos'

export interface TidyInput {
  /** What the person asked, as written. */
  request: string
  /** What the agent said when it finished. */
  reply: string
  /** The subjects of the commits it made meanwhile. */
  commits: string[]
  /** The lists the board already has. */
  lists: string[]
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s.trim())

/** What a small model is asked to name and sort a finished task: short, because it is paid for on every request. */
export function tidyPrompt(i: TidyInput): string {
  const lists = i.lists.length ? `Existing lists: ${i.lists.slice(0, 8).join(', ')}.` : 'There are no lists yet.'
  return [
    'You file finished work on a project\'s todo board. Read the request, what the agent said when it finished, and its commits, then answer with JSON only: {"title": "...", "list": "..."}.',
    'title: one line, at most 70 characters, starting with a verb, saying what was done or decided (not the person\'s words, not a question).',
    `list: the part of the project it belongs to, one or two words (for example Application, Canvas, Library, Terminal, Release). ${lists} Use an existing list when one fits; make a new area only when none does. Never use Misc, Other, General, Requests or Tasks.`,
    `Request: ${clip(i.request, 700)}`,
    `Agent said: ${clip(i.reply, 900)}`,
    i.commits.length ? `Commits: ${i.commits.slice(0, 6).map((c) => clip(c, 120)).join(' | ')}` : ''
  ]
    .filter(Boolean)
    .join('\n')
}

/** The title and list a model answered, or null when it did not answer with a usable title. A catch-all list is dropped (the task stays where it is). */
export function parseTidy(text: string): { title: string; list: string | undefined } | null {
  const m = /\{[\s\S]*\}/.exec(text)
  if (!m) return null
  let j: unknown
  try {
    j = JSON.parse(m[0])
  } catch {
    return null
  }
  if (!j || typeof j !== 'object') return null
  const { title, list } = j as { title?: unknown; list?: unknown }
  if (typeof title !== 'string' || !title.trim()) return null
  const l = typeof list === 'string' ? list.trim().slice(0, 60) : ''
  return { title: clip(title.replace(/\s+/g, ' '), 99), list: l && !isGenericList(l) ? l : undefined }
}
