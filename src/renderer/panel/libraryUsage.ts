import type { LibraryItem, SkillUse } from '../../shared/library'

type Skill = Pick<LibraryItem, 'id' | 'name' | 'kind' | 'tokens'>
export interface SkillRow<T extends Skill> {
  item: T
  use: SkillUse
  on: boolean
}

/** The library's skills split into those used in the window (most used first) and those not, with what the unused ones still on for Claude cost every session. */
export function splitUsage<T extends Skill>(items: T[], usage: Record<string, SkillUse>, claudeOff: string[]): { used: SkillRow<T>[]; unused: SkillRow<T>[]; unusedCost: number } {
  const rows = items.filter((i) => i.kind === 'skill').map((item) => ({ item, use: usage[item.id] ?? { used: 0, last: 0, agents: [], accounts: [] }, on: !claudeOff.includes(item.id) }))
  const used = rows.filter((r) => r.use.used > 0).sort((a, b) => b.use.used - a.use.used || a.item.name.localeCompare(b.item.name))
  const unused = rows.filter((r) => r.use.used === 0).sort((a, b) => a.item.name.localeCompare(b.item.name))
  return { used, unused, unusedCost: unused.filter((r) => r.on).reduce((n, r) => n + r.item.tokens.description, 0) }
}
