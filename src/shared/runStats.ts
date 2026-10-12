import type { LedgerEvent } from './ledger'
import { weekStartOf } from './ledger'
import type { Round, Run } from './runs'

/** Runs that overlap the week that began last Monday: one still open counts until now. Oldest first, as given. */
export const runsThisWeek = (runs: Run[], now: number) => runs.filter((r) => (r.endedAt ?? now) >= weekStartOf(now))

const roundMs = (r: Round, now: number) => Math.max(0, (r.endedAt ?? now) - r.startedAt)

export interface RunStats {
  runs: number
  rounds: number
  open: number
  commits: number
  flagged: number
  /** Runs the app started from a commit: the agent never announced them. */
  byApp: number
  /** Time spent in rounds (the gaps between rounds are nobody's); a run the app started has no known start, so it adds none. */
  ms: number
}

export function runStats(runs: Run[], now: number): RunStats {
  const s: RunStats = { runs: runs.length, rounds: 0, open: 0, commits: 0, flagged: 0, byApp: 0, ms: 0 }
  for (const r of runs) {
    s.rounds += r.rounds.length
    if (r.status === 'open') s.open++
    if (r.auto) s.byApp++
    for (const round of r.rounds) {
      s.commits += round.commits.length
      s.flagged += round.commits.filter((c) => c.flagged).length
      if (!r.auto) s.ms += roundMs(round, now)
    }
  }
  return s
}

/** Runs per agent, most first. */
export function agentCounts(runs: Run[]) {
  const n = new Map<string, number>()
  for (const r of runs) n.set(r.name, (n.get(r.name) ?? 0) + 1)
  return [...n].map(([name, count]) => ({ name, n: count })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
}

export const howRunsBegan = (runs: Run[]) => ({ announced: runs.filter((r) => !r.auto).length, byApp: runs.filter((r) => r.auto).length })

export interface Spend {
  usd: number
  tokens: number
}

export type RunSpend = Spend & { known: boolean; rounds: Spend[] }

/** What the agent spent inside each round's window of a run, from the ledger, and the total. A run the app started has no known window, so `known` is false and the numbers are zero. */
export function runSpend(run: Run, ledger: LedgerEvent[], now: number): RunSpend {
  if (run.auto) return { usd: 0, tokens: 0, known: false, rounds: run.rounds.map(() => ({ usd: 0, tokens: 0 })) }
  const rounds = run.rounds.map((round): Spend => {
    const to = round.endedAt ?? now
    let usd = 0
    let tokens = 0
    for (const e of ledger) {
      if (e.k === 'limit' || e.k === 'work' || e.agent !== run.agent || e.t < round.startedAt || e.t > to) continue
      if (e.k === 'cost') usd += e.usd
      else tokens += e.input + e.output
    }
    return { usd, tokens }
  })
  return { usd: rounds.reduce((n, x) => n + x.usd, 0), tokens: rounds.reduce((n, x) => n + x.tokens, 0), known: true, rounds }
}

export function formatDuration(ms: number): string {
  const m = Math.floor(ms / 60_000)
  if (m < 1) return 'under 1m'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return m % 60 ? `${h} h ${m % 60} m` : `${h} h`
}
export const formatCost = (usd: number) => (usd === 0 ? '$0' : `$${usd.toFixed(2)}`)
export function formatTokens(n: number): string {
  if (n < 1000) return String(n)
  const k = n / 1000
  return `${k >= 10 ? Math.round(k) : Math.round(k * 10) / 10}k`
}

/** The cost of a run or a round as one short piece of text: a dash when the app cannot know it. */
export function spendText(s: Pick<RunSpend, 'usd' | 'tokens' | 'known'> | undefined): string {
  if (!s || !s.known) return '—'
  if (s.usd > 0) return formatCost(s.usd)
  return s.tokens > 0 ? `${formatTokens(s.tokens)} tokens` : '$0'
}
