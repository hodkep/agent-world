import { type FindingKind, findingFiles } from './audit'
import type { MergeCheck } from './mergeCheck'

/** What the step that waits for the person shows, in the conversation: a card (or, once the audit was set aside, one quiet line). */
export interface StepCardSpec {
  kind: 'audit' | 'running' | 'clean' | 'failed' | 'hold' | 'aside' | 'unrelated'
  tag: string
  title: string
  /** What is left to look at, or what holds the merge, as lines: the first few. */
  lines: { text: string; where?: string; /** Of an audit finding: its place in the audit (what Seen and Add to plan are told), its kind, and every file it covers. */ index?: number; kind?: FindingKind; files?: string[] }[]
  /** How many more there are than the lines shown. */
  more: number
  /** `again` runs the audit: for one that failed, or (while git holds the merge) one that has not run for the branch as it is now. */
  actions: { seenAll: boolean; again: boolean; aside: boolean; undo: boolean }
  againLabel?: string
  /** Of an audit that is running: when it began. */
  since?: number
}

/** How long the line that says an audit found nothing stays. */
export const CLEAN_LINE_MS = 6000

const WHERE: Record<FindingKind, string> = { 'out-of-scope': 'out of scope', 'goal-unmet': 'goal not met', 'guess-wrong': 'guess may be wrong' }
const SHOWN = 4
const things = (n: number) => `${n} ${n === 1 ? 'thing' : 'things'}`
const none = { seenAll: false, again: false, aside: false, undo: false }

/**
 * The one card a run needs now, from what the merge check says: the audit's findings still to look at, an audit that failed, what holds the merge while git holds it,
 * or the quiet line for an audit the person set aside. Nothing while the agent works, and nothing for what needs no word from the person.
 */
export function stepCardOf(i: { merge: MergeCheck | null; held: boolean; working: boolean; /** The branch shares no history with its base (the base was rewritten): it cannot be landed until it is reset onto it. */ unrelated: { branch: string; base: string } | null; /** The time now, for what shows only for a few seconds. */ now?: number }): StepCardSpec | null {
  const { merge, held } = i
  if (i.working) return null
  if (i.unrelated) return { kind: 'unrelated', tag: 'NOT LANDABLE', title: `This branch does not come from ${i.unrelated.base}'s history: reset it onto ${i.unrelated.base} before landing`, lines: [], more: 0, actions: none }
  if (!merge) return null
  const a = merge.audit
  const unseen = a.state === 'done' ? a.findings.filter((f) => !f.seen) : []
  const findingLines = (a.state === 'done' ? a.findings.flatMap((f, index) => (f.seen ? [] : [{ f, index }])) : []).slice(0, SHOWN).map(({ f, index }) => {
    const files = findingFiles(f)
    const covers = files.length > 1 ? `${files.length} files` : files[0]
    return { text: f.text, where: [WHERE[f.kind], covers].filter(Boolean).join(' · '), index, kind: f.kind, files }
  })
  if (held) {
    if (merge.blocking.length === 0) return null
    const what = merge.land === 'pr' ? 'push' : 'merge'
    return { kind: 'hold', tag: merge.land === 'pr' ? 'PUSH HELD' : 'LAND HELD', title: merge.blocking.length === 1 ? `1 thing holds the ${what}` : `${merge.blocking.length} things hold the ${what}`, lines: [...merge.blocking.slice(0, SHOWN).map((text) => ({ text })), ...findingLines], more: Math.max(0, merge.blocking.length - SHOWN) + Math.max(0, unseen.length - SHOWN), actions: { ...none, seenAll: unseen.length > 0, again: a.state === 'not-run', aside: true }, ...(a.state === 'not-run' && { againLabel: 'Run the audit' }) }
  }
  if (merge.asideAudit) return { kind: 'aside', tag: 'SET ASIDE', title: `You set the audit aside${unseen.length ? ` · ${things(unseen.length)} not looked at` : ''}`, lines: [], more: 0, actions: { ...none, undo: true } }
  const commits = `${merge.commits} ${merge.commits === 1 ? 'commit' : 'commits'}`
  if (a.state === 'running') return { kind: 'running', tag: 'AUDIT', title: `Reviewing ${commits} against your plan`, lines: [], more: 0, actions: { ...none, aside: true }, since: a.since }
  if (a.state === 'done' && a.findings.length === 0 && (i.now ?? 0) - a.t < CLEAN_LINE_MS) return { kind: 'clean', tag: 'AUDIT', title: `Found nothing in ${commits}`, lines: [], more: 0, actions: none }
  if (a.state === 'failed') return { kind: 'failed', tag: 'AUDIT', title: 'The audit failed', lines: [{ text: a.reason }], more: 0, actions: { ...none, again: true, aside: true }, againLabel: 'Run the audit again' }
  if (unseen.length === 0) return null
  return { kind: 'audit', tag: 'AUDIT', title: `${things(unseen.length)} to look at`, lines: findingLines, more: Math.max(0, unseen.length - SHOWN), actions: { ...none, seenAll: true, aside: true } }
}
