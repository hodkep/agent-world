// Readings: the numbers Claude's own telemetry gives about what an agent did (a request to the model, a tool call).
// A widget may ask for a figure made from them by a fixed menu of operations. Numbers only: no text of a prompt, a file or a tool's input is ever kept here.

export type ReadingKind = 'request' | 'tool'

export interface Reading {
  kind: ReadingKind
  /** When it happened, ms. */
  at: number
  /** The prompt it belongs to (Claude's own id; only compared, never shown). */
  turn?: string
  /** The tool's name, for kind 'tool'. */
  tool?: string
  /** The numbers it carries. A number Claude did not report is absent, never 0. */
  v: Record<string, number>
}

/** What each kind carries: the only names a series may use. */
export const FIELDS: Record<ReadingKind, { name: string; unit: string; note: string }[]> = {
  request: [
    { name: 'input', unit: 'tokens', note: 'read fresh' },
    { name: 'output', unit: 'tokens', note: 'written back' },
    { name: 'cacheRead', unit: 'tokens', note: 'read from the cache' },
    { name: 'cacheWrite', unit: 'tokens', note: 'written to the cache' },
    { name: 'costUsd', unit: 'dollars', note: 'price of the request' },
    { name: 'durationMs', unit: 'ms', note: 'whole request' },
    { name: 'firstTokenMs', unit: 'ms', note: 'until the first word came back' }
  ],
  tool: [
    { name: 'durationMs', unit: 'ms', note: 'how long the call took' },
    { name: 'failed', unit: '0 or 1', note: '1 when the call failed' }
  ]
}

export const OPS = ['sum', 'avg', 'max', 'last', 'count', 'ratio'] as const
export type SeriesOp = (typeof OPS)[number]
export const MAX_SERIES = 8

/** One figure a widget wants: `op` over the readings of `kind` in `over`. Needs `per` for a ratio (sum of `of` over sum of `per`). */
export interface SeriesSpec {
  id: string
  kind: ReadingKind
  /** Fields added together within one reading, then combined over the readings by `op`. Empty for a count. */
  of: string[]
  op: SeriesOp
  per?: string[]
  /** 'last:N' (the last N readings, 1 to 500), 'mins:N' (the last N minutes, 1 to 1440) or 'turn' (the latest prompt). */
  over: string
  /** Only calls of this tool, for kind 'tool'. */
  tool?: string
}

const OVER = /^(?:turn|last:([1-9]\d{0,2})|mins:([1-9]\d{0,3}))$/
const overOk = (s: string) => {
  const m = OVER.exec(s)
  return !!m && (m[1] === undefined || +m[1] <= 500) && (m[2] === undefined || +m[2] <= 1440)
}

export function checkSeries(raw: unknown): { series: SeriesSpec[]; problems: string[] } {
  if (raw == null) return { series: [], problems: [] }
  if (!Array.isArray(raw)) return { series: [], problems: ['series must be a list.'] }
  if (raw.length > MAX_SERIES) return { series: [], problems: [`series: at most ${MAX_SERIES} per widget.`] }
  const series: SeriesSpec[] = []
  for (const [i, x] of raw.entries()) {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
    const at = `Series ${i + 1}`
    const bad = (m: string) => ({ series: [], problems: [`${at}: ${m}`] })
    if (typeof o.id !== 'string' || !/^[a-z][a-z0-9-]{0,19}$/.test(o.id)) return bad('id must be 1 to 20 characters of a-z, 0-9 and -, starting with a letter.')
    if (series.some((s) => s.id === o.id)) return bad(`id ${o.id} is used twice.`)
    const kind = o.kind as ReadingKind
    if (!(kind in FIELDS)) return bad(`kind must be one of ${Object.keys(FIELDS).join(', ')}.`)
    const op = o.op as SeriesOp
    if (!OPS.includes(op)) return bad(`op must be one of ${OPS.join(', ')}.`)
    if (typeof o.over !== 'string' || !overOk(o.over)) return bad('over must be turn, last:N (1 to 500) or mins:N (1 to 1440).')
    const names = FIELDS[kind].map((f) => f.name)
    const fields = (v: unknown, what: string): string[] | null => {
      if (v === undefined) return []
      if (!Array.isArray(v) || v.length > 8 || !v.every((n) => typeof n === 'string' && names.includes(n))) {
        problems.push(`${at}: ${what} must be a list of ${names.join(', ')} (kind ${kind}); ${JSON.stringify(v)} is not.`)
        return null
      }
      return [...new Set(v as string[])]
    }
    const problems: string[] = []
    const of = fields(o.of, 'of')
    const per = fields(o.per, 'per')
    if (!of || !per) return { series: [], problems }
    if (op !== 'count' && of.length === 0) return bad('of must name at least one field (only count may leave it out).')
    if (op === 'ratio' && per.length === 0) return bad('a ratio needs per: the fields it is divided by.')
    if (o.tool !== undefined && (typeof o.tool !== 'string' || !/^[A-Za-z0-9_*.:-]{1,80}$/.test(o.tool) || kind !== 'tool')) return bad('tool must be a tool name, and only for kind tool.')
    series.push({ id: o.id, kind, of, op, ...(op === 'ratio' && { per }), over: o.over, ...(typeof o.tool === 'string' && { tool: o.tool }) })
  }
  return { series, problems: [] }
}

const total = (r: Reading, names: string[]): number | null => {
  let n = 0
  for (const f of names) {
    const x = r.v[f]
    if (x === undefined) return null
    n += x
  }
  return n
}

/** The figure for one series from an agent's readings (oldest first). Null when no reading reports it, so "none" and "zero" stay apart; a count of nothing is 0. */
export function computeSeries(all: Reading[], s: SeriesSpec, now: number): number | null {
  const turn = all.at(-1)?.turn
  let rs = all.filter((r) => r.kind === s.kind && (s.tool === undefined || r.tool === s.tool))
  const m = OVER.exec(s.over)
  if (s.over === 'turn') rs = turn === undefined ? [] : rs.filter((r) => r.turn === turn)
  else if (m?.[1]) rs = rs.slice(-Number(m[1]))
  else if (m?.[2]) rs = rs.filter((r) => r.at >= now - Number(m[2]) * 60_000)
  if (s.op === 'count') return rs.length
  if (s.op === 'ratio') {
    const have = rs.filter((r) => total(r, s.of) !== null && total(r, s.per ?? []) !== null)
    const den = have.reduce((n, r) => n + total(r, s.per ?? [])!, 0)
    return have.length && den > 0 ? have.reduce((n, r) => n + total(r, s.of)!, 0) / den : null
  }
  const xs = rs.map((r) => total(r, s.of)).filter((x): x is number => x !== null)
  if (!xs.length) return null
  if (s.op === 'sum') return xs.reduce((a, b) => a + b, 0)
  if (s.op === 'avg') return xs.reduce((a, b) => a + b, 0) / xs.length
  if (s.op === 'max') return Math.max(...xs)
  return xs[xs.length - 1]!
}

/** What an agent reads before it writes a series: what exists, and how to ask. */
export function catalogText(): string {
  const lines = (['request', 'tool'] as const).map((k) => `kind ${k}${k === 'tool' ? ' (one per tool call; optional tool: name)' : ' (one per request to the model)'}:\n` + FIELDS[k].map((f) => `  ${f.name} [${f.unit}] ${f.note}`).join('\n'))
  return `${lines.join('\n')}
op: sum | avg | max | last | count | ratio. A ratio is the sum of "of" over the sum of "per": cache hit rate is of [cacheRead], per [input, cacheRead, cacheWrite].
over: last:N (N readings, 1 to 500) | mins:N (1 to 1440) | turn (the latest prompt).
A series is { id, kind, of, op, per?, over, tool? }. The widget receives data.series[id] as a number, or null when Claude has not reported it. Readings come from Claude agents only, start empty when the app starts, and hold numbers, never text.`
}
