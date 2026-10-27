// POC: small pages an agent writes for the person's look. A widget runs in a sandbox with no network and no way back into the app: it is given numbers and draws them.
import type { UsageLimits } from './usage'
import type { Todo } from './todos'

export type WidgetSlot = 'chat-top' | 'above-composer' | 'window-bottom'
export const SLOTS: WidgetSlot[] = ['chat-top', 'above-composer', 'window-bottom']
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
  /** Public addresses the app loads for it and hands over as text. Only for a widget that is given no numbers. */
  fetch: FeedSpec[]
}

/** One address a widget wants loaded: any public https address, the same each time, so nothing the widget knows can be put into it. */
export interface FeedSpec {
  id: string
  url: string
  /** Seconds between loads. */
  every: number
}

/** What loading one address came to: text, or what went wrong. */
export interface FeedResult {
  ok: boolean
  status: number
  text: string
  at: number
  error?: string
}

export const MAX_FEEDS = 8
export const MAX_FEEDS_PER_WIDGET = 4

/** The host of an address, as the bar that asks to load it names it. */
export const feedHost = (url: string): string => {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return '?'
  }
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/
/** Why an address may not be a feed, or null. This is only the shape; the app also checks where the name leads each time it loads (see the main process). */
export function feedProblem(url: unknown): string | null {
  if (typeof url !== 'string' || url.length === 0 || url.length > 500) return 'url must be text, up to 500 characters.'
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return 'url is not an address.'
  }
  if (u.protocol !== 'https:') return 'url must be https.'
  if (u.username || u.password) return 'url must not hold a login or key.'
  if (u.port) return 'url must use the standard https port.'
  const h = u.hostname.toLowerCase()
  if (h.startsWith('[') || IPV4.test(h) || !h.includes('.') || h === 'localhost' || /\.(local|localhost|internal|lan|home|corp|intranet)$/.test(h)) return 'url must name a public site, not a number, a local or an internal name.'
  return null
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
    const rawFeeds = o.fetch === undefined ? [] : o.fetch
    if (!Array.isArray(rawFeeds) || rawFeeds.length > MAX_FEEDS_PER_WIDGET) return void problems.push(`${at}: fetch must be a list of at most ${MAX_FEEDS_PER_WIDGET}.`)
    const feeds: FeedSpec[] = []
    for (const [j, f] of rawFeeds.entries()) {
      const fo = (f && typeof f === 'object' ? f : {}) as Record<string, unknown>
      const fid = fo.id
      if (typeof fid !== 'string' || !/^[a-z][a-z0-9-]{0,19}$/.test(fid)) return void problems.push(`${at}: fetch ${j + 1}: id must be 1 to 20 characters of a-z, 0-9 and -, starting with a letter.`)
      if (feeds.some((x) => x.id === fid)) return void problems.push(`${at}: fetch id ${fid} is used twice.`)
      const bad = feedProblem(fo.url)
      if (bad) return void problems.push(`${at}: fetch ${fid}: ${bad}`)
      const every = fo.every === undefined ? 60 : fo.every
      if (typeof every !== 'number' || !Number.isInteger(every) || every < 15 || every > 3600) return void problems.push(`${at}: fetch ${fid}: every must be a whole number of seconds from 15 to 3600.`)
      feeds.push({ id: fid, url: fo.url as string, every })
    }
    if (feeds.length > 0 && meters.length > 0) return void problems.push(`${at}: a widget gets the app's numbers or loads data, never both (the numbers could leave in an address).`)
    if (widgets.length >= MAX_WIDGETS) return
    if (widgets.reduce((n, w) => n + w.fetch.length, 0) + feeds.length > MAX_FEEDS) return void problems.push(`${at}: at most ${MAX_FEEDS} fetches over all widgets.`)
    widgets.push({ id, slot: o.slot as WidgetSlot, height, html: o.html, meters: [...new Set(meters as MeterName[])], fetch: feeds })
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
