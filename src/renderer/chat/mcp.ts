/** Words for the calls an agent makes to MCP servers and for its tool lookups, so a card reads as a sentence, not a JSON block. */

const s = (v: unknown) => (typeof v === 'string' ? v : '')
const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t)

export function parseMcpName(name: string): { server: string; tool: string } | null {
  const m = /^mcp__(.+?)__(.+)$/.exec(name)
  return m ? { server: m[1]!, tool: m[2]! } : null
}

/** "browser_take_screenshot" -> "Take screenshot" (the common "browser_" prefix says nothing). */
export function humanize(tool: string): string {
  const w = tool.replace(/^(browser|mcp)_/, '').replace(/[_-]+/g, ' ').trim()
  return w ? w[0]!.toUpperCase() + w.slice(1) : tool
}

const TARGET_KEYS = ['url', 'query', 'sql', 'element', 'selector', 'ref', 'name', 'path', 'file_path', 'file', 'command', 'expression', 'code', 'text', 'key', 'message']

/** The one argument worth putting in the headline. */
export function mainArgument(input: Record<string, unknown>): string {
  for (const k of TARGET_KEYS) {
    const v = input[k]
    if (typeof v === 'string' && v.trim()) return v.trim().replace(/\s+/g, ' ')
  }
  const first = Object.values(input).find((v) => typeof v === 'string' && v.trim())
  return typeof first === 'string' ? first.trim().replace(/\s+/g, ' ') : ''
}

/** A web address as people say it: host and path, no scheme. */
export const shortUrl = (u: string) => {
  try {
    const x = new URL(u)
    return (x.host + (x.pathname === '/' ? '' : x.pathname) + x.search).slice(0, 80)
  } catch {
    return clip(u, 80)
  }
}

export interface Headline {
  verb: string
  target: string
  /** True when the target is a web address the card can link to. */
  link?: string
}

const VERBS: [RegExp, string][] = [
  [/(^|_)(navigate_back|go_back)$/, 'Went back'],
  [/(^|_)(navigate|goto|open_url|open)$/, 'Opened'],
  [/(^|_)(snapshot|read_page|get_page_text)$/, 'Read the page'],
  [/(^|_)(take_screenshot|screenshot)$/, 'Took a screenshot'],
  [/(^|_)(click|double_click|right_click)$/, 'Clicked'],
  [/(^|_)(type|fill|fill_form|form_input)$/, 'Typed into'],
  [/(^|_)hover$/, 'Hovered over'],
  [/(^|_)press_key$/, 'Pressed'],
  [/(^|_)select_option$/, 'Chose an option in'],
  [/(^|_)wait_for$/, 'Waited for'],
  [/(^|_)(evaluate|run_code|run_code_unsafe|javascript_tool)$/, 'Ran code in the page'],
  [/(^|_)console_messages$/, 'Read the console'],
  [/(^|_)network_requests$/, 'Read network requests'],
  [/(^|_)(tabs|tabs_context)$/, 'Looked at the tabs'],
  [/(^|_)resize(_window)?$/, 'Resized the window'],
  [/(^|_)close$/, 'Closed the browser'],
  [/(^|_)(execute_sql|run_sql|query)$/, 'Ran SQL'],
  [/(^|_)apply_migration$/, 'Applied a migration'],
  [/(^|_)deploy_edge_function$/, 'Deployed a function']
]

/** "Opened experts.snorkel-ai.com/home", "Ran SQL select …", or, for a tool nobody has taught us, "Take screenshot  <first argument>". */
export function mcpHeadline(tool: string, input: Record<string, unknown>): Headline {
  const target = mainArgument(input)
  for (const [re, verb] of VERBS) {
    if (!re.test(tool)) continue
    const isUrl = /^https?:\/\//.test(target)
    return { verb, target: isUrl ? shortUrl(target) : clip(target, 90), ...(isUrl && { link: target }) }
  }
  const listing = /^(list|get|search|find|read)_(.+)$/.exec(tool)
  if (listing) {
    const what = listing[2]!.replace(/_/g, ' ')
    const verb = { list: 'Listed', get: 'Got', search: 'Searched', find: 'Found', read: 'Read' }[listing[1] as 'list'] ?? 'Called'
    return { verb: `${verb} ${what}`, target: clip(target, 90) }
  }
  return { verb: humanize(tool), target: clip(target, 90) }
}

/** The arguments as label and value, in the order given; objects are shown as compact JSON. */
export function argRows(input: Record<string, unknown>): [string, string][] {
  return Object.entries(input)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)] as [string, string])
}

export interface ResultSection {
  title: string
  /** Text outside any code fence. */
  text: string
  code?: { lang: string; text: string }[]
}

/** A result that arrives as markdown (### headings, fenced code) split into parts a card can lay out. */
export function resultSections(text: string): ResultSection[] {
  const out: ResultSection[] = []
  let cur: ResultSection = { title: '', text: '' }
  let fence: { lang: string; lines: string[] } | null = null
  const push = () => {
    if (cur.title || cur.text.trim() || cur.code?.length) out.push({ ...cur, text: cur.text.trim() })
  }
  for (const line of text.split('\n')) {
    const f = /^```(\w*)\s*$/.exec(line)
    if (fence) {
      if (f) ((cur.code ??= []).push({ lang: fence.lang, text: fence.lines.join('\n') }), (fence = null))
      else fence.lines.push(line)
    } else if (f) fence = { lang: f[1] ?? '', lines: [] }
    else {
      const h = /^#{1,4}\s+(.*)$/.exec(line)
      if (h) (push(), (cur = { title: h[1]!.trim(), text: '' }))
      else cur.text += `${line}\n`
    }
  }
  if (fence) (cur.code ??= []).push({ lang: fence.lang, text: fence.lines.join('\n') })
  push()
  return out
}

/** A short note under the headline, taken from the result when it is easy to say (a page title, a row count). */
export function resultNote(tool: string, text: string): string {
  const lines = text ? text.split('\n').length : 0
  const title = /^-\s*Page Title:\s*(.+)$/m.exec(text)?.[1]?.trim()
  if (title) return title
  const rows = /^\[\s*\{/.test(text.trim()) ? (() => { try { return (JSON.parse(text.trim()) as unknown[]).length } catch { return 0 } })() : 0
  if (rows) return `${rows} row${rows === 1 ? '' : 's'}`
  void tool
  return lines > 1 ? `${lines} lines` : ''
}

export interface ToolRef {
  server: string
  tool: string
}

export type ToolLookup = { kind: 'load'; tools: ToolRef[] } | { kind: 'search'; query: string; found: number | null }

/** A ToolSearch call: `select:a,b` loads named tools, anything else is a keyword search. */
export function toolLookup(input: Record<string, unknown>, result?: string): ToolLookup {
  const q = s(input.query).trim()
  const sel = /^select:(.*)$/i.exec(q)
  if (sel) {
    const tools = sel[1]!
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean)
      .map((n) => parseMcpName(n) ?? { server: '', tool: n })
    return { kind: 'load', tools }
  }
  const found = result === undefined ? null : (result.match(/<function>/g) ?? []).length
  return { kind: 'search', query: q.replace(/^\+/, ''), found }
}
