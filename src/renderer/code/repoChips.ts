export interface RepoInfo { name: string; branch: string; dirty: number }

const ROW = 2

/** The repositories that get a chip in the row and those behind the "more" menu. The picked one is always in the row: from the menu it takes the last chip's place. */
export function chipsOf(repos: RepoInfo[], picked: string | null): { shown: RepoInfo[]; more: RepoInfo[] } {
  if (repos.length <= ROW) return { shown: repos, more: [] }
  const shown = repos.slice(0, ROW)
  const p = repos.find((r) => r.name === picked)
  if (p && !shown.includes(p)) shown[ROW - 1] = p
  return { shown, more: repos.filter((r) => !shown.includes(r)) }
}

/** The remembered repository while it is still there, else the first. */
export const pickRepo = (repos: RepoInfo[], remembered: string | null): string | null => (repos.find((r) => r.name === remembered) ?? repos[0])?.name ?? null
