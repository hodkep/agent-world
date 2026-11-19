/** What the sandboxed viewer frame may tell the app. The file's own code never runs there, but the frame holds a parser that reads an untrusted file, so every message is checked before it is believed. */
export type FrameMessage =
  | { t: 'ready' }
  | { t: 'selection'; on: boolean }
  /** Present mode started or ended in the frame (Esc inside it ends it). */
  | { t: 'present'; on: boolean }
  /** A key pressed while the frame has the focus, so the app's own shortcuts still work. */
  | { t: 'key'; key: string; code: string; meta: boolean; ctrl: boolean; shift: boolean; alt: boolean }
  | { t: 'words'; text: string; where?: string }
  | { t: 'cells'; sheet: string; r1: number; c1: number; r2: number; c2: number; header: string[]; rows: string[][] }
  | { t: 'found'; count: number; index: number }
  | { t: 'error'; message: string }

const MAX_TEXT = 50_000
const MAX_CELL = 2000
const MAX_CELLS = 600
const MAX_INDEX = 1_048_576

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max
const int = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max
const strs = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => str(x, MAX_CELL))

export function parseFrameMessage(data: unknown): FrameMessage | null {
  if (!isObj(data)) return null
  switch (data.t) {
    case 'ready':
      return { t: 'ready' }
    case 'selection':
      return typeof data.on === 'boolean' ? { t: 'selection', on: data.on } : null
    case 'present':
      return typeof data.on === 'boolean' ? { t: 'present', on: data.on } : null
    case 'key':
      return str(data.key, 20) && str(data.code, 20) && typeof data.meta === 'boolean' && typeof data.ctrl === 'boolean' && typeof data.shift === 'boolean' && typeof data.alt === 'boolean'
        ? { t: 'key', key: data.key, code: data.code, meta: data.meta, ctrl: data.ctrl, shift: data.shift, alt: data.alt }
        : null
    case 'words':
      if (!str(data.text, MAX_TEXT) || (data.where !== undefined && !str(data.where, 60))) return null
      return data.where === undefined ? { t: 'words', text: data.text } : { t: 'words', text: data.text, where: data.where }
    case 'found':
      return int(data.count, MAX_INDEX) && int(data.index, MAX_INDEX) ? { t: 'found', count: data.count, index: data.index } : null
    case 'error':
      return str(data.message, 300) ? { t: 'error', message: data.message } : null
    case 'cells': {
      const { sheet, r1, c1, r2, c2, header, rows } = data
      if (!str(sheet, 128) || !int(r1, MAX_INDEX) || !int(c1, MAX_INDEX) || !int(r2, MAX_INDEX) || !int(c2, MAX_INDEX)) return null
      if (!strs(header) || !Array.isArray(rows) || !rows.every(strs)) return null
      if (header.length + rows.reduce((n, r) => n + r.length, 0) > MAX_CELLS || rows.length > MAX_CELLS) return null
      return { t: 'cells', sheet, r1, c1, r2, c2, header, rows }
    }
    default:
      return null
  }
}

/** The frame's header and rows put back at the columns and rows they came from, ready for `cellsContext`. */
export function gridOf(m: Extract<FrameMessage, { t: 'cells' }>): string[][] {
  const at = (vals: string[]) => {
    const row: string[] = []
    vals.forEach((v, i) => (row[Math.min(m.c1, m.c2) + i] = v))
    return row
  }
  const grid: string[][] = []
  grid[0] = at(m.header)
  m.rows.forEach((r, i) => (grid[Math.min(m.r1, m.r2) + i] = at(r)))
  return grid
}
