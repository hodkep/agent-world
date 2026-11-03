import type { LibraryItem, SkillUse } from '../../shared/library'

const NONE: SkillUse = { used: 0, last: 0, agents: [], accounts: [], days: Array<number>(30).fill(0), who: [] }

type Skill = Pick<LibraryItem, 'id' | 'name' | 'kind' | 'tokens'>
export interface SkillRow<T extends Skill> {
  item: T
  use: SkillUse
  on: boolean
}

/** The library's skills split into those used in the window (most used first) and those not, with what the unused ones still on for Claude cost every session. */
export function splitUsage<T extends Skill>(items: T[], usage: Record<string, SkillUse>, claudeOff: string[]): { used: SkillRow<T>[]; unused: SkillRow<T>[]; unusedCost: number } {
  const rows = items.filter((i) => i.kind === 'skill').map((item) => ({ item, use: usage[item.id] ?? NONE, on: !claudeOff.includes(item.id) }))
  const used = rows.filter((r) => r.use.used > 0).sort((a, b) => b.use.used - a.use.used || a.item.name.localeCompare(b.item.name))
  const unused = rows.filter((r) => r.use.used === 0).sort((a, b) => a.item.name.localeCompare(b.item.name))
  return { used, unused, unusedCost: unused.filter((r) => r.on).reduce((n, r) => n + r.item.tokens.description, 0) }
}

/** What Clear the dust turns off for Claude: the unused skills still on, and the tokens that saves at the start of every session. */
export function dustOf<T extends Skill>(split: { unused: SkillRow<T>[] }): { ids: string[]; saves: number } {
  const on = split.unused.filter((r) => r.on)
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
