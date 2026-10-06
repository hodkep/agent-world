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

/** Across accounts, each window shows the one with the most used: that is the allowance that runs out first. */
export const tightestLimits = (list: UsageLimits[]): UsageLimits => {
  const worst = (pick: (u: UsageLimits) => Limit | null) => list.map(pick).reduce<Limit | null>((a, b) => (b && (!a || b.pct > a.pct) ? b : a), null)
  return { fiveHour: worst((u) => u.fiveHour), sevenDay: worst((u) => u.sevenDay) }
}

/**
 * The allowances of every account, kept apart: each account's windows come from its own agents, and what the header and the
 * tanks show is the tightest of them. It also reads and writes the file they are kept in.
 */
export class LimitsBook {
  private by = new Map<string, UsageLimits>()

  /** A newer reading of one account; a window it leaves out keeps its last. */
  record(account: string, next: UsageLimits) {
    this.by.set(account, mergeLimits(this.by.get(account) ?? noLimits(), next))
  }
  /** What one account last reported. */
  of(account: string): UsageLimits {
    return this.by.get(account) ?? noLimits()
  }
  /** Every account that has reported, in the order it first did. */
  accounts(): string[] {
    return [...this.by.keys()]
  }
  /** The allowance that runs out first, across accounts. */
  tightest(): UsageLimits {
    return tightestLimits([...this.by.values()])
  }
  toJSON() {
    return { by: Object.fromEntries(this.by) }
  }
  /** The file holds `{ by: { account: limits } }`; one written before accounts held a single reading, which was this computer's own login. */
  static from(raw: unknown): LimitsBook {
    const book = new LimitsBook()
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    const read = (v: unknown): UsageLimits => mergeLimits(noLimits(), (v && typeof v === 'object' ? v : {}) as UsageLimits)
    if (r.by && typeof r.by === 'object') for (const [id, v] of Object.entries(r.by)) book.by.set(id, read(v))
    else if ('fiveHour' in r || 'sevenDay' in r) book.by.set('', read(r))
    return book
  }
}

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

/** A token count in a few characters: 409, 3.5k, 21k, 1.9M. */
export function tokenLabel(n: number): string {
  if (n < 1000) return String(Math.round(n))
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  if (n < 999_500) return `${Math.round(n / 1000)}k`
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
}
