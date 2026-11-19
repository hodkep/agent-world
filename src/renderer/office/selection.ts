/** What a selection in the Office viewer becomes in the agent's message. */
export interface Rect {
  r1: number
  c1: number
  r2: number
  c2: number
}

/** The most cells one selection puts in a message, so one drag cannot flood it. */
export const MAX_CELLS = 500

const norm = (r: Rect): Rect => ({ r1: Math.min(r.r1, r.r2), c1: Math.min(r.c1, r.c2), r2: Math.max(r.r1, r.r2), c2: Math.max(r.c1, r.c2) })

/** A column number as its letters: 0 is A, 26 is AA. */
const letters = (n: number) => {
  let s = ''
  for (let k = n + 1; k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(65 + ((k - 1) % 26)) + s
  return s
}

/** `Sheet1!B2:D4`; one cell is named once, and a CSV (no sheet) is just `B2:D4`. */
export function rangeLabel(sheet: string, rect: Rect): string {
  const { r1, c1, r2, c2 } = norm(rect)
  const a = `${letters(c1)}${r1 + 1}`
  const b = `${letters(c2)}${r2 + 1}`
  const ref = a === b ? a : `${a}:${b}`
  return sheet ? `${sheet}!${ref}` : ref
}

export interface Picked {
  text: string
  label: string
}

/** Words selected in a page or a slide, quoted with the file's name; `where` is "slide 2" for a deck. */
export function wordsContext(file: string, text: string, where = ''): Picked {
  const quoted = text.split('\n').map((l) => `> ${l}`.trimEnd()).join('\n')
  return { label: `${file}, ${where || 'selection'}`, text: `From ${file}${where ? `, ${where}` : ''}:\n${quoted}` }
}

/** A cell as one line of a markdown table. */
const cell = (v: string | undefined) => (v ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim()

/** Selected cells as a small table with the sheet's header row, so the columns mean something; cut at MAX_CELLS. */
export function cellsContext(file: string, sheet: string, grid: string[][], rect: Rect): Picked {
  const { r1, c1, r2, c2 } = norm(rect)
  const cols = c2 - c1 + 1
  const rows = r2 - r1 + 1
  const keep = Math.min(rows, Math.max(1, Math.floor(MAX_CELLS / cols)))
  const line = (r: number) => `| ${Array.from({ length: cols }, (_, i) => cell(grid[r]?.[c1 + i])).join(' | ')} |`
  const header = r1 > 0
  const body = Array.from({ length: header ? keep : keep - 1 }, (_, i) => line(header ? r1 + i : r1 + 1 + i))
  const lines = [header ? line(0) : line(r1), `| ${Array.from({ length: cols }, () => '---').join(' | ')} |`, ...body]
  const notes = [header && 'header row included', keep < rows && `first ${keep} of ${rows} rows, ${keep * cols} cells`].filter(Boolean)
  const label = rangeLabel(sheet, rect)
  return { label: `${file}, ${label}`, text: `From ${file}, ${label}${notes.length ? ` (${notes.join('; ')})` : ''}:\n${lines.join('\n')}` }
}
