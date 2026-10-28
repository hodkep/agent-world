import type { LedgerEvent } from './ledger'

/** The step by which the context must grow past the last nudge before the next one: an agent is told once, then again if it ignores it and keeps going. */
const STEP = 50_000

/**
 * What an agent is told, with its next message, when its context has got big: every request re-reads all of it, so a long conversation pays
 * for the same tokens over and over. `last` is the context at the last nudge (undefined when none since the context was small); `at` is the
 * size to start at, 0 for never. The agent cannot compact itself, so it tells the person, or saves a note and the person starts afresh.
 */
export function nudgeFor(ctx: number, last: number | undefined, at: number): { at: number; text: string } | null {
  if (!at || ctx < at || (last !== undefined && ctx < last + STEP)) return null
  return {
    at: ctx,
    text: `Your context is about ${Math.round(ctx / 1000)}k tokens and every request re-reads it. At a good stopping point, tell the user it is worth compacting (they can type /compact), or save a short note of where you are with remember so a fresh session can carry on.`
  }
}

/** What an agent's last request had in front of it: 0 when it has made none, or when it was compacted since (the next request will be small). */
export function latestContext(events: LedgerEvent[], agent: string): number {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!
    if (e.k === 'mark' && e.what === 'compact' && e.agent === agent) return 0
    if (e.k === 'req' && e.agent === agent) return e.input + (e.cacheRead ?? 0) + (e.cacheWrite ?? 0)
  }
  return 0
}
