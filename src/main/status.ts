import type { AgentStats } from '../shared/types'
import type { Limit } from '../shared/usage'

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {})
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

const limit = (v: unknown): Limit | null => {
  const pct = num(obj(v).used_percentage)
  const at = num(obj(v).resets_at)
  // Claude reports the reset time in epoch seconds.
  return pct === null || at === null ? null : { pct, resetsAt: at * 1000 }
}

export function parseStatus(payload: unknown): AgentStats | null {
  const p = obj(payload)
  const sessionId = str(p.session_id)
  if (!sessionId) return null
  const cost = obj(p.cost)
  return {
    sessionId,
    model: str(obj(p.model).display_name) ?? str(obj(p.model).id),
    contextPct: num(obj(p.context_window).used_percentage),
    costUsd: num(cost.total_cost_usd) ?? 0,
    linesAdded: num(cost.total_lines_added) ?? 0,
    linesRemoved: num(cost.total_lines_removed) ?? 0,
    effort: str(obj(p.effort).level),
    fast: p.fast_mode === true,
    limits: { fiveHour: limit(obj(p.rate_limits).five_hour), sevenDay: limit(obj(p.rate_limits).seven_day) }
  }
}

/** The line shown in Claude's own status bar, so the terminal also says it is running inside Agent World. */
export function statusText(s: AgentStats) {
  const parts = ['Agent World']
  if (s.model) parts.push(s.model)
  if (s.contextPct !== null) parts.push(`context ${Math.round(s.contextPct)}%`)
  if (s.costUsd > 0) parts.push(`$${s.costUsd.toFixed(2)}`)
  return parts.join(' · ')
}
