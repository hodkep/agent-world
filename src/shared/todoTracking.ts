/** How far agents are asked to keep the todo board: 'deferred' records only what is put off; 'full' tracks every request. People add to the board by hand in both. */
export type TodoTracking = 'deferred' | 'full'

const DEFER = /\b(later|for now|not now|defer(red)?|backlog|next time|another time|come back to|park (it|that|this)|leave (it|that|this) for|skip (it|that|this)? ?for now|not (yet|today)|tomorrow)\b/i

/** One short paragraph in an agent's opening text; paid for in every session, so it is kept brief. */
export function trackingHint(mode: TodoTracking): string {
  if (mode === 'full') {
    return 'This project keeps a todo board the person watches. The app makes a task for you, in the background, when the person\'s message is implementation or research work: new work, a correction or a bug fix (a part of the task it belongs to); a question or chat makes none. Work on it, add a task with todo_add (with a label for the kind of work: feature, bug, research, design, chore, test or release) for anything you split off or put off on purpose, and call todo_done with a one-line note only once its change is pushed (when the person told you to push, tested or not) or has been tested, by you or by them, not when the code is merely written: until then leave it doing (todo_update with status blocked and a reason if you cannot). A push, a pull request or a fix to the review of a task on the board is part of that task: pass parent, its number. A question or research is done when answered. Name a task as todo#N in your replies so it links to the board. Keep tasks in lists by feature (Library, Chat, Settings…), never the app itself and never a catch-all. Before work that may have been done before, search the finished tasks with todo_search; when you finish one, say how in todo_done.'
  }
  return 'This project keeps a todo board the person watches. When something is put off or left out on purpose (by you or by them), record it with todo_add, with a label for the kind of work (feature, bug, research, design, chore, test or release) and the reason in the notes, so it is not forgotten. Add other tasks only when asked. Name a task as todo#N in your replies so it links to the board. Keep tasks in lists by feature (Library, Chat, Settings…), never the app itself and never a catch-all. Before work that may have been done before, search the finished tasks with todo_search; when you finish one, say how in todo_done.'
}

/** A line for a message that looks like work already done: which tasks, who did them, and how to find out how. Empty when nothing looks alike. */
export function similarLine(found: { id: string; title: string; by: string }[]): string {
  if (!found.length) return ''
  const list = found.map((f) => `todo#${f.id} "${f.title.slice(0, 70)}" (done by ${f.by})`).join('; ')
  return `Done before: ${list}. If it is the same kind of work, read how with todo_get, or ask whoever did it, before starting.`
}

// What leads a message without saying what is wanted: an approval, a go-ahead, a polite opener.
const LEAD = /^(?:not yet|yes|yep|yeah|ok(?:ay)?|sure|great|good|nice|cool|thanks?|thank you|these are good|that works|that is good|looks good(?: to me)?|lgtm|go ahead|do it|continue|proceed|please|pls|kindly|can you|could you|would you|will you|i want you to|i would like you to|we need to|lets|let's)\b[\s,.!:;-]*/i
const GIT_ONLY = /^(?:(?:and|then|also)\s+)*(?:commit|merge|push|pull|rebase|deploy|tag|fetch|checkout|stash|squash|cherry-pick|force[- ]push|open (?:a |the )?(?:pr|pull request))\b/i
// What a later part of a git order asks for when it is more than git: "push it, then add a search box".
const WORK_AFTER = /^(?:(?:and|then|also|now)\s+)*(?:add(?! to\b)|fix|implement|build|create|write|make|change|update|refactor|remove|delete|test|run|investigate|look|check|explain|why|how|what|find|debug|resolve)\b/i

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

// What the harness or the app puts into a conversation that nobody typed: a background task finishing, a hook's note, a command's output.
const SYSTEM = /^<(task-notification|system-reminder|local-command-[a-z]+|command-(?:name|message|args)|bash-(?:input|stdout|stderr)|user-prompt-submit-hook)\b/i
/** A message nobody typed: not a request. */
export const isSystemMessage = (text: string): boolean => SYSTEM.test(text.trim())

// What the app itself says to an agent: a Run press, an approval, a step marked done, a subagent's report. Another agent's message ("Message from os: …") is not one: it may be a request.
const APP_LINE = /^\[(?:Agent World\](?! Message from )|Subagent hand-back\])/
/** A line the app wrote into the conversation: part of the workflow, never a request. */
export const isAppLine = (text: string): boolean => APP_LINE.test(text.trim())

/** A request with some substance: not a thank-you, an approval, a plain git instruction (commit, merge, push), a slash command or a one-word answer. */
export function isWork(prompt: string): boolean {
  const t = prompt.trim()
  if (!t || t.startsWith('/') || isSystemMessage(t)) return false
  const words = ask(t).split(/\s+/).filter(Boolean)
  if (words.length < 4) return false
  // "commit those and merge to main", or "push 10 commits to a separate branch without opening a PR", is an order to do git, not a piece of work to track;
  // a message that goes on to ask for something else ("push it, then add a search box") is still work.
  const parts = words.join(' ').split(/,\s*|;\s*|\s+(?=(?:and|then)\s)/i)
  if (words.length <= 25 && GIT_ONLY.test(parts[0]!) && !parts.slice(1).some((p) => WORK_AFTER.test(p.trim()))) return false
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

/** What is added to a message an agent is sent: nothing most of the time, in either mode (in full mode the app decides in the background whether the message is a task). */
export const reminderLine = (prompt: string): string => (deferralCue(prompt) ? 'If this puts something off, record it with todo_add so it is not forgotten.' : '')

/** Tokens in a text, roughly: four characters each. */
const tokens = (s: string) => Math.ceil(s.length / 4)
/** What the call that finishes a task adds to the conversation, with its answer. */
const DONE_CALL_TOKENS = 120

/** What each mode adds to the agent's context, on assumptions a person can read: once per session, and per request. */
export function trackingCost(mode: TodoTracking) {
  const perRequest = mode === 'full' ? DONE_CALL_TOKENS : 0
  const opening = tokens(trackingHint(mode))
  const sessions = [
    { label: 'A short task', requests: 3 },
    { label: 'A normal session', requests: 12 },
    { label: 'A long day', requests: 50 }
  ]
  return { opening, perRequest, sessions: sessions.map((s) => ({ ...s, tokens: opening + s.requests * perRequest })) }
}
