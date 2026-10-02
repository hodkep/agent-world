export type Tone = 'ok' | 'warn' | 'bad' | 'none'
const clamp = (n: number) => Math.max(0, Math.min(100, n))
const toneFor = (pct: number): Tone => (pct > 80 ? 'bad' : pct > 60 ? 'warn' : 'ok')

/** How full the context window is; the colour turns as it fills, the same thresholds as the name-tag gauge. */
export function contextGauge(pct: number | null): { pct: number; tone: Tone } {
  if (pct === null) return { pct: 0, tone: 'none' }
  const p = Math.round(clamp(pct))
  return { pct: p, tone: toneFor(p) }
}

/** Spend against the soft budget when there is one (gold from 80%, red when over). */
export function costGauge(cost: number, budget: number | undefined): { pct: number | null; tone: Tone; label: string } {
  const money = `$${cost.toFixed(2)}`
  if (!budget) return { pct: null, tone: 'none', label: money }
  const raw = (cost / budget) * 100
  return { pct: Math.round(clamp(raw)), tone: raw > 100 ? 'bad' : raw >= 80 ? 'warn' : 'ok', label: `${money} of $${budget}` }
}

/** Lines changed, split into added and removed. */
export function linesGauge(add: number, del: number): { addPct: number; delPct: number; label: string } {
  const total = add + del
  return { addPct: total ? Math.round((add / total) * 100) : 0, delPct: total ? Math.round((del / total) * 100) : 0, label: `+${add} −${del}` }
}

/** The most used tools as bars, the busiest full length. */
export function toolBars(tools: [string, number][]): { name: string; count: number; pct: number }[] {
  const max = Math.max(1, ...tools.map((t) => t[1]))
  return tools.map(([name, count]) => ({ name, count, pct: Math.round((count / max) * 100) }))
}

export const EFFORT_STEPS = ['low', 'medium', 'high', 'xhigh', 'max'] as const

/** Which of the five thinking steps are lit for the level in use (none when it is the default). */
export function effortPips(effort: string): boolean[] {
  const at = EFFORT_STEPS.indexOf(effort as (typeof EFFORT_STEPS)[number])
  return EFFORT_STEPS.map((_, i) => at >= 0 && i <= at)
}
