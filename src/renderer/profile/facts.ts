import type { AgentProfile } from '../../shared/types'
import type { Role } from '../world/worldState'
import { agoLabel, durationLabel } from './format'

/** Everything the profile card needs for one agent, gathered from what the app holds. */
export interface CardData {
  id: string
  name: string
  role: Role
  roleLabel: string
  activity: string
  model: string
  effort: string
  /** The permission mode, in words. */
  mode: string
  /** Empty for an agent that works in the folder itself. */
  branch: string
  ctx: number | null
  costUsd: number
  budgetUsd?: number
  add: number
  del: number
  profile: AgentProfile | null
  /** What can be edited, as the choices in use (the model alias, the thinking level, the permission mode). */
  modelId: string
  effortId: string
  modeId: string
  /** Settings can be changed now: it is not in the middle of a turn. */
  canSwitch: boolean
}

export interface Fact {
  key: string
  label: string
  value: string
  /** Left out of the small card. */
  more: boolean
  /** A shorter wording for the card, where the column is narrow; the text list uses `value`. */
  short?: string
}

/** The same facts drive the card and the text list in the panel, so what you see is also what a screen reader gets. */
export function factRows(d: CardData, now: number): Fact[] {
  const p = d.profile
  const money = (n: number) => `$${n.toFixed(2)}`
  const f = (key: string, label: string, value: string, more = true, short?: string): Fact => ({ key, label, value, more, ...(short && { short }) })
  return [
    f('model', 'Model', d.model ? `${d.model}${d.effort ? ` · ${d.effort}` : ''}` : 'not reported yet', false),
    f('mode', 'Mode', d.mode || 'default'),
    f('branch', 'Branch', d.branch || 'works in the folder itself'),
    f('hired', 'Hired', p ? `${agoLabel(p.hiredAt, now)}${p.hiredEstimated && p.hiredAt ? ' (estimated)' : ''}` : 'loading…'),
    f('worked', 'Worked', p ? durationLabel(p.workedMs) : 'loading…'),
    f('context', 'Context', d.ctx === null ? 'not reported yet' : `${Math.round(d.ctx)}% used`, false, d.ctx === null ? undefined : `${Math.round(d.ctx)}%`),
    f('cost', 'Cost', d.budgetUsd ? `${money(d.costUsd)} of $${d.budgetUsd}` : money(d.costUsd), false),
    f('lines', 'Lines', `+${d.add} −${d.del}`, false),
    f('files', 'Files · turns', p ? `${p.files} ${p.files === 1 ? 'file' : 'files'} · ${p.turns} ${p.turns === 1 ? 'turn' : 'turns'}` : 'loading…', true, p ? `${p.files} · ${p.turns}` : undefined),
    f('subagents', 'Subagents', p ? String(p.subagents) : 'loading…'),
    f('commits', 'Commits', p ? (p.commits === null ? 'none (no branch of its own)' : String(p.commits)) : 'loading…'),
    f('tools', 'Tools', p ? (p.tools.length ? p.tools.map(([n, c]) => `${n} ${c}`).join(', ') : 'none yet') : 'loading…')
  ]
}
