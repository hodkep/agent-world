/** How far agents are asked to keep the todo board: 'deferred' records only what is put off; 'full' tracks every request. People add to the board by hand in both. */
export type TodoTracking = 'deferred' | 'full'

const DEFER = /\b(later|for now|not now|defer(red)?|backlog|next time|another time|come back to|park (it|that|this)|leave (it|that|this) for|skip (it|that|this)? ?for now|not (yet|today)|tomorrow)\b/i
const SMALL_TALK = /^(ok(ay)?|yes|no|yep|nope|thanks?|thank you|thx|cool|great|nice|sure|go on|continue|go ahead|proceed|done|good|lgtm|stop|wait|hi|hello|hey)\b[\s.,!?]*(go on|continue|please)?[\s.,!?]*$/i

/** One short paragraph in an agent's opening text; paid for in every session, so it is kept brief. */
export function trackingHint(mode: TodoTracking): string {
  if (mode === 'full') {
    return 'This project keeps a todo board the person watches. The app records every request you are given as a task for you. Work on it, add a task with todo_add for anything you split off or put off on purpose, and call todo_done with a one-line note when you finish (todo_update with status blocked and a reason if you cannot). Name a task as todo#N in your replies so it links to the board. Before work that may have been done before, search the finished tasks with todo_search; when you finish one, say how in todo_done.'
  }
  return 'This project keeps a todo board the person watches. When something is put off or left out on purpose (by you or by them), record it with todo_add, with the reason in the notes, so it is not forgotten. Add other tasks only when asked. Name a task as todo#N in your replies so it links to the board. Before work that may have been done before, search the finished tasks with todo_search; when you finish one, say how in todo_done.'
}

/** A line for a message that looks like work already done: which tasks, who did them, and how to find out how. Empty when nothing looks alike. */
export function similarLine(found: { id: string; title: string; by: string }[]): string {
  if (!found.length) return ''
  const list = found.map((f) => `todo#${f.id} "${f.title.slice(0, 70)}" (done by ${f.by})`).join('; ')
  return `Done before: ${list}. If it is the same kind of work, read how with todo_get, or ask whoever did it, before starting.`
}

/** A request with some substance: not a thank-you, a slash command or a one-word answer. */
export function isWork(prompt: string): boolean {
  const t = prompt.trim()
  if (!t || t.startsWith('/')) return false
  if (SMALL_TALK.test(t)) return false
  return t.split(/\s+/).length >= 4
}

/** The first line of a request, as the title of the task made for it. */
export function requestTitle(prompt: string): string {
  const lines = prompt
    .replace(/<\/?[a-z_][a-z0-9_-]*(\s[^>]*)?>/gi, '\n')
    .split('\n')
    .map((l) => l.replace(/@"[^"]*"/g, '').trim())
    .filter(Boolean)
  return (lines[0] ?? 'Request').slice(0, 120)
}

/** The person is putting something off. */
export const deferralCue = (prompt: string): boolean => DEFER.test(prompt)

/** What is added to a message an agent is sent, in the mode in force: nothing most of the time. */
export function reminderLine(mode: TodoTracking, prompt: string, made?: { id: string; list: string }): string {
  if (mode === 'full') {
    return made ? `todo#${made.id} (${made.list}) tracks this request, and you are on it. Call todo_done when it is finished, or todo_update with status blocked and why.` : ''
  }
  return deferralCue(prompt) ? 'If this puts something off, record it with todo_add so it is not forgotten.' : ''
}

/** Tokens in a text, roughly: four characters each. */
const tokens = (s: string) => Math.ceil(s.length / 4)
/** What the call that finishes a task adds to the conversation, with its answer. */
const DONE_CALL_TOKENS = 120

/** What each mode adds to the agent's context, on assumptions a person can read: once per session, and per request. */
export function trackingCost(mode: TodoTracking) {
  const perRequest = mode === 'full' ? tokens(reminderLine('full', 'x', { id: '12', list: 'Requests' })) + DONE_CALL_TOKENS : 0
  const opening = tokens(trackingHint(mode))
  const sessions = [
    { label: 'A short task', requests: 3 },
    { label: 'A normal session', requests: 12 },
    { label: 'A long day', requests: 50 }
  ]
  return { opening, perRequest, sessions: sessions.map((s) => ({ ...s, tokens: opening + s.requests * perRequest })) }
}
