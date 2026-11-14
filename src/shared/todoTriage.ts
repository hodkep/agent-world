import { isGenericList } from './todos'

export interface TriageInput {
  /** What the person just sent the agent. */
  message: string
  /** The task the agent is on, if any: where a correction or a fix belongs. */
  current?: { id: string; title: string }
  /** The agent's last few tasks, newest last. */
  recent: { id: string; title: string; status: string }[]
  /** What the agent last said: the thing a short follow-up ("no, make it two lines") is about. */
  said?: string
  /** The task and step of the agent's open workflow run, when there is one. */
  run?: string
  /** The lists the board already has. */
  lists: string[]
}

export type Triage = { action: 'none' } | { action: 'subtask'; parent: string; title: string; list?: string } | { action: 'new'; title: string; list?: string }

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s.trim())

/** What a small model is asked about a message: short, because it is paid for on every message that gets past the rules. */
export function triagePrompt(i: TriageInput): string {
  const task = (t: { id: string; title: string }) => `todo#${t.id} "${clip(t.title, 80)}"`
  return [
    'You keep a project\'s todo board. The person just sent an agent a message. Decide whether it is a piece of work worth a task of its own, and answer with JSON only.',
    '{"action": "none"}: only a question, an explanation, chat, an approval, a go-ahead, a chore (commit, push, rebase, start or stop a test instance) or a step of the workflow the agent is already following. A message that asks the agent to do or change something is never none.',
    '{"action": "subtask", "parent": "<todo number>", "title": "..."}: a correction, a bug fix, or a follow-up that changes, extends or redoes the work of one of the tasks below or what the agent last said (for example "no, make it two lines", "also on Safari", "use blue instead"), even when that task is already done.',
    '{"action": "new", "title": "...", "list": "..."}: a change of direction or a new piece of work that none of the tasks below covers.',
    'title: one line, at most 70 characters, starting with a verb, in your words, not the person\'s. list (new only): the part of the project it belongs to, one or two words; use an existing list when one fits; never Misc, Other, General or the app\'s own name.',
    i.lists.length ? `Lists: ${i.lists.slice(0, 8).join(', ')}.` : 'There are no lists yet.',
    i.current ? `The agent is on ${task(i.current)}.` : 'The agent has no task in hand.',
    i.said ? `The agent last said: ${clip(i.said, 400)}` : '',
    i.run ? `Its workflow run is open: ${clip(i.run, 120)}. A message that only moves that run along is none.` : '',
    i.recent.length ? `Its recent tasks: ${i.recent.slice(-5).map((t) => `${task(t)} (${t.status})`).join('; ')}.` : '',
    `Message: ${clip(i.message, 900)}`
  ]
    .filter(Boolean)
    .join('\n')
}

/** What a model answered; `none` whenever the answer cannot be trusted (unreadable, an unknown parent, no title), so a bad answer costs a missed task, not a wrong one. */
export function parseTriage(text: string, known: string[]): Triage {
  const none: Triage = { action: 'none' }
  const m = /\{[\s\S]*\}/.exec(text)
  if (!m) return none
  let j: { action?: unknown; parent?: unknown; title?: unknown; list?: unknown }
  try {
    j = JSON.parse(m[0])
  } catch {
    return none
  }
  if (!j || typeof j !== 'object') return none
  const title = typeof j.title === 'string' ? clip(j.title.replace(/\s+/g, ' '), 99) : ''
  const l = typeof j.list === 'string' ? j.list.trim().slice(0, 60) : ''
  const list = l && !isGenericList(l) ? l : undefined
  if (j.action === 'new' && title) return { action: 'new', title, ...(list && { list }) }
  if (j.action === 'subtask' && title && typeof j.parent === 'string' && known.includes(j.parent)) return { action: 'subtask', parent: j.parent, title }
  return none
}
