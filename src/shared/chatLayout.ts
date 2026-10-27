// POC: how a chat is laid out, as rules the person (or an agent they asked, through a box they answer) writes. The conversation's rows are never changed; this only rearranges them for drawing, and no rules is the chat as it always was.

/** In the chat as now, folded to a count where it was, gathered under the reply, or not drawn. */
export type Place = 'stream' | 'badge' | 'footer' | 'hidden'
export const PLACES: Place[] = ['stream', 'badge', 'footer', 'hidden']

/** What a rule looks for in a row; every part it names must hold. */
export interface Match {
  /** Any of these kinds of row: tool, thinking, assistant, hook, event, note, image, shell, command, report, delegation, handoff. */
  kind?: string[]
  /** Any of these tool names; * stands for any run of characters ("mcp__*"). */
  tool?: string[]
  /** Words anywhere in the row (any case), or /pattern/ for a regular expression. */
  text?: string
  /** Only rows that went wrong. */
  tone?: 'bad'
}

export interface Rule {
  match: Match
  place: Place
  /** Rows of rules with the same group share one pack, however different they are. */
  group?: string
  /** What the pack says; the kind of row when empty. */
  label?: string
  icon?: string
  /** The pack starts open. */
  open?: boolean
}

export interface ChatLayout {
  rules: Rule[]
}
export const DEFAULT_LAYOUT: ChatLayout = { rules: [] }
export const MAX_RULES = 30
export const isDefault = (l: ChatLayout) => l.rules.length === 0

/** What a row is, as far as rules can tell. */
export interface Desc {
  kind: string
  tools: string[]
  text: string
  bad: boolean
}

const glob = (g: string) => new RegExp(`^${g.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i')

function words(text: string, hay: string): boolean {
  const re = /^\/(.+)\/([a-z]*)$/.exec(text)
  if (!re) return hay.toLowerCase().includes(text.toLowerCase())
  try {
    return new RegExp(re[1]!, re[2]!.includes('i') ? re[2] : re[2]! + 'i').test(hay)
  } catch {
    return false
  }
}

export function matches(m: Match, d: Desc): boolean {
  if (m.kind && !m.kind.includes(d.kind)) return false
  if (m.tool && !m.tool.some((g) => d.tools.some((t) => glob(g).test(t)))) return false
  if (m.text && !words(m.text, d.text)) return false
  if (m.tone === 'bad' && !d.bad) return false
  return true
}

const strs = (v: unknown, max: number): string[] | undefined => {
  const list = (Array.isArray(v) ? v : typeof v === 'string' ? [v] : []).filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim().slice(0, 60)).slice(0, 20)
  return list.length ? list : undefined
}
const short = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined)

/** A layout someone wrote, read back: what is understood is kept, what is not is left out and named, and nothing throws. */
export function checkLayout(raw: unknown): { layout: ChatLayout; problems: string[] } {
  let v: unknown = raw
  if (typeof raw === 'string') {
    try {
      v = JSON.parse(raw)
    } catch {
      return { layout: { rules: [] }, problems: ['Not valid JSON.'] }
    }
  }
  const list = (v && typeof v === 'object' ? (v as { rules?: unknown }).rules : undefined) as unknown
  if (v == null) return { layout: { rules: [] }, problems: [] }
  if (!Array.isArray(list)) return { layout: { rules: [] }, problems: ['Expected {"rules": [...]}.'] }
  const rules: Rule[] = []
  const problems: string[] = []
  list.forEach((x, i) => {
    const o = (x && typeof x === 'object' ? x : null) as Record<string, unknown> | null
    if (!o || !PLACES.includes(o.place as Place)) return void problems.push(`Rule ${i + 1}: "place" must be one of ${PLACES.join(', ')}.`)
    if (rules.length >= MAX_RULES) return
    const m = (o.match && typeof o.match === 'object' ? o.match : {}) as Record<string, unknown>
    const match: Match = {}
    const kind = strs(m.kind, 60)
    const tool = strs(m.tool, 60)
    const text = short(m.text, 200)
    if (kind) match.kind = kind
    if (tool) match.tool = tool
    if (text) match.text = text
    if (m.tone === 'bad') match.tone = 'bad'
    const rule: Rule = { match, place: o.place as Place }
    const group = short(o.group, 40)
    const label = short(o.label, 40)
    const icon = short(o.icon, 8)
    if (group) rule.group = group
    if (label) rule.label = label
    if (icon) rule.icon = icon
    if (o.open === true) rule.open = true
    rules.push(rule)
  })
  return { layout: { rules }, problems }
}

/** Several rows drawn as one: a chip with its count that opens to the rows. */
export interface Pack<T> {
  kind: 'pack'
  id: string
  place: 'badge' | 'footer'
  label: string
  icon: string
  open: boolean
  items: T[]
}

const ICON: Record<string, string> = { tool: '⚙', thinking: '…', hook: '⚑', event: '◉', assistant: '¶', note: '•' }
const NOUN: Record<string, string> = { tool: 'tool calls', thinking: 'thoughts', hook: 'hooks', event: 'events', assistant: 'replies', note: 'notes' }

function look(rule: Rule): { label: string; icon: string } {
  const k = rule.match.kind?.length === 1 ? rule.match.kind[0]! : ''
  return { label: rule.label ?? rule.group ?? NOUN[k] ?? (k ? `${k}s` : 'items'), icon: rule.icon ?? ICON[k] ?? '•' }
}

/**
 * The rows as the layout wants them drawn. A turn is your message and what the agent did until your next one. The first rule that matches a row decides.
 * `badge` folds each unbroken run of one group into a pack where the run was; `footer` gathers a group's rows from the whole turn into one pack under the turn's last row; `hidden` drops them.
 * Your own messages are never moved.
 */
export function arrange<T extends { kind: string; id: string }>(list: T[], layout: ChatLayout, describe: (t: T) => Desc): (T | Pack<T>)[] {
  if (isDefault(layout)) return list
  const out: (T | Pack<T>)[] = []
  let body: (T | Pack<T>)[] = []
  let foot = new Map<string, Pack<T>>()
  let run: { key: string; pack: Pack<T> } | null = null
  const flush = () => {
    out.push(...body, ...foot.values())
    body = []
    foot = new Map()
    run = null
  }
  for (const t of list) {
    if (t.kind === 'user') {
      flush()
      body.push(t)
      continue
    }
    const d = describe(t)
    const at = layout.rules.findIndex((r) => matches(r.match, d))
    const rule = at < 0 ? null : layout.rules[at]!
    if (!rule || rule.place === 'stream') {
      run = null
      body.push(t)
      continue
    }
    if (rule.place === 'hidden') continue
    const key = rule.group ?? `rule${at}`
    const make = (): Pack<T> => ({ kind: 'pack', id: `pack:${key}:${t.id}`, place: rule.place as 'badge' | 'footer', open: !!rule.open, ...look(rule), items: [t] })
    if (rule.place === 'badge') {
      if (run && run.key === key) run.pack.items.push(t)
      else {
        run = { key, pack: make() }
        body.push(run.pack)
      }
    } else {
      const p = foot.get(key)
      if (p) p.items.push(t)
      else foot.set(key, make())
    }
  }
  flush()
  return out
}
