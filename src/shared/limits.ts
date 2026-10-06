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
  /** Each login's own pair of allowances, when the program has more than one; the tanks show the tightest, the moons above them one login each. */
  logins: { id: string; five: Limit | null; week: Limit | null; /** The login's colour, as #rrggbb, filled in by the screen that knows the accounts. */ color?: string }[]
}

/** A bank for each of the given programs, from the windows every program reports (a program with none yet has empty tanks). */
export const banks = (ws: LimitWindow[], providers: LimitWindow['provider'][]): Bank[] =>
  providers.map((provider) => {
    const mine = ws.filter((w) => w.provider === provider)
    const p = pooled(mine)
    const ids = [...new Set(mine.map((w) => w.account ?? ''))]
    const logins = ids.length > 1 ? ids.map((id) => ({ id, ...(({ fiveHour, sevenDay }) => ({ five: fiveHour, week: sevenDay }))(pooled(mine.filter((w) => (w.account ?? '') === id))) })) : []
    return { provider, five: p.fiveHour, week: p.sevenDay, logins }
  })

/** One line of the limits board: a login (or a model group of it) with its 5-hour and weekly windows. */
export interface BoardRow {
  key: string
  label: string
  /** The login's id ('' is the program's own), for its colour; undefined where the program has no logins. */
  account: string | undefined
  /** A model group of a login whose first row is above it ("Fable"), drawn under it. */
  sub: boolean
  five: LimitWindow | null
  week: LimitWindow | null
}
export interface BoardProvider {
  provider: LimitWindow['provider']
  label: string
  rows: BoardRow[]
}

/**
 * The windows as a board: one block per program, a row per login, and under a login a row for each model group the program limits
 * on its own ("Claude Code (Fable)"). A program with one login names its rows by group instead, as the program does.
 */
export function limitBoard(ws: LimitWindow[], names: { provider: (id: LimitWindow['provider']) => string; account: (id: string) => string; /** The program has extra logins, so its rows are named by login even while only one has reported. */ keeps?: (id: LimitWindow['provider']) => boolean }): BoardProvider[] {
  const ids = [...new Set(ws.map((w) => w.provider))]
  return ids.map((provider) => {
    const mine = ws.filter((w) => w.provider === provider)
    const label = names.provider(provider)
    const logins = [...new Set(mine.map((w) => w.account ?? ''))].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : 0))
    const several = logins.length > 1 || !!names.keeps?.(provider)
    const rows = logins.flatMap((login) => {
      const own = mine.filter((w) => (w.account ?? '') === login)
      const groups = [...new Set(own.map((w) => w.group))]
      return groups.map((group, i): BoardRow => {
        const in_ = own.filter((w) => w.group === group)
        const short = group.startsWith(label) ? group.slice(label.length).replace(/^\s*\((.*)\)\s*$/, '$1').trim() || label : group
        return {
          key: `${login}|${group}`,
          label: several ? (i === 0 ? names.account(login) : short) : groups.length > 1 ? short : label,
          account: several || mine.some((w) => w.account !== undefined) ? login : undefined,
          sub: several && i > 0,
          five: in_.find((w) => w.kind === 'five_hour') ?? null,
          week: in_.find((w) => w.kind === 'weekly') ?? null
        }
      })
    })
    return { provider, label, rows }
  })
}

const WEEK_MS = 7 * 86_400_000
/** How far through its week an allowance is (0 to 1), from when it resets. */
export const weekElapsed = (w: LimitWindow, now: number) => Math.min(1, Math.max(0, 1 - (Date.parse(w.resetsAt) - now) / WEEK_MS))
/** How long until a weekly allowance runs out at the pace so far, when that is before it resets; otherwise null. */
export function runsOutIn(w: LimitWindow, now: number): number | null {
  if (w.kind !== 'weekly') return null
  const used = 100 - w.remainingPct
  const gone = weekElapsed(w, now) * WEEK_MS
  // Too little to tell: a window that has barely begun or barely been used says nothing about its pace.
  if (used < 5 || gone < 3_600_000) return null
  const left = (w.remainingPct / used) * gone
  return left < Date.parse(w.resetsAt) - now ? left : null
}
