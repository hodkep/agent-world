import type { LibraryItem, SkillUse } from '../../shared/library'
import type { ShelfGroup } from './skillGroups'

const NONE: SkillUse = { used: 0, last: 0, agents: [], accounts: [], days: Array<number>(30).fill(0), who: [], projects: {} }

type Skill = Pick<LibraryItem, 'id' | 'name' | 'kind' | 'tokens'>
export interface SkillRow<T extends Skill> {
  item: T
  use: SkillUse
  on: boolean
}

/** The library's skills split into those used in the window (most used first) and those not. */
export function splitUsage<T extends Skill>(items: T[], usage: Record<string, SkillUse>, claudeOff: string[]): { used: SkillRow<T>[]; unused: SkillRow<T>[] } {
  const rows = items.filter((i) => i.kind === 'skill').map((item) => ({ item, use: usage[item.id] ?? NONE, on: !claudeOff.includes(item.id) }))
  const used = rows.filter((r) => r.use.used > 0).sort((a, b) => b.use.used - a.use.used || a.item.name.localeCompare(b.item.name))
  const unused = rows.filter((r) => r.use.used === 0).sort((a, b) => a.item.name.localeCompare(b.item.name))
  return { used, unused }
}

export type SkillView = 'use' | 'rest' | 'others' | 'all'

/** Which items the Skills list shows: what was picked, else the skills in use when any were used; while something is typed, everything, so a search never misses. */
export function skillView(chosen: SkillView | null, find: string, used: number): SkillView {
  if (find.trim()) return 'all'
  return chosen ?? (used > 0 ? 'use' : 'all')
}

/** The shelf's groups with only the given skills (those in use, or those resting): groups and sources stay in their order, inside a source the most used come first; what was found but is not in the library, and a group left empty, are left out. */
export function keepGroups(groups: ShelfGroup[], usage: Record<string, SkillUse>, keep: Set<string>): ShelfGroup[] {
  return groups.flatMap((g) => {
    if (g.kind === 'found') return []
    const order = new Map<string, number>()
    for (const r of g.rows) if (!order.has(r.creator?.name ?? '')) order.set(r.creator?.name ?? '', order.size)
    const rows = g.rows.filter((r) => keep.has(r.key)).sort((a, b) => order.get(a.creator?.name ?? '')! - order.get(b.creator?.name ?? '')! || (usage[b.key]?.used ?? 0) - (usage[a.key]?.used ?? 0) || a.name.localeCompare(b.name))
    return rows.length ? [{ ...g, rows, bytes: rows.reduce((n, r) => n + (r.bytes ?? 0), 0), measured: rows.every((r) => r.bytes !== undefined) }] : []
  })
}

/** What Clear the dust turns off for Claude: the unused skills still on that no playbook rule hands to agents (those would reach them anyway), and the tokens that saves at the start of every session. */
export function dustOf<T extends Skill>(split: { unused: SkillRow<T>[] }, named: Set<string> = new Set()): { ids: string[]; saves: number } {
  const on = split.unused.filter((r) => r.on && !named.has(r.item.id))
  return { ids: on.map((r) => r.item.id), saves: on.reduce((n, r) => n + r.item.tokens.description, 0) }
}

/** About what Claude keeps for skill names and descriptions at the start of a session. */
export const SKILL_BUDGET = 2000
export const METER_CELLS = 20

/** How many of the meter's cells the skills on for Claude fill: one for each 5% of the budget, at least one when any cost, never past the end. */
export function meterCells(tokens: number, budget = SKILL_BUDGET): number {
  if (tokens <= 0) return 0
  return Math.min(METER_CELLS, Math.max(1, Math.round((tokens / budget) * METER_CELLS)))
}

/** Where skills are used: each project's uses over every skill, most used first, with the skills used most there. A project the app no longer knows keeps its key as its name. */
export function byProject(usage: Record<string, SkillUse>, projects: { key: string; path: string; name: string }[]): { key: string; name: string; uses: number; top: string[] }[] {
  const per = new Map<string, Map<string, number>>()
  for (const [id, u] of Object.entries(usage)) for (const [key, n] of Object.entries(u.projects ?? {})) per.set(key, (per.get(key) ?? new Map()).set(id, n))
  return [...per.entries()]
    .map(([key, skills]) => ({ key, name: projects.find((p) => p.key === key)?.name ?? key, uses: [...skills.values()].reduce((a, b) => a + b, 0), top: [...skills.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([id]) => id) }))
    .sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name))
}
