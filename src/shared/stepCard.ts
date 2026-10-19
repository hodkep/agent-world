import type { FindingKind } from './audit'
import type { MergeCheck } from './mergeCheck'

/** What the step that waits for the person shows, in the conversation: a card (or, once the audit was set aside, one quiet line). */
export interface StepCardSpec {
  kind: 'audit' | 'failed' | 'hold' | 'aside' | 'unrelated'
  tag: string
  title: string
  /** What is left to look at, or what holds the merge, as lines: the first few. */
  lines: { text: string; where?: string }[]
  /** How many more there are than the lines shown. */
  more: number
  /** `again` runs the audit: for one that failed, or (while git holds the merge) one that has not run for the branch as it is now. */
  actions: { seenAll: boolean; again: boolean; aside: boolean; undo: boolean }
  againLabel?: string
}

const WHERE: Record<FindingKind, string> = { 'out-of-scope': 'out of scope', 'goal-unmet': 'goal not met', 'guess-wrong': 'guess may be wrong' }
const SHOWN = 4
const things = (n: number) => `${n} ${n === 1 ? 'thing' : 'things'}`
const none = { seenAll: false, again: false, aside: false, undo: false }

/**
 * The one card a run needs now, from what the merge check says: the audit's findings still to look at, an audit that failed, what holds the merge while git holds it,
 * or the quiet line for an audit the person set aside. Nothing while the agent works, and nothing for what needs no word from the person.
 */
export function stepCardOf(i: { merge: MergeCheck | null; held: boolean; working: boolean; /** The branch shares no history with its base (the base was rewritten): it cannot be landed until it is reset onto it. */ unrelated: { branch: string; base: string } | null }): StepCardSpec | null {
  const { merge, held } = i
  if (i.working) return null
  if (i.unrelated) return { kind: 'unrelated', tag: 'NOT LANDABLE', title: `This branch does not come from ${i.unrelated.base}'s history: reset it onto ${i.unrelated.base} before landing`, lines: [], more: 0, actions: none }
  if (!merge) return null
  const a = merge.audit
  const unseen = a.state === 'done' ? a.findings.filter((f) => !f.seen) : []
  const findingLines = unseen.slice(0, SHOWN).map((f) => ({ text: f.text, where: [WHERE[f.kind], f.file].filter(Boolean).join(' · ') }))
  if (held) {
    if (merge.blocking.length === 0) return null
    return { kind: 'hold', tag: 'LAND HELD', title: merge.blocking.length === 1 ? '1 thing holds the merge' : `${merge.blocking.length} things hold the merge`, lines: merge.blocking.slice(0, SHOWN).map((text) => ({ text })), more: Math.max(0, merge.blocking.length - SHOWN), actions: { ...none, seenAll: unseen.length > 0, again: a.state === 'not-run', aside: true }, ...(a.state === 'not-run' && { againLabel: 'Run the audit' }) }
  }
  if (merge.asideAudit) return { kind: 'aside', tag: 'SET ASIDE', title: `You set the audit aside${unseen.length ? ` · ${things(unseen.length)} not looked at` : ''}`, lines: [], more: 0, actions: { ...none, undo: true } }
  if (a.state === 'failed') return { kind: 'failed', tag: 'AUDIT', title: 'The audit failed', lines: [{ text: a.reason }], more: 0, actions: { ...none, again: true, aside: true }, againLabel: 'Run the audit again' }
  if (unseen.length === 0) return null
  return { kind: 'audit', tag: 'AUDIT', title: `${things(unseen.length)} to look at`, lines: findingLines, more: Math.max(0, unseen.length - SHOWN), actions: { ...none, seenAll: true, aside: true } }
}
