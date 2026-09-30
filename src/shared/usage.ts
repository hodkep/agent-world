/** One rate-limit window as Claude's statusline reports it. `resetsAt` is in ms since the epoch. */
export interface Limit {
  pct: number
  resetsAt: number
}
/** The 5-hour and weekly windows of a Claude subscription; the same for every agent signed in to it. */
export interface UsageLimits {
  fiveHour: Limit | null
  sevenDay: Limit | null
}

export const noLimits = (): UsageLimits => ({ fiveHour: null, sevenDay: null })

/** A window the newest update leaves out keeps its last reading. */
export const mergeLimits = (prev: UsageLimits, next: UsageLimits): UsageLimits => ({
  fiveHour: next.fiveHour ?? prev.fiveHour,
  sevenDay: next.sevenDay ?? prev.sevenDay
})

export function untilReset(resetsAt: number, now: number): string {
  const min = Math.floor((resetsAt - now) / 60_000)
  if (resetsAt <= now) return 'now'
  if (min < 1) return '<1m'
  if (min < 60) return `${min}m`
  if (min < 48 * 60) return `${Math.floor(min / 60)}h ${min % 60}m`
  return `${Math.floor(min / 1440)}d ${Math.floor((min % 1440) / 60)}h`
}

export interface LimitView {
  pct: number | null
  level: 'ok' | 'warn' | 'hot'
  reset: string
}

export function limitView(l: Limit | null, now: number): LimitView {
  if (!l) return { pct: null, level: 'ok', reset: '' }
  // Once the window has rolled over, the old percentage no longer describes anything.
  if (l.resetsAt <= now) return { pct: 0, level: 'ok', reset: 'reset' }
  return { pct: l.pct, level: l.pct >= 90 ? 'hot' : l.pct >= 70 ? 'warn' : 'ok', reset: untilReset(l.resetsAt, now) }
}
