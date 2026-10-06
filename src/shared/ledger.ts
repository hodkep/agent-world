/**
 * What the app records as agents work, so the Usage and Weekly Rewind screens have a history to show.
 * Claude only reports a running cost per conversation, so the app saves each increase as it arrives, with
 * the model that was in use, and each finished stretch of work with when it began and how long it ran.
 */
export type LedgerEvent =
  | { k: 'cost'; t: number; agent: string; project: string; model: string; usd: number; provider?: string; name?: string; account?: string }
  | { k: 'work'; t: number; agent: string; project: string; ms: number }
  /** For a program that reports tokens, not a price: how many it used since the last record. */
  | { k: 'tokens'; t: number; agent: string; project: string; model: string; input: number; output: number; provider?: string; name?: string; account?: string }

/** How much a running total grew; a lower total means a new conversation started from zero. */
export const costDelta = (prev: number, now: number) => (now >= prev ? now - prev : now)

export function parseLedger(text: string): LedgerEvent[] {
  const out: LedgerEvent[] = []
  for (const line of text.split('\n')) {
    try {
      const e = JSON.parse(line) as LedgerEvent
      if ((e.k === 'cost' || e.k === 'work' || e.k === 'tokens') && Number.isFinite(e.t)) out.push(e)
    } catch {
      /* a half-written last line is expected after a crash */
    }
  }
  return out
}

const DAY = 86_400_000
const dayStart = (t: number) => {
  const d = new Date(t)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}
/** Monday 00:00, local time. */
export function weekStartOf(t: number) {
  const d = new Date(dayStart(t))
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)).getTime()
}
const dateKey = (t: number) => {
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

export interface WeekReport {
  start: number
  agentMs: number
  /** Agents that worked during the week. */
  agents: number
  /** Work stretches (turns that kept an agent busy). */
  turns: number
  costUsd: number
  /** The three hours (24h clock, `to` exclusive) that held the most work. */
  peak: { from: number; to: number; ms: number } | null
  topProject: { name: string; agents: number } | null
  /** Day 0 is Monday. */
  busiest: { day: number; agents: number } | null
  perDay: { agents: number; usd: number }[]
  byModel: { model: string; usd: number }[]
  /** Work in ms by day (Monday first) and hour. */
  heat: number[][]
}

export function weekReport(events: LedgerEvent[], start: number): WeekReport {
  const end = start + 7 * DAY + 3_600_000 // a week is 7 calendar days; the slack covers a clock change
  const dayOf = (t: number) => Math.floor((dayStart(t) - start + 12 * 3_600_000) / DAY)
  const agentDays: Set<string>[] = Array.from({ length: 7 }, () => new Set())
  const usd = Array<number>(7).fill(0)
  const heat = Array.from({ length: 7 }, () => Array<number>(24).fill(0))
  const projects = new Map<string, Set<string>>()
  const models = new Map<string, number>()
  const all = new Set<string>()
  let agentMs = 0
  let turns = 0
  let costUsd = 0
  for (const e of events) {
    if (e.t < start || e.t >= end) continue
    const day = dayOf(e.t)
    if (day < 0 || day > 6) continue
    if (e.k === 'tokens') continue
    if (e.k === 'cost') {
      usd[day]! += e.usd
      costUsd += e.usd
      models.set(e.model, (models.get(e.model) ?? 0) + e.usd)
      continue
    }
    agentMs += e.ms
    turns++
    all.add(e.agent)
    agentDays[day]!.add(e.agent)
    projects.set(e.project, (projects.get(e.project) ?? new Set()).add(e.agent))
    for (const [h, ms] of hours(e.t, e.ms)) {
      const d = dayOf(h)
      if (d >= 0 && d <= 6) heat[d]![new Date(h).getHours()]! += ms
    }
  }
  const byHour = Array.from({ length: 24 }, (_, h) => heat.reduce((n, row) => n + row[h]!, 0))
  let peak: WeekReport['peak'] = null
  for (let h = 0; h < 22; h++) {
    const ms = byHour[h]! + byHour[h + 1]! + byHour[h + 2]!
    // A window opens on an hour that has work, so "2–5 PM" never starts in the quiet.
    if (byHour[h]! > 0 && ms > (peak?.ms ?? 0)) peak = { from: h, to: h + 3, ms }
  }
  const top = [...projects].sort((a, b) => b[1].size - a[1].size)[0]
  const perDay = agentDays.map((s, i) => ({ agents: s.size, usd: usd[i]! }))
  const best = perDay.reduce((b, d, i) => (d.agents > (b?.agents ?? 0) ? { day: i, agents: d.agents } : b), null as WeekReport['busiest'])
  return { start, agentMs, agents: all.size, turns, costUsd, peak, topProject: top ? { name: top[0], agents: top[1].size } : null, busiest: best, perDay, byModel: sorted(models), heat }
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
const LEGACY_PROGRAM = { cost: 'claude', tokens: 'agy' } as const

export interface Spend {
  usd: number
  tokens: number
}
export interface AgentUse extends Spend {
  agent: string
  name: string
  provider: string
  model: string
  turns: number
}
export interface Overview {
  /** One entry per day, oldest first, split by program. */
  days: { date: string; by: Record<string, Spend> }[]
  total: Spend
  /** The same length of time just before this window, for the change shown beside the total. */
  before: Spend
  providers: ({ provider: string; today: Spend } & Spend)[]
  projects: ({ project: string; lastAt: number; by: Record<string, Spend>; agents: AgentUse[] } & Spend)[]
  models: ({ model: string; provider: string } & Spend)[]
  /** Spend by Claude account ('' is this computer's own login), the same totals split; an agent on no account counts as ''. */
  accounts: ({ account: string; today: Spend } & Spend)[]
}

const none = (): Spend => ({ usd: 0, tokens: 0 })
const add = (to: Spend, e: Spend) => {
  to.usd += e.usd
  to.tokens += e.tokens
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
  const list = Array.from({ length: days }, (_, i) => ({ date: dateKey(dayAt(days - 1 - i)), by: {} as Record<string, Spend> }))
  const index = new Map(list.map((d, i) => [d.date, i]))
  const total = none()
  const before = none()
  const byProvider = new Map<string, { all: Spend; today: Spend }>()
  const byProject = new Map<string, { all: Spend; lastAt: number; by: Record<string, Spend>; agents: Map<string, AgentUse> }>()
  const byModel = new Map<string, { provider: string; all: Spend }>()
  const byAccount = new Map<string, { all: Spend; today: Spend }>()
  const turns = new Map<string, number>()
  const open = (e: { project: string; agent: string }, provider: string, model: string, name?: string) => {
    const p = byProject.get(e.project) ?? { all: none(), lastAt: 0, by: {} as Record<string, Spend>, agents: new Map<string, AgentUse>() }
    byProject.set(e.project, p)
    const a = p.agents.get(e.agent) ?? { agent: e.agent, name: name ?? names[e.agent] ?? 'removed agent', provider, model, usd: 0, tokens: 0, turns: 0 }
    p.agents.set(e.agent, a)
    return { p, a }
  }
  for (const e of events) {
    if (e.k === 'work') {
      if (e.t >= first) turns.set(e.agent, (turns.get(e.agent) ?? 0) + 1)
      continue
    }
    const spend: Spend = e.k === 'cost' ? { usd: e.usd, tokens: 0 } : { usd: 0, tokens: e.input + e.output }
    if (e.t >= prior && e.t < first) add(before, spend)
    const i = index.get(dateKey(e.t))
    if (i === undefined) continue
    const provider = e.provider ?? LEGACY_PROGRAM[e.k]
    add(total, spend)
    add((list[i]!.by[provider] ??= none()), spend)
    const pr = byProvider.get(provider) ?? { all: none(), today: none() }
    byProvider.set(provider, pr)
    add(pr.all, spend)
    if (i === days - 1) add(pr.today, spend)
    const ac = byAccount.get(e.account ?? '') ?? { all: none(), today: none() }
    byAccount.set(e.account ?? '', ac)
    add(ac.all, spend)
    if (i === days - 1) add(ac.today, spend)
    const { p, a } = open(e, provider, e.model, e.name)
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
  return {
    days: list,
    total,
    before,
    providers: [...byProvider].map(([provider, v]) => ({ provider, today: v.today, ...v.all })).sort((a, b) => weight(b) - weight(a)),
    projects: [...byProject]
      .map(([project, v]) => ({ project, lastAt: v.lastAt, by: v.by, ...v.all, agents: [...v.agents.values()].map((a) => ({ ...a, turns: turns.get(a.agent) ?? 0 })).sort((a, b) => weight(b) - weight(a)) }))
      .sort((a, b) => weight(b) - weight(a)),
    accounts: [...byAccount].map(([account, v]) => ({ account, today: v.today, ...v.all })).sort((a, b) => weight(b) - weight(a)),
    models: [...byModel].map(([k, v]) => ({ model: k.slice(k.indexOf('\n') + 1), provider: v.provider, ...v.all })).sort((a, b) => weight(b) - weight(a))
  }
}
