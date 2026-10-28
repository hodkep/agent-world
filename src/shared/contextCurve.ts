/**
 * How big the context was at each request, and what that cost. A program re-reads its whole context on every request, so
 * a long conversation pays for the same tokens again and again: this is what shows where, and whether a fix helped.
 */
export interface CtxReq {
  t: number
  agent: string
  input: number
  cacheRead?: number
  cacheWrite?: number
  output: number
}

/** What the request had in front of it: everything read fresh, from the cache and written to it. */
export const ctxOf = (r: CtxReq) => r.input + (r.cacheRead ?? 0) + (r.cacheWrite ?? 0)

/** A request's cost in input tokens at the usual price ratios (cache read a tenth, cache write 1.25, output 5), so shares need no price list. */
export const weightOf = (r: CtxReq) => r.input + 0.1 * (r.cacheRead ?? 0) + 1.25 * (r.cacheWrite ?? 0) + 5 * r.output

/** Band edges: a request is short under 100k, long from 100k, very long from 200k. */
export const BANDS = [100_000, 200_000]
const RESET_BELOW = 0.6
const RESET_FROM = 30_000
const COMES_BACK = 0.8

/**
 * An agent's requests in time order, cut where the context fell under 60% of the one before and did not come back within the next
 * three requests (a compaction, a clear or a new session). A dip that comes straight back is a small side request, not a reset.
 */
export function runsOf(reqs: CtxReq[]): CtxReq[][] {
  const by = new Map<string, CtxReq[]>()
  for (const r of [...reqs].sort((a, b) => a.t - b.t)) by.set(r.agent, [...(by.get(r.agent) ?? []), r])
  const runs: CtxReq[][] = []
  for (const list of by.values()) {
    let cur: CtxReq[] = []
    list.forEach((r, i) => {
      const prev = list[i - 1]
      const fell = prev && ctxOf(prev) >= RESET_FROM && ctxOf(r) < RESET_BELOW * ctxOf(prev)
      if (fell && !list.slice(i + 1, i + 4).some((n) => ctxOf(n) >= COMES_BACK * ctxOf(prev))) {
        runs.push(cur)
        cur = []
      }
      cur.push(r)
    })
    runs.push(cur)
  }
  return runs
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? (s[s.length >> 1]! + s[(s.length - 1) >> 1]!) / 2 : 0
}

export interface ContextReport {
  requests: number
  /** What they cost together, in input tokens at the usual price ratios (see `weightOf`). */
  weight: number
  /** Short, long and very long requests: how many, and their share of the cost (0 to 1). */
  bands: { requests: number; share: number }[]
  median: number
  peak: number
  resets: number
  /** The share of the cost (0 to 1) holding the context to `cap` would have saved, counting the cache-read part only. */
  saving: number
}

export function contextReport(reqs: CtxReq[], cap = 100_000): ContextReport {
  const bands = [0, 1, 2].map(() => ({ requests: 0, weight: 0 }))
  let total = 0
  let saved = 0
  for (const r of reqs) {
    const c = ctxOf(r)
    const b = bands[BANDS.filter((edge) => c >= edge).length]!
    b.requests++
    b.weight += weightOf(r)
    total += weightOf(r)
    saved += 0.1 * Math.max(0, c - cap)
  }
  const sizes = reqs.map(ctxOf)
  return {
    requests: reqs.length,
    weight: total,
    bands: bands.map((b) => ({ requests: b.requests, share: total > 0 ? b.weight / total : 0 })),
    median: median(sizes),
    peak: Math.max(0, ...sizes),
    resets: runsOf(reqs).length - new Set(reqs.map((r) => r.agent)).size,
    saving: total > 0 ? saved / total : 0
  }
}

/** For each reset, the median context of up to `n` requests just before it and just after it. */
export function resetEffects(reqs: CtxReq[], n = 20): { agent: string; t: number; before: number; after: number }[] {
  const byAgent = new Map<string, CtxReq[][]>()
  for (const run of runsOf(reqs)) byAgent.set(run[0]!.agent, [...(byAgent.get(run[0]!.agent) ?? []), run])
  const out: { agent: string; t: number; before: number; after: number }[] = []
  for (const [agent, runs] of byAgent)
    runs.slice(1).forEach((run, i) => out.push({ agent, t: run[0]!.t, before: median(runs[i]!.slice(-n).map(ctxOf)), after: median(run.slice(0, n).map(ctxOf)) }))
  return out.sort((a, b) => a.t - b.t)
}

const k = (n: number) => `${Math.round(n / 1000)}k`
const pct = (x: number) => `${Math.round(x * 100)}%`

/** The report in plain words, for an agent to read out to its user. `label` names the stretch ("the last 7 days"). */
export function contextText(r: ContextReport, effects: ReturnType<typeof resetEffects>, label: string, cap = 100_000): string {
  if (!r.requests) return `${label}: no requests counted yet.`
  const [short, long, huge] = r.bands as [ContextReport['bands'][number], ContextReport['bands'][number], ContextReport['bands'][number]]
  const band = (name: string, b: typeof short) => `${name}: ${b.requests} requests (${pct(b.share)})`
  return [
    `${label}: ${r.requests} requests, median context ${k(r.median)}, peak ${k(r.peak)}.`,
    `By context size, with their share of the cost: ${band(`under ${k(BANDS[0]!)}`, short)}; ${band(`${k(BANDS[0]!)} to ${k(BANDS[1]!)}`, long)}; ${band(`over ${k(BANDS[1]!)}`, huge)}.`,
    `Holding the context to ${k(cap)} would have saved about ${pct(r.saving)} (an estimate, the cache-read part only).`,
    `${r.resets} reset${r.resets === 1 ? '' : 's'} (a compaction, a clear or a new session).${effects.length ? ` Context before and after: ${effects.slice(-5).map((e) => `${k(e.before)} to ${k(e.after)}`).join(', ')}.` : ''}`
  ].join('\n')
}
