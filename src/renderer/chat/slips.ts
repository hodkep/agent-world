import type { Use } from '../../shared/library'

/** One library item as the chat shows it beside a message: pointed at, then read (or not), or reached for unprompted. */
export interface Slip {
  id: string
  state: 'read' | 'pointed' | 'skipped' | 'self'
  /** The exact line the agent was given, when it was pointed at the item. */
  words?: string
  /** What the agent met that pointed it at the item, when it was not a message ("merge conflict, 2 files"). */
  because?: string
  /** For skipped: why the agent passed it over, in its words. */
  reason?: string
  /** When it was pointed at, for one met mid-run (so it can be placed at the tool call that showed it). */
  at?: number
  /** How long after being pointed at it was read. */
  gapMs?: number
}

const USED = new Set(['fetched', 'skill', 'read'])

/** What happened between two of your messages (`from` inclusive, `to` exclusive), one slip per item. */
export function slipsFor(uses: Use[], from: number, to: number): Slip[] {
  const out = new Map<string, Slip & { at: number }>()
  for (const x of uses.filter((x) => x.t >= from && x.t < to).sort((a, b) => a.t - b.t)) {
    const have = out.get(x.id)
    if (x.how === 'triggered') {
      if (!have) out.set(x.id, { id: x.id, state: 'pointed', words: x.words, because: x.because, at: x.t })
    } else if (x.how === 'skipped') {
      if (have && have.state === 'pointed') (have.state = 'skipped'), (have.reason = x.reason)
    } else if (USED.has(x.how)) {
      if (!have) out.set(x.id, { id: x.id, state: 'self', at: x.t })
      else if (have.state === 'pointed') (have.state = 'read'), (have.gapMs = x.t - have.at)
    }
  }
  return [...out.values()].map(({ at, ...s }) => (s.because ? { ...s, at } : s))
}

/** The opening texts agents were started with, each above the first message sent after it (by that message's place). */
export function startsBefore(uses: Use[], userAts: number[]): Map<number, Use[]> {
  const out = new Map<number, Use[]>()
  for (const x of uses.filter((x) => x.how === 'started')) {
    const k = userAts.findIndex((at) => at >= x.t)
    if (k >= 0) out.set(k, [...(out.get(k) ?? []), x])
  }
  return out
}

/** Slips met mid-run go beside the last tool row that began at or before them (the one whose output showed the situation); the others, and any that match no row, stay with the message. */
export function placeInline(tools: { id: string; at?: number }[], slips: Slip[]): { inline: Map<string, Slip[]>; rest: Slip[] } {
  const inline = new Map<string, Slip[]>()
  const rest: Slip[] = []
  for (const s of slips) {
    const row = s.because && s.at !== undefined ? [...tools].reverse().find((t) => t.at !== undefined && t.at <= s.at!) : undefined
    if (row) inline.set(row.id, [...(inline.get(row.id) ?? []), s])
    else rest.push(s)
  }
  return { inline, rest }
}
