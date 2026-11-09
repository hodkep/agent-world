/** What the tool cards (the "instruments") need to say at a glance: an edit's +/−, an MCP server's colour, and an MCP result as a table, list or names and values. */

const lines = (t: string) => (t ? t.split('\n') : [])

/** Lines in `to` that are not in `from` and the other way round, each counted as often as it appears: close enough to a diff's +/− for a header. */
export function lineDelta(from: string, to: string) {
  const left = new Map<string, number>()
  for (const l of lines(from)) left.set(l, (left.get(l) ?? 0) + 1)
  let added = 0
  for (const l of lines(to)) {
    const k = left.get(l) ?? 0
    if (k > 0) left.set(l, k - 1)
    else added++
  }
  let removed = 0
  for (const k of left.values()) removed += k
  return { added, removed }
}

// The colours people know these servers by; any other server gets one of the rest, the same every time.
const KNOWN: [RegExp, string][] = [
  [/playwright|browser|chrome/i, '#45ba4b'],
  [/slack/i, '#e0567f'],
  [/linear/i, '#8b7cf6'],
  [/github/i, '#c9d1d9'],
  [/figma/i, '#f2784b'],
  [/postgres|sql|supabase|neon/i, '#5b8fd6'],
  [/notion/i, '#e4e4ee'],
  [/agent-world/i, '#f2c230'],
  [/google|drive|gmail|docs|sheets|calendar/i, '#4f9ef0']
]
const SPARE = ['#6ad0e0', '#e0a85a', '#b38bff', '#7ee0b0', '#e07aa8', '#9fb4e0']

export function serverColor(server: string): string {
  const known = KNOWN.find(([re]) => re.test(server))
  if (known) return known[1]
  let h = 0
  for (const c of server) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return SPARE[h % SPARE.length]!
}

export type Preview =
  | { kind: 'table'; cols: string[]; rows: string[][]; total: number }
  | { kind: 'list'; items: string[]; total: number }
  | { kind: 'kv'; pairs: [string, string][] }

const MAX_ROWS = 5
const MAX_COLS = 5
const short = (v: unknown) => {
  const t = typeof v === 'string' ? v : v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
  return t.length > 60 ? `${t.slice(0, 59)}…` : t
}
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

function table(items: Record<string, unknown>[]): Preview {
  const cols: string[] = []
  for (const it of items.slice(0, MAX_ROWS)) for (const k of Object.keys(it)) if (!cols.includes(k) && cols.length < MAX_COLS) cols.push(k)
  return { kind: 'table', cols, rows: items.slice(0, MAX_ROWS).map((it) => cols.map((c) => short(it[c]))), total: items.length }
}

/** An MCP result shown by its shape, when it is JSON: records as a table, words as a list, an object as names and values. Plain text has no preview. */
export function resultPreview(text: string): Preview | null {
  const t = text.trim()
  if (!/^[[{]/.test(t)) return null
  let v: unknown
  try {
    v = JSON.parse(t)
  } catch {
    return null
  }
  if (Array.isArray(v)) {
    if (v.length && v.every(isRecord)) return table(v)
    if (v.every((x) => !isRecord(x) && !Array.isArray(x))) return { kind: 'list', items: v.slice(0, MAX_ROWS * 2).map(short), total: v.length }
    return null
  }
  if (!isRecord(v)) return null
  const lists = Object.values(v).filter((x): x is Record<string, unknown>[] => Array.isArray(x) && x.length > 0 && x.every(isRecord))
  if (lists.length === 1) return table(lists[0]!)
  const pairs = Object.entries(v).filter(([, x]) => !isRecord(x) && !Array.isArray(x)).slice(0, 8).map(([k, x]) => [k, short(x)] as [string, string])
  return pairs.length ? { kind: 'kv', pairs } : null
}
