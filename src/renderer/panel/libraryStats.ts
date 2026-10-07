import type { Summary } from '../../shared/library'

export type Health = 'bad' | 'mid' | 'good' | 'few'
export interface ReachRow {
  id: string
  pointed: number
  read: number
  health: Health
  text: string
}

const ORDER: Record<Health, number> = { bad: 0, mid: 1, good: 2, few: 3 }
// Below this many pointings there is not enough to say anything about an item.
const ENOUGH = 3

/** Per item: how often agents were pointed at it, how often they then read it, and a plain verdict; the ones that need attention first. */
export function reachedFor(s: Summary, program: string, whenOf: (id: string) => string): { rows: ReachRow[]; pointed: number; read: number; share: number } {
  const rows: ReachRow[] = []
  for (const i of Object.values(s.items)) {
    const t = program === 'both' ? i : (i.byProvider[program] ?? { triggered: 0, answered: 0 })
    if (!t.triggered) continue
    const share = t.answered / t.triggered
    const health: Health = t.triggered < ENOUGH ? 'few' : share < 0.4 ? 'bad' : share < 0.7 ? 'mid' : 'good'
    const text =
      health === 'few' ? `Pointed at ${t.triggered} time${t.triggered > 1 ? 's' : ''}. Too few to judge yet.`
      : health === 'bad' ? `Pointed at ${t.triggered} times, read ${t.answered}. ${whenOf(i.id) ? 'The "when" may be too broad.' : 'It has no "when", so only its description is matched.'}`
      : `${Math.round(share * 100)}% read. ${health === 'mid' ? 'Fine for a gentle rule.' : 'Working.'}`
    rows.push({ id: i.id, pointed: t.triggered, read: t.answered, health, text })
  }
  rows.sort((a, b) => ORDER[a.health] - ORDER[b.health] || a.read / a.pointed - b.read / b.pointed || a.id.localeCompare(b.id))
  const pointed = rows.reduce((n, r) => n + r.pointed, 0)
  const read = rows.reduce((n, r) => n + r.read, 0)
  return { rows, pointed, read, share: pointed ? Math.round((100 * read) / pointed) : 0 }
}
