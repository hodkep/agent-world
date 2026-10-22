import { agentsByRecent, projectsByRecent } from '../shared/recent'
import { next } from './cycle'

/** Agent ids in the order the Agents dropdown lists them, with `fresh` (the times read as the switcher opened) winning over the times they were loaded with. */
export const agentOrder = (agents: { id: string; group?: string; activeAt?: number }[], fresh: Record<string, number>): string[] =>
  agentsByRecent(agents.map((a) => ({ ...a, activeAt: fresh[a.id] ?? a.activeAt }))).map((a) => a.id)

/** Project paths in the order the Projects dropdown lists them, without folders that are gone. */
export const spaceOrder = (items: { path: string; exists: boolean }[], activity: Record<string, number>): string[] =>
  projectsByRecent(items.filter((w) => w.exists), activity).map((w) => w.path)

/** Where presses of the key, each a step along (1) or back (-1), lead from `from`. */
export function stepped(ids: string[], from: string | null, dirs: (1 | -1)[]): string | null {
  let at = from
  for (const d of dirs) at = next(ids, at, d) ?? at
  return at ?? null
}
