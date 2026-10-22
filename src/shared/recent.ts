/** Agents under their group (no group first, then by name), and inside a group the one that did something last first. Equal or missing times keep the given order. */
export function agentsByRecent<T extends { group?: string; activeAt?: number }>(agents: T[]): T[] {
  return agents
    .map((a, i) => ({ a, i }))
    .sort((x, y) => (x.a.group ?? '').localeCompare(y.a.group ?? '') || (y.a.activeAt ?? -1) - (x.a.activeAt ?? -1) || x.i - y.i)
    .map((x) => x.a)
}

/** Projects whose agents did something most recently first (`activeAt` is the latest of them, by project path); the rest keep the given order after them. */
export function projectsByRecent<T extends { path: string }>(items: T[], activeAt: Record<string, number>): T[] {
  return items
    .map((w, i) => ({ w, i }))
    .sort((x, y) => (activeAt[y.w.path] ?? -1) - (activeAt[x.w.path] ?? -1) || x.i - y.i)
    .map((x) => x.w)
}

/** When each project last did something: the latest of its agents' times, by project path. */
export function activityByProject(agents: { repoPath: string; activeAt?: number }[]): Record<string, number> {
  const at: Record<string, number> = {}
  for (const a of agents) at[a.repoPath] = Math.max(at[a.repoPath] ?? 0, a.activeAt ?? 0)
  return at
}
