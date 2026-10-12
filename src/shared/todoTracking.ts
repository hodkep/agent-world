/** How far agents are asked to keep the todo board: 'deferred' records only what is put off; 'full' tracks every request. People add to the board by hand in both. */
export type TodoTracking = 'deferred' | 'full'

const DEFER = /\b(later|for now|not now|defer(red)?|backlog|next time|another time|come back to|park (it|that|this)|leave (it|that|this) for|skip (it|that|this)? ?for now|not (yet|today)|tomorrow)\b/i

/** One short paragraph in an agent's opening text; paid for in every session, so it is kept brief. */
export function trackingHint(mode: TodoTracking): string {
  if (mode === 'full') {
    return 'This project keeps a todo board the person watches. The app records every request you are given as a task for you. Work on it, add a task with todo_add for anything you split off or put off on purpose, and call todo_done with a one-line note when you finish (todo_update with status blocked and a reason if you cannot). Name a task as todo#N in your replies so it links to the board. Keep tasks in a few lists by area (Application, Canvas…), never a catch-all. Before work that may have been done before, search the finished tasks with todo_search; when you finish one, say how in todo_done.'
  }
  return 'This project keeps a todo board the person watches. When something is put off or left out on purpose (by you or by them), record it with todo_add, with the reason in the notes, so it is not forgotten. Add other tasks only when asked. Name a task as todo#N in your replies so it links to the board. Keep tasks in a few lists by area (Application, Canvas…), never a catch-all. Before work that may have been done before, search the finished tasks with todo_search; when you finish one, say how in todo_done.'
}

/** A line for a message that looks like work already done: which tasks, who did them, and how to find out how. Empty when nothing looks alike. */
export function similarLine(found: { id: string; title: string; by: string }[]): string {
  if (!found.length) return ''
  const list = found.map((f) => `todo#${f.id} "${f.title.slice(0, 70)}" (done by ${f.by})`).join('; ')
  return `Done before: ${list}. If it is the same kind of work, read how with todo_get, or ask whoever did it, before starting.`
}

// What leads a message without saying what is wanted: an approval, a go-ahead, a polite opener.
const LEAD = /^(?:not yet|yes|yep|yeah|ok(?:ay)?|sure|great|good|nice|cool|thanks?|thank you|these are good|that works|that is good|looks good(?: to me)?|lgtm|go ahead|do it|continue|proceed|please|pls|kindly|can you|could you|would you|will you|i want you to|i would like you to|we need to|lets|let's)\b[\s,.!:;-]*/i
const GIT_ONLY = /^(?:(?:and|then|also)\s+)*(?:commit|merge|push|pull|rebase|deploy|tag)\b/i

/** The words of a message without its approvals and polite openers: what it actually asks for. */
function ask(prompt: string): string {
  let t = prompt.trim()
  for (let n = 0; n < 6; n++) {
    const next = t.replace(LEAD, '')
    if (next === t) break
    t = next
  }
  return t.trim()
}

/** A request with some substance: not a thank-you, an approval, a plain git instruction (commit, merge, push), a slash command or a one-word answer. */
export function isWork(prompt: string): boolean {
  const t = prompt.trim()
  if (!t || t.startsWith('/')) return false
  const words = ask(t).split(/\s+/).filter(Boolean)
  if (words.length < 4) return false
  // "commit those and merge to main" is an order to do git, not a piece of work to track; a long message that also commits is still work.
  if (words.length <= 9 && GIT_ONLY.test(words.join(' '))) return false
  return true
}

/** The title of the task made for a request: your own words (not the quoted ones), without the approval before them, up to the end of the first sentence or about 80 characters. The agent is asked to name it properly. */
export function requestTitle(prompt: string): string {
  const lines = prompt
    .replace(/<\/?[a-z_][a-z0-9_-]*(\s[^>]*)?>/gi, '\n')
    .split('\n')
    .map((l) => l.replace(/@"[^"]*"/g, '').trim())
    .filter((l) => l && !l.startsWith('>'))
  const line = lines[0] ?? ''
  const own = ask(line) || line
  if (!own) return 'Request'
  const sentence = /^(.{12,}?[.?!])(?:\s|$)/.exec(own)?.[1] ?? own
  if (sentence.length <= 80) return sentence
  const cut = sentence.slice(0, 80)
  const at = cut.lastIndexOf(' ')
  return `${(at > 30 ? cut.slice(0, at) : cut).trimEnd()}…`
}

/** The person is putting something off. */
export const deferralCue = (prompt: string): boolean => DEFER.test(prompt)

/** What is added to a message an agent is sent, in the mode in force: nothing most of the time. */
export function reminderLine(mode: TodoTracking, prompt: string, made?: { id: string; list: string }, lists: string[] = []): string {
  if (mode === 'full') {
    if (!made) return ''
    const where = lists.length ? `a list by area: ${lists.slice(0, 8).join(', ')}, or a new area only if none fits` : 'a list named for its area (Application, Canvas…)'
    return `todo#${made.id} (${made.list}) tracks this request, and you are on it. When you know what it is, call todo_update with a title that says what is being done (your words) and ${where}. Call todo_done when it is finished, or todo_update with status blocked and why.`
  }
  return deferralCue(prompt) ? 'If this puts something off, record it with todo_add so it is not forgotten.' : ''
}

/** Tokens in a text, roughly: four characters each. */
const tokens = (s: string) => Math.ceil(s.length / 4)
/** What the call that finishes a task adds to the conversation, with its answer. */
const DONE_CALL_TOKENS = 120

/** What each mode adds to the agent's context, on assumptions a person can read: once per session, and per request. */
export function trackingCost(mode: TodoTracking) {
  const perRequest = mode === 'full' ? tokens(reminderLine('full', 'x', { id: '12', list: 'Inbox' }, ['Application', 'Canvas', 'Library', 'Release'])) + DONE_CALL_TOKENS : 0
  const opening = tokens(trackingHint(mode))
  const sessions = [
    { label: 'A short task', requests: 3 },
    { label: 'A normal session', requests: 12 },
    { label: 'A long day', requests: 50 }
  ]
  return { opening, perRequest, sessions: sessions.map((s) => ({ ...s, tokens: opening + s.requests * perRequest })) }
}
