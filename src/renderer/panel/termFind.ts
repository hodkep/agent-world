export interface Match {
  row: number
  col: number
  len: number
}

/** Where the text is in the lines of the terminal, top to bottom. */
export function findMatches(lines: string[], query: string, matchCase: boolean): Match[] {
  if (!query) return []
  const q = matchCase ? query : query.toLowerCase()
  const out: Match[] = []
  lines.forEach((line, row) => {
    const hay = matchCase ? line : line.toLowerCase()
    for (let at = hay.indexOf(q); at >= 0; at = hay.indexOf(q, at + q.length)) out.push({ row, col: at, len: q.length })
  })
  return out
}

/** The match after (or before) this one, wrapping round; -1 when there are none. */
export const stepMatch = (count: number, at: number, dir: 1 | -1) => (count === 0 ? -1 : (at + dir + count) % count)

/** The line to scroll to for the previous (-1) or next (1) prompt, given the prompts' lines and the top line shown. After the last, 'end'. */
export function markTarget(marks: number[], top: number, dir: 1 | -1): number | 'end' | null {
  if (dir === -1) return [...marks].reverse().find((m) => m < top) ?? null
  return marks.find((m) => m > top) ?? 'end'
}
