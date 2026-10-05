import type { HeaderIconName } from '../panel/IconButton'
import { humanize, parseMcpName } from '../chat/mcp'

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

/** An outline icon for what a tool does: run a command, look something up, change a file, call an MCP server, or read. */
export function toolIcon(name: string): HeaderIconName {
  if (/^mcp__/.test(name)) return 'plug'
  if (/^bash$/i.test(name)) return 'terminal'
  if (/search|grep|glob/i.test(name)) return 'search'
  if (/edit|write|notebook/i.test(name)) return 'pen'
  return 'file'
}

/** The most used tools as bars, the busiest full length. An MCP tool is worded ("Send message") with its server beside it. */
export function toolBars(tools: [string, number][]): { name: string; label: string; source: string; count: number; pct: number; icon: HeaderIconName }[] {
  const max = Math.max(1, ...tools.map((t) => t[1]))
  return tools.map(([name, count]) => {
    const mcp = parseMcpName(name)
    return { name, label: mcp ? humanize(mcp.tool) : name, source: mcp?.server ?? '', count, pct: Math.round((count / max) * 100), icon: toolIcon(name) }
  })
}

export const EFFORT_STEPS = ['low', 'medium', 'high', 'xhigh', 'max'] as const

/** Which of the five thinking steps are lit for the level in use (none when it is the default). */
export function effortPips(effort: string): boolean[] {
  const at = EFFORT_STEPS.indexOf(effort as (typeof EFFORT_STEPS)[number])
  return EFFORT_STEPS.map((_, i) => at >= 0 && i <= at)
}
