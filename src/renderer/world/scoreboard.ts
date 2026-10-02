export interface ScoreRow {
  /** Upper case and short, to fit the sign's bitmap font. */
  name: string
  lines: number
  /** Bar length as a share of the top row. */
  pct: number
}

const MAX_ROWS = 4
const MAX_NAME = 6

/** Who changed the most lines, for the sign on the lawn: the best four, with nothing for an agent that has changed none. */
export function scoreboardRows(agents: { name: string; lines: number }[]): ScoreRow[] {
  const top = agents
    .filter((a) => a.lines > 0)
    .sort((a, b) => b.lines - a.lines || a.name.localeCompare(b.name))
    .slice(0, MAX_ROWS)
  const max = top[0]?.lines ?? 1
  return top.map((a) => ({ name: a.name.slice(0, MAX_NAME).toUpperCase(), lines: a.lines, pct: Math.round((a.lines / max) * 100) }))
}
