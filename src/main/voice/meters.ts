import type { Overview } from '../../shared/ledger'
import type { Run } from '../../shared/runs'
import type { AgentStats, LimitWindow } from '../../shared/types'

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s)
/** A tenth of a cent for small amounts, a cent for the rest. */
const usd = (n: number) => (n >= 1 ? Math.round(n * 100) / 100 : Math.round(n * 1000) / 1000)
const minutes = (ms: number) => Math.max(0, Math.round(ms / 60_000))

/** What is left of each limit and when it resets, the tightest first, as the voice can say it. */
export function summarizeLimits(windows: LimitWindow[], now: number, loginName: (provider: string, account: string) => string) {
  const resets = (iso: string) => {
    const left = Date.parse(iso) - now
    if (!(left > 0)) return 'due now'
    const m = Math.round(left / 60_000)
    return m >= 1440 ? `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h` : `${Math.floor(m / 60)}h ${m % 60}m`
  }
  return [...windows]
    .sort((a, b) => a.remainingPct - b.remainingPct)
    .slice(0, 12)
    .map((w) => ({ provider: w.provider, login: loginName(w.provider, w.account ?? ''), group: w.group, window: w.kind === 'five_hour' ? '5-hour' : 'weekly', leftPct: Math.round(w.remainingPct), resetsIn: resets(w.resetsAt) }))
}

/** What has been spent: today, the window, the month with its projection, the top models, and this workspace's own project, never another's. */
export function summarizeUsage(ov: Overview, project: string, days: number) {
  const sum = (ds: Overview['days']) => ds.reduce((t, d) => Object.values(d.by).reduce((u, s) => ({ usd: u.usd + s.usd, tokens: u.tokens + s.tokens }), t), { usd: 0, tokens: 0 })
  const today = ov.days.length ? sum(ov.days.slice(-1)) : { usd: 0, tokens: 0 }
  const mine = ov.projects.find((p) => p.project === project)
  return {
    today: { usd: usd(today.usd), tokens: today.tokens },
    lastDays: { days, usd: usd(ov.total.usd), tokens: ov.total.tokens, before: usd(ov.before.usd) },
    month: { spentUsd: usd(ov.month.spent.usd), projectedUsd: usd(ov.month.projected.usd), day: ov.month.day, of: ov.month.of },
    topModels: ov.models.slice(0, 5).map((m) => ({ model: m.model, provider: m.provider, usd: usd(m.usd), tokens: m.tokens })),
    thisProject: mine ? { name: mine.project, usd: usd(mine.usd), voiceUsd: usd(mine.agents.find((a) => a.agent === 'voice')?.usd ?? 0) } : null,
    note: 'Some amounts are estimates worked out from tokens where a program reports no price.'
  }
}

/** Each agent's numbers so far; an agent that has reported nothing is just its name. */
export function summarizeAgentStats(list: { name: string; stats?: AgentStats }[]) {
  return list.map(({ name, stats: s }) => (s ? { name, model: s.model, contextPct: s.contextPct, spentUsd: usd(s.costUsd), linesAdded: s.linesAdded, linesRemoved: s.linesRemoved } : { name }))
}

/** The current step of a run: the first of its workflow's steps this round has not done, approved or skipped. */
function stepOf(r: Run): string | null {
  if (!r.workflow) return null
  const done = new Set((r.rounds.at(-1)?.steps ?? []).filter((s) => s.state === 'done' || s.state === 'approved' || s.state === 'skipped').map((s) => s.step))
  return r.workflow.steps.find((s) => !done.has(s.id))?.name ?? 'all steps done'
}

/** The workflow runs of one project: those open, with where each is, and the last few that ended. */
export function summarizeRuns(runs: Run[], project: string, now: number) {
  const here = runs.filter((r) => r.project === project)
  return {
    open: here.filter((r) => r.status === 'open').map((r) => ({ agent: r.name, title: cut(r.title, 120), workflow: r.workflow?.name ?? null, step: stepOf(r), startedMinutesAgo: minutes(now - r.startedAt), reopened: r.reopened ?? 0 })),
    recent: here
      .filter((r) => r.status !== 'open')
      .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
      .slice(0, 5)
      .map((r) => ({ agent: r.name, title: cut(r.title, 120), workflow: r.workflow?.name ?? null, status: r.status, endedMinutesAgo: minutes(now - (r.endedAt ?? now)), ...(r.summary ? { summary: cut(r.summary, 160) } : {}) }))
  }
}
