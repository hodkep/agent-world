import { contextReport, ctxOf, runsOf, BANDS, type ContextReport, type CtxReq } from './contextCurve'
import { DAY, acctKey, whoMap, type LedgerEvent } from './ledger'

const POINTS = 240

export interface AgentContext {
  agent: string
  name: string
  report: ContextReport
  /** The agent's context at each request, cut to a few hundred so a chart stays light. */
  points: number[]
  /** Where it was reset (an index into `points`), the context just before and the context at the first request after. */
  resets: { at: number; before: number; after: number }[]
}

export interface ContextView {
  total: ContextReport
  /** The same number of days just before these, or null when nothing was recorded then. */
  before: ContextReport | null
  /** The costliest first. */
  agents: AgentContext[]
}

type Req = Extract<LedgerEvent, { k: 'req' }>

/** How big the context was at each request of the last `days` days, in all and per agent; of one account (see `acctKey`) when `onlyAccount` is given. */
export function contextView(events: LedgerEvent[], days: number, now: number, names: Record<string, string>, onlyAccount?: string): ContextView {
  const who = whoMap(events, names)
  const mine = (e: Req) => onlyAccount === undefined || acctKey(who(e).provider, who(e).account) === onlyAccount
  const reqs = events.filter((e): e is Req => e.k === 'req' && mine(e))
  const within = (from: number, to: number) => reqs.filter((e) => e.t > from && e.t <= to)
  const now0 = within(now - days * DAY, now)
  const prior = within(now - 2 * days * DAY, now - days * DAY)
  const by = new Map<string, Req[]>()
  for (const e of now0) by.set(e.agent, [...(by.get(e.agent) ?? []), e])
  const agents = [...by].map(([agent, list]): AgentContext => {
    const sorted = [...list].sort((a, b) => a.t - b.t)
    const step = Math.max(1, Math.ceil(sorted.length / POINTS))
    const runs = runsOf(sorted)
    let upTo = 0
    return {
      agent,
      name: who(list[0]!).name,
      report: contextReport(list),
      points: sorted.filter((_, i) => i % step === 0).map(ctxOf),
      resets: runs.slice(1).map((run, i) => ((upTo += runs[i]!.length), { at: Math.floor(upTo / step), before: ctxOf(runs[i]!.at(-1)!), after: ctxOf(run[0]!) }))
    }
  })
  return { total: contextReport(now0), before: prior.length ? contextReport(prior) : null, agents: agents.sort((a, b) => b.report.weight - a.report.weight) }
}

const k = (n: number) => `${Math.round(n / 1000)}k`
const pct = (x: number) => `${Math.round(x * 100)}%`

/** Three plain sentences about one agent (by name) or, with no name, the whole office: where the cost was, what resets did, what a cap would have saved. */
export function insightsOf(v: ContextView, name?: string): [string, string, string] {
  const a = name === undefined ? undefined : v.agents.find((x) => x.name === name)
  const r = a?.report ?? v.total
  const huge = r.bands[2]!
  const cost = a ? `${a.name} spent ${pct(huge.share)} of its cost above ${k(BANDS[1]!)}, peaking at ${k(r.peak)}.` : `${pct(huge.share)} of the cost came from the ${huge.requests} requests with a context over ${k(BANDS[1]!)}.`
  const last = a?.resets.at(-1)
  const who = a ? 'It' : 'Agents'
  const resets = a
    ? last ? `${who} was compacted ${a.resets.length === 1 ? 'once' : `${a.resets.length} times`}: the last time from ${k(last.before)} to ${k(last.after)}.` : `${who} never compacted: its context only grew.`
    : `${r.resets} compactions, clears or new sessions in these days.`
  return [cost, resets, `Holding ${a ? 'it' : 'every context'} to 100k would have saved about ${pct(r.saving)}.`]
}
