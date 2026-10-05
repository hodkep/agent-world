import type { Limit, UsageLimits } from './usage'
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

/** The window of one kind with the least left, across every provider: what the tanks and chips draw, and which allowance it is. */
export const tightest = (ws: LimitWindow[], kind: LimitWindow['kind']) => busiest(ws.filter((w) => w.kind === kind))

/** The tightest five-hour and weekly allowance across providers, in the form the tanks and chips draw (share used, reset in ms). */
export function pooled(ws: LimitWindow[]): UsageLimits {
  const one = (kind: LimitWindow['kind']): Limit | null => {
    const w = tightest(ws, kind)
    return w ? { pct: 100 - w.remainingPct, resetsAt: Date.parse(w.resetsAt) } : null
  }
  return { fiveHour: one('five_hour'), sevenDay: one('weekly') }
}

/** One program's pair of allowances, for the plant on the lawn: a bank of two tanks for each program that is connected. */
export interface Bank {
  provider: LimitWindow['provider']
  five: Limit | null
  week: Limit | null
}

/** A bank for each of the given programs, from the windows every program reports (a program with none yet has empty tanks). */
export const banks = (ws: LimitWindow[], providers: LimitWindow['provider'][]): Bank[] =>
  providers.map((provider) => {
    const p = pooled(ws.filter((w) => w.provider === provider))
    return { provider, five: p.fiveHour, week: p.sevenDay }
  })
