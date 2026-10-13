import type { Summary } from '../../shared/library'

export type Health = 'bad' | 'mid' | 'good' | 'few'
export interface ReachRow {
  id: string
  pointed: number
  read: number
  health: Health
  text: string
  /** Pointed at, and the agent said it did not apply. */
  declined: number
  /** Pointed at, not read, and no word from the agent. */
  silent: number
  /** What agents said when they passed it over, the most common first. */
  reasons: { text: string; n: number }[]
  /** What to try when most said no (empty otherwise). */
  advice: string
}

const ORDER: Record<Health, number> = { bad: 0, mid: 1, good: 2, few: 3 }
// Below this many pointings there is not enough to say anything about an item.
const ENOUGH = 3

/** Per item: how often agents were pointed at it, how often they then read it, and a plain verdict; the ones that need attention first. */
export function reachedFor(s: Summary, program: string, whenOf: (id: string) => string): { rows: ReachRow[]; pointed: number; read: number; share: number } {
  const rows: ReachRow[] = []
  for (const i of Object.values(s.items)) {
    const t = program === 'both' ? i : (i.byProvider[program] ?? { triggered: 0, answered: 0, declined: 0 })
    if (!t.triggered) continue
    const share = t.answered / t.triggered
    const health: Health = t.triggered < ENOUGH ? 'few' : share < 0.4 ? 'bad' : share < 0.7 ? 'mid' : 'good'
    const declined = t.declined ?? 0
    const silent = Math.max(0, t.triggered - t.answered - declined)
    const said = declined ? ` ${declined} said no${silent ? `. ${silent} passed over without a word` : ''}.` : silent ? ` ${silent} passed over without a word.` : ''
    const text =
      health === 'few' ? `Pointed at ${t.triggered} time${t.triggered > 1 ? 's' : ''}. Too few to judge yet.`
      : health === 'bad' ? `Pointed at ${t.triggered} times, read ${t.answered}. ${whenOf(i.id) ? 'The "when" may be too broad.' : 'It has no "when", so only its description is matched.'}`
      : `${Math.round(share * 100)}% read. ${health === 'mid' ? 'Fine for a gentle rule.' : 'Working.'}`
    // What agents said, said the same way once: a case or a trailing full stop does not make a second reason.
    const counts = new Map<string, number>()
    for (const r of i.reasons ?? []) {
      const key = r.trim().replace(/[.\s]+$/, '').toLowerCase()
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const reasons = [...counts].map(([text, n]) => ({ text, n })).sort((a, b) => b.n - a.n || a.text.localeCompare(b.text))
    const advice = declined >= 3 && declined >= t.answered ? 'Most said no, so the "when" fits more work than the item does. Make it narrower.' : ''
    rows.push({ id: i.id, pointed: t.triggered, read: t.answered, health, text: text + said, declined, silent, reasons, advice })
  }
  rows.sort((a, b) => ORDER[a.health] - ORDER[b.health] || a.read / a.pointed - b.read / b.pointed || a.id.localeCompare(b.id))
  const pointed = rows.reduce((n, r) => n + r.pointed, 0)
  const read = rows.reduce((n, r) => n + r.read, 0)
  return { rows, pointed, read, share: pointed ? Math.round((100 * read) / pointed) : 0 }
}
