import type { UsageLimits } from './usage'
import type { LimitWindow } from './types'

/** Claude Code reports the share used and the reset in ms; every provider's windows are shown as share left and an ISO time. */
export function claudeWindows(u: UsageLimits): LimitWindow[] {
  const one = (kind: LimitWindow['kind'], l: UsageLimits['fiveHour']): LimitWindow[] =>
    l ? [{ provider: 'claude', group: 'Claude Code', kind, remainingPct: Math.max(0, 100 - l.pct), resetsAt: new Date(l.resetsAt).toISOString() }] : []
  return [...one('five_hour', u.fiveHour), ...one('weekly', u.sevenDay)]
}

/** The window with the least left, across every provider. */
export const busiest = (ws: LimitWindow[]): LimitWindow | null => ws.reduce<LimitWindow | null>((a, b) => (!a || b.remainingPct < a.remainingPct ? b : a), null)

export const LOW_PCT = 15
/** How many windows are nearly used up. */
export const lowCount = (ws: LimitWindow[]) => ws.filter((w) => w.remainingPct < LOW_PCT).length
