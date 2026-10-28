import { addParts, noParts, partsOf, tokenTotal, type TokenParts } from './tokens'

/**
 * What the app records as agents work, so the Usage and Weekly Rewind screens have a history to show.
 * Claude only reports a running cost per conversation, so the app saves each increase as it arrives, with
 * the model that was in use, and each finished stretch of work with when it began and how long it ran.
 */
export type LedgerEvent =
  | LedgerMark
  | { k: 'cost'; t: number; agent: string; project: string; model: string; usd: number; provider?: string; name?: string; account?: string; /** Worked out from tokens at public rates, because the program reports no price. */ est?: boolean }
  | { k: 'work'; t: number; agent: string; project: string; ms: number; provider?: string; account?: string; name?: string }
  /** How full one allowance was when looked at, so the Weekly Rewind can say how hard each account was pushed. */
  | { k: 'limit'; t: number; provider: string; account?: string; group: string; kind: 'five_hour' | 'weekly'; usedPct: number }
  /** For a program that reports tokens, not a price: how many it used since the last record. */
  | { k: 'tokens'; t: number; agent: string; project: string; model: string; input: number; output: number; provider?: string; name?: string; account?: string }
  /** One request to the model, counted exactly by the program itself (see shared/tokens.ts): what it read fresh, from its cache and wrote to it, and wrote back. */
  | { k: 'req'; t: number; agent: string; project: string; model: string; provider: string; input: number; cacheRead?: number; cacheWrite?: number; output: number; name?: string; account?: string }

/** The app's own doing, noted so its effect can be seen later: an agent told its context is big (with that size), or compacted. */
export type LedgerMark = { k: 'mark'; t: number; agent: string; project: string; what: 'nudge' | 'compact'; ctx?: number; name?: string }

/** How much a running total grew; a lower total means a new conversation started from zero. */
export const costDelta = (prev: number, now: number) => (now >= prev ? now - prev : now)

/** One account of one program: the key every per-account total is filed under ('' is the program's own login on this computer). */
export const acctKey = (provider: string, account?: string) => `${provider}\n${account ?? ''}`

/** A snapshot of a limit is saved when it moved a little or half an hour has passed, so looking often does not fill the file. */
export const limitDue = (last: { t: number; pct: number } | undefined, now: number, pct: number) => !last || now - last.t >= 30 * 60_000 || Math.abs(pct - last.pct) >= 2

export function parseLedger(text: string): LedgerEvent[] {
  const out: LedgerEvent[] = []
  for (const line of text.split('\n')) {
    try {
      const e = JSON.parse(line) as LedgerEvent
      if ((e.k === 'cost' || e.k === 'work' || e.k === 'tokens' || e.k === 'req' || e.k === 'limit' || e.k === 'mark') && Number.isFinite(e.t)) out.push(e)
    } catch {
      /* a half-written last line is expected after a crash */
    }
  }
  return out
}

export const DAY = 86_400_000
export const dayStart = (t: number) => {
  const d = new Date(t)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}
/** Monday 00:00, local time. */
export function weekStartOf(t: number) {
  const d = new Date(dayStart(t))
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)).getTime()
}
export const dateKey = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const sorted = (m: Map<string, number>) => [...m].map(([model, usd]) => ({ model, usd })).sort((a, b) => b.usd - a.usd)

/** A stretch of work cut at each hour boundary: [timestamp of the hour's start, ms inside it]. */
function* hours(t: number, ms: number): Generator<[number, number]> {
  let at = t
  const end = t + ms
  while (at < end) {
    const d = new Date(at)
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime()
    yield [new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()).getTime(), Math.min(next, end) - at]
    at = next
  }
}

/** Who an agent's entries belong to: spend entries say, and work entries without a name of their own are filed with the same agent's spend. */
export function whoMap(events: LedgerEvent[], names: Record<string, string>) {
  const who = new Map<string, { t: number; provider: string; account: string; name: string }>()
  for (const e of events) {
    if (e.k === 'limit' || e.k === 'mark') continue
    const last = who.get(e.agent)
    // The latest spend wins, so an agent moved to another account has its work filed with the account it is on now.
    if ((e.k === 'cost' || e.k === 'tokens' || e.k === 'req') && (!last || e.t >= last.t)) who.set(e.agent, { t: e.t, provider: e.provider ?? LEGACY_PROGRAM[e.k], account: e.account ?? '', name: e.name ?? last?.name ?? names[e.agent] ?? 'removed agent' })
  }
  return (e: { agent: string; provider?: string; account?: string; name?: string }) => {
    const w = who.get(e.agent)
    return { provider: e.provider ?? w?.provider ?? 'claude', account: e.account ?? w?.account ?? '', name: e.name ?? w?.name ?? names[e.agent] ?? 'removed agent' }
  }
}

export interface WeekAccount {
  key: string
  provider: string
  account: string
  usd: number
  tokens: number
  ms: number
  turns: number
  agents: number
  /** Cost by day, Monday first. */
  perDay: number[]
  /** The fullest the weekly allowance was on each day (percent used), or null where it was not looked at; null all week when the program has none. */
  weeklyDays: (number | null)[]
  weeklyPeak: number | null
  /** How many times the five-hour allowance ran out (crossed 95% used). */
  hits5h: number
  /** The same account's cost the week before. */
  beforeUsd: number
  /** The week's tokens by kind, and the week before's, to compare with. */
  mix: TokenParts
  beforeMix: TokenParts
}

export interface WeekReport {
  start: number
  agentMs: number
  /** Agents that worked during the week. */
  agents: number
  /** Work stretches (turns that kept an agent busy). */
  turns: number
  costUsd: number
  tokens: number
  /** The three hours (24h clock, `to` exclusive) that held the most work. */
  peak: { from: number; to: number; ms: number } | null
  topProject: { name: string; agents: number } | null
  /** Day 0 is Monday. */
  busiest: { day: number; agents: number } | null
  /** By day: agents that worked, cost, time worked, and the cost split by account. */
  perDay: { agents: number; usd: number; ms: number; by: Record<string, number>; /** Tokens, split by account in the same way. */ tokBy: Record<string, number> }[]
  byModel: { model: string; usd: number }[]
  /** Work in ms by day (Monday first) and hour. */
  heat: number[][]
  /** What the week before came to, for the change shown beside each total. */
  before: { usd: number; ms: number; turns: number; tokens: number }
  accounts: WeekAccount[]
  /** The single longest stretch of work. */
  longest: { ms: number; name: string; project: string; key: string; t: number } | null
  /** The single most expensive step. */
  priciest: { usd: number; name: string; project: string; key: string; t: number } | null
  topAgent: { name: string; key: string; ms: number } | null
  projects: { name: string; ms: number; usd: number; agents: number }[]
  agentList: { agent: string; name: string; key: string; turns: number; ms: number; usd: number }[]
}

export function weekReport(events: LedgerEvent[], start: number, names: Record<string, string> = {}): WeekReport {
  const end = start + 7 * DAY + 3_600_000 // a week is 7 calendar days; the slack covers a clock change
  const dayOf = (t: number) => Math.floor((dayStart(t) - start + 12 * 3_600_000) / DAY)
  const whoOf = whoMap(events, names)
  const agentDays: Set<string>[] = Array.from({ length: 7 }, () => new Set())
  const usd = Array<number>(7).fill(0)
  const ms7 = Array<number>(7).fill(0)
  const by7: Record<string, number>[] = Array.from({ length: 7 }, () => ({}))
  const tok7: Record<string, number>[] = Array.from({ length: 7 }, () => ({}))
  const heat = Array.from({ length: 7 }, () => Array<number>(24).fill(0))
  const projects = new Map<string, { agents: Set<string>; ms: number; usd: number }>()
  const project = (n: string) => projects.get(n) ?? projects.set(n, { agents: new Set(), ms: 0, usd: 0 }).get(n)!
  const models = new Map<string, number>()
  const all = new Set<string>()
  const accts = new Map<string, WeekAccount & { set: Set<string> }>()
  const acct = (provider: string, account: string) => {
    const key = acctKey(provider, account)
    let a = accts.get(key)
    if (!a) accts.set(key, (a = { key, provider, account, usd: 0, tokens: 0, ms: 0, turns: 0, agents: 0, perDay: Array<number>(7).fill(0), weeklyDays: Array<number | null>(7).fill(null), weeklyPeak: null, hits5h: 0, beforeUsd: 0, mix: noParts(), beforeMix: noParts(), set: new Set() }))
    return a
  }
  const agentRows = new Map<string, WeekReport['agentList'][number]>()
  const agentRow = (id: string, name: string, key: string) => agentRows.get(id) ?? agentRows.set(id, { agent: id, name, key, turns: 0, ms: 0, usd: 0 }).get(id)!
  const before = { usd: 0, ms: 0, turns: 0, tokens: 0 }
  let agentMs = 0
  let turns = 0
  let costUsd = 0
  let tokens = 0
  let longest: WeekReport['longest'] = null
  let priciest: WeekReport['priciest'] = null
  const limitWindows = new Map<string, boolean>()
  const limits: Extract<LedgerEvent, { k: 'limit' }>[] = []
  for (const e of events) {
    if (e.t >= start - 7 * DAY && e.t < start) {
      if (e.k === 'cost') {
        before.usd += e.usd
        acct(whoOf(e).provider, whoOf(e).account).beforeUsd += e.usd
      } else if (e.k === 'work') {
        before.ms += e.ms
        before.turns++
      } else if (e.k === 'tokens' || e.k === 'req') {
        before.tokens += tokenTotal(e)
        addParts(acct(whoOf(e).provider, whoOf(e).account).beforeMix, partsOf(e))
      }
    }
    if (e.t < start || e.t >= end) continue
    const day = dayOf(e.t)
    if (day < 0 || day > 6) continue
    if (e.k === 'mark') continue
    if (e.k === 'limit') {
      limits.push(e)
      continue
    }
    const w = whoOf(e)
    const a = acct(w.provider, w.account)
    if (e.k === 'tokens' || e.k === 'req') {
      tokens += tokenTotal(e)
      a.tokens += tokenTotal(e)
      addParts(a.mix, partsOf(e))
      tok7[day]![a.key] = (tok7[day]![a.key] ?? 0) + tokenTotal(e)
      continue
    }
    const row = agentRow(e.agent, w.name, a.key)
    if (e.k === 'cost') {
      usd[day]! += e.usd
      costUsd += e.usd
      a.usd += e.usd
      a.perDay[day]! += e.usd
      by7[day]![a.key] = (by7[day]![a.key] ?? 0) + e.usd
      row.usd += e.usd
      project(e.project).usd += e.usd
      models.set(e.model, (models.get(e.model) ?? 0) + e.usd)
      a.set.add(e.agent)
      if (e.usd > (priciest?.usd ?? 0)) priciest = { usd: e.usd, name: w.name, project: e.project, key: a.key, t: e.t }
      continue
    }
    agentMs += e.ms
    turns++
    ms7[day]! += e.ms
    a.ms += e.ms
    a.turns++
    a.set.add(e.agent)
    row.ms += e.ms
    row.turns++
    all.add(e.agent)
    agentDays[day]!.add(e.agent)
    const pr = project(e.project)
    pr.agents.add(e.agent)
    pr.ms += e.ms
    if (e.ms > (longest?.ms ?? 0)) longest = { ms: e.ms, name: w.name, project: e.project, key: a.key, t: e.t }
    for (const [h, ms] of hours(e.t, e.ms)) {
      const d = dayOf(h)
      if (d >= 0 && d <= 6) heat[d]![new Date(h).getHours()]! += ms
    }
  }
  // Snapshots are read in order: the weekly allowance's fullest point each day, and each time the five-hour one ran out.
  for (const l of limits.sort((x, y) => x.t - y.t)) {
    const a = acct(l.provider, l.account ?? '')
    if (l.kind === 'weekly') {
      const d = dayOf(l.t)
      a.weeklyDays[d] = Math.max(a.weeklyDays[d] ?? 0, l.usedPct)
      a.weeklyPeak = Math.max(a.weeklyPeak ?? 0, l.usedPct)
    } else {
      const k = `${a.key}\n${l.group}`
      const full = l.usedPct >= 95
      if (full && !limitWindows.get(k)) a.hits5h++
      limitWindows.set(k, full)
    }
  }
  const byHour = Array.from({ length: 24 }, (_, h) => heat.reduce((n, row) => n + row[h]!, 0))
  let peak: WeekReport['peak'] = null
  for (let h = 0; h < 22; h++) {
    const ms = byHour[h]! + byHour[h + 1]! + byHour[h + 2]!
    // A window opens on an hour that has work, so "2–5 PM" never starts in the quiet.
    if (byHour[h]! > 0 && ms > (peak?.ms ?? 0)) peak = { from: h, to: h + 3, ms }
  }
  const top = [...projects].sort((a, b) => b[1].agents.size - a[1].agents.size)[0]
  const perDay = agentDays.map((s, i) => ({ agents: s.size, usd: usd[i]!, ms: ms7[i]!, by: by7[i]!, tokBy: tok7[i]! }))
  const best = perDay.reduce((b, d, i) => (d.agents > (b?.agents ?? 0) ? { day: i, agents: d.agents } : b), null as WeekReport['busiest'])
  const accounts = [...accts.values()]
    .filter((a) => a.usd > 0 || a.tokens > 0 || a.turns > 0 || a.weeklyPeak !== null || a.hits5h > 0)
    .map(({ set, ...a }) => ({ ...a, agents: set.size }))
    .sort((x, y) => y.usd - x.usd || y.ms - x.ms)
  const agentList = [...agentRows.values()].sort((x, y) => y.usd - x.usd || y.ms - x.ms)
  const topA = [...agentRows.values()].sort((x, y) => y.ms - x.ms)[0]
  return {
    start,
    agentMs,
    agents: all.size,
    turns,
    costUsd,
    tokens,
    peak,
    topProject: top ? { name: top[0], agents: top[1].agents.size } : null,
    busiest: best,
    perDay,
    byModel: sorted(models),
    heat,
    before,
    accounts,
    longest,
    priciest,
    topAgent: topA && topA.ms > 0 ? { name: topA.name, key: topA.key, ms: topA.ms } : null,
    projects: [...projects].map(([name, v]) => ({ name, ms: v.ms, usd: v.usd, agents: v.agents.size })).sort((x, y) => y.usd - x.usd || y.ms - x.ms),
    agentList
  }
}

export interface TokensReport {
  days: { date: string; input: number; output: number }[]
  total: { input: number; output: number }
}

/** Tokens used per day over the last `days` days (today last), for programs that count tokens rather than dollars. */
export function tokensReport(events: LedgerEvent[], days: number, now: number): TokensReport {
  const today = new Date(dayStart(now))
  const list = Array.from({ length: days }, (_, i) => ({ date: dateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1 - i)).getTime()), input: 0, output: 0 }))
  const index = new Map(list.map((d, i) => [d.date, i]))
  for (const e of events) {
    if (e.k !== 'tokens') continue
    const d = list[index.get(dateKey(e.t)) ?? -1]
    if (d) {
      d.input += e.input
      d.output += e.output
    }
  }
  return { days: list, total: { input: list.reduce((n, d) => n + d.input, 0), output: list.reduce((n, d) => n + d.output, 0) } }
}

export interface UsageReport {
  today: number
  last7: number
  /** Everything in the window. */
  total: number
  /** One entry per day of the window, oldest first. */
  days: { date: string; usd: number; byModel: Record<string, number> }[]
  byModel: { model: string; usd: number }[]
}

export function usageReport(events: LedgerEvent[], days: number, now: number): UsageReport {
  const today = dayStart(now)
  const first = new Date(new Date(today).getFullYear(), new Date(today).getMonth(), new Date(today).getDate() - (days - 1)).getTime()
  const list = Array.from({ length: days }, (_, i) => {
    const d = new Date(new Date(first).getFullYear(), new Date(first).getMonth(), new Date(first).getDate() + i)
    return { date: dateKey(d.getTime()), usd: 0, byModel: {} as Record<string, number> }
  })
  const index = new Map(list.map((d, i) => [d.date, i]))
  const models = new Map<string, number>()
  for (const e of events) {
    if (e.k !== 'cost') continue
    const i = index.get(dateKey(e.t))
    if (i === undefined) continue
    const d = list[i]!
    d.usd += e.usd
    d.byModel[e.model] = (d.byModel[e.model] ?? 0) + e.usd
    models.set(e.model, (models.get(e.model) ?? 0) + e.usd)
  }
  const sum = (n: number) => list.slice(-n).reduce((s, d) => s + d.usd, 0)
  return { today: sum(1), last7: sum(7), total: sum(days), days: list, byModel: sorted(models) }
}

/** Before entries named their program, only Claude reported a price and only agy reported tokens. */
const LEGACY_PROGRAM = { cost: 'claude', tokens: 'agy', req: 'claude' } as const

export interface Spend {
  usd: number
  tokens: number
  /** The part of `usd` that is an estimate from tokens, not a price the program reported. */
  est?: number
}
export interface AgentUse extends Spend {
  agent: string
  name: string
  provider: string
  /** The account it is on now ('' is the program's own login on this computer). */
  account: string
  model: string
  turns: number
}
export interface Overview {
  /** One entry per day, oldest first, split by program. */
  days: { date: string; by: Record<string, Spend>; byAccount: Record<string, Spend> }[]
  total: Spend
  /** The same length of time just before this window, for the change shown beside the total. */
  before: Spend
  providers: ({ provider: string; today: Spend } & Spend)[]
  projects: ({ project: string; lastAt: number; by: Record<string, Spend>; byAccount: Record<string, Spend>; agents: AgentUse[] } & Spend)[]
  models: ({ model: string; provider: string } & Spend)[]
  /** Spend by login of each program ('' is the program's own login on this computer), the same totals split; a program with no accounts has the one row. */
  accounts: OverviewAccount[]
  /** This calendar month so far, and where it is heading at the pace of the days gone. */
  month: { spent: Spend; projected: Spend; day: number; of: number }
}

export interface OverviewAccount extends Spend {
  key: string
  provider: string
  account: string
  today: Spend
  turns: number
  agents: number
  /** Weight (dollars first, then tokens) of each day of the window, oldest first, for a small trend line. */
  series: number[]
  models: ({ model: string } & Spend)[]
  projects: ({ project: string } & Spend)[]
  agentUse: AgentUse[]
}

const none = (): Spend => ({ usd: 0, tokens: 0 })
const add = (to: Spend, e: Spend) => {
  to.usd += e.usd
  to.tokens += e.tokens
  if (e.est) to.est = (to.est ?? 0) + e.est
}

/**
 * Everything spent over `days` days, whichever program ran it: by day, program, project and model.
 * `names` gives the current name of an agent whose entries predate names being recorded.
 */
export function overview(events: LedgerEvent[], days: number, now: number, names: Record<string, string> = {}): Overview {
  const today = new Date(dayStart(now))
  const dayAt = (back: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - back).getTime()
  const first = dayAt(days - 1)
  const prior = dayAt(2 * days - 1)
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).getTime()
  const list = Array.from({ length: days }, (_, i) => ({ date: dateKey(dayAt(days - 1 - i)), by: {} as Record<string, Spend>, byAccount: {} as Record<string, Spend> }))
  const index = new Map(list.map((d, i) => [d.date, i]))
  const total = none()
  const before = none()
  const month = none()
  const whoOf = whoMap(events, names)
  const byProvider = new Map<string, { all: Spend; today: Spend }>()
  const byProject = new Map<string, { all: Spend; lastAt: number; by: Record<string, Spend>; byAccount: Record<string, Spend>; agents: Map<string, AgentUse> }>()
  const byModel = new Map<string, { provider: string; all: Spend }>()
  type Acct = { provider: string; account: string; all: Spend; today: Spend; series: number[]; turns: number; models: Map<string, Spend>; projects: Map<string, Spend>; agents: Map<string, AgentUse> }
  const byAccount = new Map<string, Acct>()
  const turns = new Map<string, number>()
  const open = (e: { project: string; agent: string }, provider: string, account: string, model: string, name?: string) => {
    const p = byProject.get(e.project) ?? { all: none(), lastAt: 0, by: {} as Record<string, Spend>, byAccount: {} as Record<string, Spend>, agents: new Map<string, AgentUse>() }
    byProject.set(e.project, p)
    const a = p.agents.get(e.agent) ?? { agent: e.agent, name: name ?? names[e.agent] ?? 'removed agent', provider, account, model, usd: 0, tokens: 0, turns: 0 }
    p.agents.set(e.agent, a)
    return { p, a }
  }
  const acct = (provider: string, account: string) => {
    const key = acctKey(provider, account)
    let a = byAccount.get(key)
    if (!a) byAccount.set(key, (a = { provider, account, all: none(), today: none(), series: Array<number>(days).fill(0), turns: 0, models: new Map(), projects: new Map(), agents: new Map() }))
    return a
  }
  for (const e of events) {
    if (e.k === 'limit' || e.k === 'mark') continue
    if (e.k === 'work') {
      if (e.t >= first) {
        turns.set(e.agent, (turns.get(e.agent) ?? 0) + 1)
        const w = whoOf(e)
        acct(w.provider, w.account).turns++
      }
      continue
    }
    const spend: Spend = e.k === 'cost' ? { usd: e.usd, tokens: 0, ...(e.est && { est: e.usd }) } : { usd: 0, tokens: tokenTotal(e) }
    if (e.t >= prior && e.t < first) add(before, spend)
    if (e.t >= monthStart && e.t <= now) add(month, spend)
    const i = index.get(dateKey(e.t))
    if (i === undefined) continue
    const provider = e.provider ?? LEGACY_PROGRAM[e.k]
    add(total, spend)
    add((list[i]!.by[provider] ??= none()), spend)
    const pr = byProvider.get(provider) ?? { all: none(), today: none() }
    byProvider.set(provider, pr)
    add(pr.all, spend)
    if (i === days - 1) add(pr.today, spend)
    const ac = acct(provider, e.account ?? '')
    add((list[i]!.byAccount[acctKey(provider, e.account)] ??= none()), spend)
    add(ac.all, spend)
    if (i === days - 1) add(ac.today, spend)
    ac.series[i]! += spend.usd * 1e6 + spend.tokens
    add(ac.models.get(e.model) ?? ac.models.set(e.model, none()).get(e.model)!, spend)
    add(ac.projects.get(e.project) ?? ac.projects.set(e.project, none()).get(e.project)!, spend)
    const { p, a } = open(e, provider, e.account ?? '', e.model, e.name)
    a.account = e.account ?? ''
    add((p.byAccount[acctKey(provider, e.account)] ??= none()), spend)
    const au = ac.agents.get(e.agent) ?? ac.agents.set(e.agent, { agent: e.agent, name: e.name ?? names[e.agent] ?? 'removed agent', provider, account: e.account ?? '', model: e.model, usd: 0, tokens: 0, turns: 0 }).get(e.agent)!
    add(au, spend)
    au.model = e.model
    if (e.name) au.name = e.name
    add(p.all, spend)
    add((p.by[provider] ??= none()), spend)
    p.lastAt = Math.max(p.lastAt, e.t)
    add(a, spend)
    a.model = e.model
    if (e.name) a.name = e.name
    const m = byModel.get(`${provider}\n${e.model}`) ?? { provider, all: none() }
    byModel.set(`${provider}\n${e.model}`, m)
    add(m.all, spend)
  }
  const weight = (s: Spend) => s.usd * 1e6 + s.tokens
  const dayNo = today.getDate()
  const of = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const rank = <T extends Spend>(m: Map<string, T>) => [...m.values()].sort((a, b) => weight(b) - weight(a))
  return {
    days: list,
    total,
    before,
    providers: [...byProvider].map(([provider, v]) => ({ provider, today: v.today, ...v.all })).sort((a, b) => weight(b) - weight(a)),
    projects: [...byProject]
      .map(([project, v]) => ({ project, lastAt: v.lastAt, by: v.by, byAccount: v.byAccount, ...v.all, agents: [...v.agents.values()].map((a) => ({ ...a, turns: turns.get(a.agent) ?? 0 })).sort((a, b) => weight(b) - weight(a)) }))
      .sort((a, b) => weight(b) - weight(a)),
    accounts: [...byAccount]
      .map(([key, v]) => ({
        key,
        provider: v.provider,
        account: v.account,
        today: v.today,
        ...v.all,
        turns: v.turns,
        agents: v.agents.size,
        series: v.series,
        models: [...v.models].map(([model, s]) => ({ model, ...s })).sort((a, b) => weight(b) - weight(a)),
        projects: [...v.projects].map(([project, s]) => ({ project, ...s })).sort((a, b) => weight(b) - weight(a)),
        agentUse: rank(v.agents).map((a) => ({ ...a, turns: turns.get(a.agent) ?? 0 }))
      }))
      .sort((a, b) => weight(b) - weight(a)),
    models: [...byModel].map(([k, v]) => ({ model: k.slice(k.indexOf('\n') + 1), provider: v.provider, ...v.all })).sort((a, b) => weight(b) - weight(a)),
    month: { spent: month, projected: { usd: (month.usd / dayNo) * of, tokens: (month.tokens / dayNo) * of }, day: dayNo, of }
  }
}
