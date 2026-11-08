import { acctKey, dateKey, type LedgerEvent } from './ledger'
import { normalizeModel } from './prices'

/**
 * How much of an account's allowance this app used. An account only says how full it is, and a login can be shared, so the rise
 * is everyone's. What the app knows is its own spend, per model. A dollar of one model moves the allowance by a rate nobody tells us
 * (a promo, a cache, the plan), so the rate is learned: whenever the account rose while the app worked, rise / spend can only be too
 * high (others add to the rise, never take from it), so the lowest ratio seen for a model is the best rate, and exact once the app
 * was the only user in a stretch.
 */
/** A rise under this many points is too coarse (the percentages are whole numbers) to read a rate from. */
const MIN_RISE = 3
/** A model must be this share of the spend in a stretch for the stretch to teach its rate. */
const DOMINANT = 0.8
/** Ratios this close to the lowest count as the same rate seen again. */
const NEAR = 1.15
/** Only a week of stretches teaches the rate, so a promo that began or ended is noticed. */
const LEARN_MS = 7 * 86_400_000

export interface ShareRow {
  provider: string
  account: string
  /** Points the account's allowance rose that day, whoever used it. */
  used: number
  /** The part of it this app used; with `learning`, at most that much. Worked out for the day as a whole: the allowance ticks up in whole points, so a reading often falls in a stretch with little of the spend that earned it. */
  mine: number
  /** A rate behind `mine` has been seen only once or not at all: `mine` is an upper bound. */
  learning: boolean
}
export interface ShareDay {
  date: string
  rows: ShareRow[]
}

interface Stretch {
  end: number
  rise: number
  by: Map<string, number>
  total: number
}

export function shareReport(events: LedgerEvent[], year: number, month: number, kind: 'five_hour' | 'weekly', now: number): { days: ShareDay[] } {
  const samples = new Map<string, { t: number; pct: number; provider: string; account: string }[]>()
  const spends = new Map<string, { t: number; model: string; usd: number }[]>()
  for (const e of events) {
    // Only Claude's allowance is a share of a plan that is spent in dollars the app also records; another program's windows (Antigravity's) are of another kind.
    if (e.k === 'limit' && e.provider === 'claude' && e.kind === kind && !e.group.includes('(')) {
      const key = acctKey(e.provider, e.account)
      const list = samples.get(key) ?? samples.set(key, []).get(key)!
      list.push({ t: e.t, pct: e.usedPct, provider: e.provider, account: e.account ?? '' })
    } else if (e.k === 'cost' && e.usd > 0) {
      const key = acctKey(e.provider ?? 'claude', e.account)
      const list = spends.get(key) ?? spends.set(key, []).get(key)!
      list.push({ t: e.t, model: normalizeModel(e.model), usd: e.usd })
    }
  }

  const count = new Date(year, month + 1, 0).getDate()
  const days: ShareDay[] = Array.from({ length: count }, (_, i) => ({ date: dateKey(new Date(year, month, i + 1).getTime()), rows: [] }))

  // What the app's spend explains of a day's rise, summed over the day's stretches; capped by the rise once the day is done.
  const explained = new Map<ShareRow, number>()
  for (const [key, list] of samples) {
    list.sort((a, b) => a.t - b.t)
    const mine = (spends.get(key) ?? []).sort((a, b) => a.t - b.t)
    // The spend is sorted too, so each stretch takes the next ones instead of searching all of it again.
    let next = 0
    const stretches: Stretch[] = []
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1]!
      const b = list[i]!
      const rise = b.pct - a.pct
      // A fall is the allowance resetting: what happened across it is not known.
      if (rise < 0) continue
      const by = new Map<string, number>()
      let total = 0
      while (next < mine.length && mine[next]!.t <= a.t) next++
      for (let j = next; j < mine.length && mine[j]!.t <= b.t; j++) (by.set(mine[j]!.model, (by.get(mine[j]!.model) ?? 0) + mine[j]!.usd), (total += mine[j]!.usd))
      stretches.push({ end: b.t, rise, by, total })
    }

    // The lowest rise-per-dollar of each model, over stretches that were mostly that model; and how many stretches agreed with it.
    const ratios = new Map<string, number[]>()
    for (const s of stretches) {
      if (s.end < now - LEARN_MS || s.rise < MIN_RISE) continue
      for (const [model, usd] of s.by) if (usd / s.total >= DOMINANT) (ratios.get(model) ?? ratios.set(model, []).get(model)!).push(s.rise / usd)
    }
    const rate = new Map<string, { r: number; sure: boolean }>()
    for (const [model, list] of ratios) {
      const r = Math.min(...list)
      rate.set(model, { r, sure: list.filter((x) => x <= r * NEAR).length >= 2 })
    }

    const first = samples.get(key)![0]!
    for (const s of stretches) {
      const d = new Date(s.end)
      if (d.getFullYear() !== year || d.getMonth() !== month) continue
      const day = days[d.getDate() - 1]!
      let row = day.rows.find((r) => r.provider === first.provider && r.account === first.account)
      if (!row) day.rows.push((row = { provider: first.provider, account: first.account, used: 0, mine: 0, learning: false }))
      let est = 0
      let known = true
      for (const [model, usd] of s.by) {
        const x = rate.get(model)
        if (!x) known = false
        else (est += usd * x.r, (row.learning ||= !x.sure))
      }
      // A model with no rate yet: all we can say is that the app used at most what the account rose.
      row.used += s.rise
      explained.set(row, (explained.get(row) ?? 0) + (known ? est : s.rise))
      row.learning ||= !known
    }
  }
  for (const [row, est] of explained) row.mine = Math.min(row.used, est)
  return { days }
}
