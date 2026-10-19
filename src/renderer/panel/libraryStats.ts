import type { Summary, Tally } from '../../shared/library'

export type Health = 'bad' | 'mid' | 'good' | 'few'
/** What the numbers say about a rule: most agents said no (the "when" is too wide), related prompts were passed over in silence, fair, working, too few to judge. */
export type Kind = 'broad' | 'ignored' | 'fair' | 'working' | 'few'
export interface ReachRow {
  id: string
  /** How often the rulebook reminder named it, whatever the prompt was about. */
  reminded: number
  /** On how many of those the prompt looked related to it: the rule is judged on these. */
  related: number
  /** Of the related ones, how often the agent then read it (in that launch, from then on). */
  read: number
  health: Health
  kind: Kind
  text: string
  /** The agent said it did not apply. */
  declined: number
  /** Related, not read, and no word from the agent. */
  silent: number
  /** What agents said when they passed it over, the most common first. */
  reasons: { text: string; n: number }[]
  /** What to try when most said no, or when it is passed over (empty otherwise). */
  advice: string
}

const ORDER: Record<Health, number> = { bad: 0, mid: 1, good: 2, few: 3 }
// Below this many related prompts there is not enough to say anything about an item.
const ENOUGH = 3

const zero: Tally = { delivered: 0, triggered: 0, answered: 0, used: 0, declined: 0, related: 0, relatedAnswered: 0 }

/**
 * Per item, on the prompts that looked related to it: how often agents read it, said no, or passed it over in silence, with a plain verdict; the ones that need attention first.
 * The reminders that came on prompts about something else are shown only as a count: an agent is told to say nothing about a rule that does not apply.
 */
export function reachedFor(s: Summary, program: string, whenOf: (id: string) => string): { rows: ReachRow[]; reminded: number; related: number; read: number; declined: number; share: number } {
  const rows: ReachRow[] = []
  for (const i of Object.values(s.items)) {
    const t = program === 'both' ? i : (i.byProvider[program] ?? zero)
    if (!t.triggered) continue
    const related = t.related ?? 0
    const read = t.relatedAnswered ?? 0
    const declined = t.declined ?? 0
    const silent = Math.max(0, related - read - declined)
    const share = related ? read / related : 0
    let kind: Kind
    let text: string
    let advice = ''
    // What the agents decided does not depend on which prompts were noted as related: with none noted (older entries) the reads are counted as they were.
    const judgedRead = related ? read : t.answered
    const when = whenOf(i.id) ? '' : ' It has no "when": write one.'
    if (declined >= 3 && declined >= judgedRead * 2) {
      kind = 'broad'
      advice = 'Most said no, so the "when" fits more work than the item does. Make it narrower.'
      const lead = related ? `Looked related ${related} times` : `Reminded ${t.triggered} times`
      text = `${lead}: read ${judgedRead}, said no ${declined}. Most said no, so the "when" fits more work than this item does. Make it narrower.${when}`
    } else if (related < ENOUGH) {
      kind = 'few'
      text = related === 0 ? `Reminded ${t.triggered} times, none yet on a prompt that looked related. Too few to judge yet.` : `Reminded ${t.triggered} times; only ${related} looked related. Too few to judge yet.`
    } else if (silent >= Math.max(3, related * 0.5)) {
      kind = 'ignored'
      advice = 'It is passed over when it applies. Make it firm, or a step.'
      text = `Looked related ${related} times: read ${read}, said no ${declined}, passed over ${silent} without a word. It is being ignored when it applies: make it firm or a step.`
    } else if (share < 0.7) {
      kind = 'fair'
      text = `Looked related ${related} times: read ${read} (${Math.round(share * 100)}%), said no ${declined}. Fine for a gentle rule.`
    } else {
      kind = 'working'
      text = `Looked related ${related} times, read ${read} (${Math.round(share * 100)}%). Working.`
    }
    const health: Health = kind === 'few' ? 'few' : kind === 'broad' || kind === 'ignored' ? 'bad' : kind === 'fair' ? 'mid' : 'good'
    // What agents said, said the same way once: a case or a trailing full stop does not make a second reason.
    const counts = new Map<string, number>()
    for (const r of i.reasons ?? []) {
      const key = r.trim().replace(/[.\s]+$/, '').toLowerCase()
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const reasons = [...counts].map(([text, n]) => ({ text, n })).sort((a, b) => b.n - a.n || a.text.localeCompare(b.text))
    rows.push({ id: i.id, reminded: t.triggered, related, read, health, kind, text, declined, silent, reasons, advice })
  }
  rows.sort((a, b) => ORDER[a.health] - ORDER[b.health] || (a.related ? a.read / a.related : 0) - (b.related ? b.read / b.related : 0) || a.id.localeCompare(b.id))
  const sum = (f: (r: ReachRow) => number) => rows.reduce((n, r) => n + f(r), 0)
  const related = sum((r) => r.related)
  const read = sum((r) => r.read)
  return { rows, reminded: sum((r) => r.reminded), related, read, declined: sum((r) => r.declined), share: related ? Math.round((100 * read) / related) : 0 }
}
