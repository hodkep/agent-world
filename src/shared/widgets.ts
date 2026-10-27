// POC: small pages an agent writes for the person's look. A widget runs in a sandbox with no network and no way back into the app: it is given numbers and draws them.
import type { UsageLimits } from './usage'
import type { Todo } from './todos'

export type WidgetSlot = 'chat-top' | 'above-composer'
export const SLOTS: WidgetSlot[] = ['chat-top', 'above-composer']
export type MeterName = 'usage' | 'tokens' | 'cost' | 'todos'
export const METERS: MeterName[] = ['usage', 'tokens', 'cost', 'todos']

export interface Widget {
  id: string
  slot: WidgetSlot
  /** Pixels; the width is the panel's. */
  height: number
  /** The page: html, with its own style and script. It cannot reach anything outside itself. */
  html: string
  /** The numbers it is given, and nothing else of the app's. */
  meters: MeterName[]
}

export const MAX_WIDGETS = 6
export const MAX_HTML = 100_000

/** What a widget is given, only the numbers it asked for. A number the app does not have is null, never zero. */
export interface Meters {
  usage?: { fiveHour: { left: number; resetsAt: number } | null; sevenDay: { left: number; resetsAt: number } | null }
  tokens?: { input: number; output: number } | null
  cost?: number
  todos?: number | null
}

export function checkWidgets(raw: unknown): { widgets: Widget[]; problems: string[] } {
  if (raw == null) return { widgets: [], problems: [] }
  if (!Array.isArray(raw)) return { widgets: [], problems: ['widgets must be a list.'] }
  const widgets: Widget[] = []
  const problems: string[] = []
  raw.forEach((x, i) => {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
    const at = `Widget ${i + 1}`
    const id = o.id
    if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,29}$/.test(id)) return void problems.push(`${at}: id must be 1 to 30 characters of a-z, 0-9 and -.`)
    if (widgets.some((w) => w.id === id)) return void problems.push(`${at}: id ${id} is used twice.`)
    if (!SLOTS.includes(o.slot as WidgetSlot)) return void problems.push(`${at}: slot must be one of ${SLOTS.join(', ')}.`)
    const height = o.height === undefined ? 40 : o.height
    if (typeof height !== 'number' || !Number.isInteger(height) || height < 24 || height > 240) return void problems.push(`${at}: height must be a whole number from 24 to 240.`)
    if (typeof o.html !== 'string' || o.html.trim() === '' || o.html.length > MAX_HTML) return void problems.push(`${at}: html must be text, 1 to ${MAX_HTML} characters.`)
    const meters = o.meters === undefined ? [] : o.meters
    if (!Array.isArray(meters) || !meters.every((m) => METERS.includes(m as MeterName))) return void problems.push(`${at}: meters must be a list of ${METERS.join(', ')}.`)
    if (widgets.length >= MAX_WIDGETS) return
    widgets.push({ id, slot: o.slot as WidgetSlot, height, html: o.html, meters: [...new Set(meters as MeterName[])] })
  })
  return { widgets, problems }
}

/** The numbers for a widget that asked for `want`, made from what the window already holds about one agent. */
export function metersFor(want: MeterName[], d: { limits: UsageLimits; tokens?: { input: number; output: number } | null; costUsd?: number; todosUpdated?: number | null }): Meters {
  const left = (l: { pct: number; resetsAt: number } | null) => (l ? { left: Math.max(0, Math.min(100, Math.round(100 - l.pct))), resetsAt: l.resetsAt } : null)
  const out: Meters = {}
  if (want.includes('usage')) out.usage = { fiveHour: left(d.limits.fiveHour), sevenDay: left(d.limits.sevenDay) }
  if (want.includes('tokens')) out.tokens = d.tokens ? { input: d.tokens.input, output: d.tokens.output } : null
  if (want.includes('cost') && d.costUsd !== undefined) out.cost = d.costUsd
  if (want.includes('todos')) out.todos = d.todosUpdated ?? null
  return out
}

/** How many todos this agent changed since a time: each once, whatever it did to it. */
export function todosUpdatedBy(board: Todo[], agentId: string, since: number): number {
  return board.filter((t) => t.history.some((e) => e.by.kind === 'agent' && e.by.id === agentId && e.at >= since)).length
}
