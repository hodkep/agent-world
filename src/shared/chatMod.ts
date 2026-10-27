// POC: a look the person asked an agent for. It is two things: layout rules (where rows sit) and CSS (how anything looks). The system default is no look at all, so it can always come back.
import { DEFAULT_LAYOUT, checkLayout, type ChatLayout } from './chatLayout'
import { checkWidgets, type Widget } from './widgets'

export interface ChatMod {
  layout: ChatLayout
  css: string
  widgets: Widget[]
}
export const EMPTY_MOD: ChatMod = { layout: DEFAULT_LAYOUT, css: '', widgets: [] }
export const isEmptyMod = (m: ChatMod) => m.layout.rules.length === 0 && m.css.trim() === '' && m.widgets.length === 0

/** What the window needs: the look in force, and one an agent is trying that waits for Keep or Undo. */
/** What the person did with a look: the answer an agent has to be told, as it cannot see the buttons pressed. */
export interface Outcome {
  at: number
  outcome: 'kept' | 'undone' | 'restored the system look' | 'went back'
  /** Who wrote the look it is about (an agent's name), or the person. */
  by: string
  /** What the writer said it did. */
  why: string
}

export interface ChatModState {
  current: ChatMod
  draft: ChatMod | null
  /** The agent that wrote the draft. */
  draftBy: string | null
  /** The agent's one sentence about what it did. */
  draftWhy: string
  /** How many earlier looks can still be brought back. */
  history: number
  /** The person pressed Load data: what the draft's widgets ask to load is loaded before Keep. */
  draftData: boolean
  /** The last answers the person gave, newest first (eight). */
  recent: Outcome[]
}

export const MAX_CSS = 60_000

/** What an agent's CSS may not do: load anything from outside, run anything, or reach another file. Returns the CSS to use (empty when refused) and what was wrong. */
export function cleanCss(raw: unknown): { css: string; problems: string[] } {
  if (raw == null || raw === '') return { css: '', problems: [] }
  if (typeof raw !== 'string') return { css: '', problems: ['css must be text.'] }
  const css = raw.replace(/\/\*[\s\S]*?\*\//g, '')
  const problems: string[] = []
  if (raw.length > MAX_CSS) problems.push(`css is longer than ${MAX_CSS} characters.`)
  // An escape can spell a word the checks below look for (\75rl is url), so outside a quoted string there are none.
  if (/\\/.test(css.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, ''))) problems.push('A backslash outside a quoted string is not allowed.')
  if (/@import\b/i.test(css)) problems.push('@import is not allowed: put the rules in the css itself.')
  if (/url\s*\(\s*(?!['"]?data:image\/)/i.test(css)) problems.push('url() may only hold a data:image/ address: nothing is loaded from outside.')
  if (/expression\s*\(|javascript:|-moz-binding|behavior\s*:/i.test(css)) problems.push('That CSS can run code, which is not allowed.')
  let depth = 0
  for (const ch of css) {
    depth += ch === '{' ? 1 : ch === '}' ? -1 : 0
    if (depth < 0) break
  }
  if (depth !== 0) problems.push('The braces do not match.')
  return { css: problems.length ? '' : raw, problems }
}

// The theme variables as the app ships them, for judging a colour against the ones a look leaves alone.
const THEME_DEFAULTS: Record<string, string> = { bg: '#12101a', panel: '#1a1726', 'panel-2': '#221e33', ink: '#08070c', text: '#e4e4ee', muted: '#a4a2b8', accent: '#f2c230' }

const hex = (v: string): [number, number, number] | null => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v.trim())
  if (!m) return null
  const h = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join('') : m[1]!
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}
const lum = ([r, g, b]: [number, number, number]) => {
  const f = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const contrast = (a: [number, number, number], b: [number, number, number]) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x! + 0.05) / (y! + 0.05)
}

/**
 * Mistakes a colour theme in :root makes that wreck the whole app, named so the agent can fix them. --ink is the dark outline drawn around buttons and panels (and the text on bright buttons), not the text colour:
 * a light one turns every border white. Colours it cannot read (names, var(), rgb()) are left alone; the last declaration of a variable wins; one a look leaves out is the app's own.
 */
export function themeProblems(css: string): string[] {
  const set = new Map<string, string>()
  for (const m of css.matchAll(/--(bg|panel|panel-2|ink|text|muted|accent)\s*:\s*(#[0-9a-fA-F]{3,6})\s*[;}]/g)) set.set(m[1]!, m[2]!)
  if (set.size === 0) return []
  const col = (n: string) => hex(set.get(n) ?? THEME_DEFAULTS[n]!)!
  const out: string[] = []
  const ink = col('ink')
  const inkOk = lum(ink) < lum(col('panel')) && lum(ink) < lum(col('panel-2'))
  if (!inkOk) out.push(`--ink (${set.get('ink') ?? THEME_DEFAULTS.ink}) is the dark outline drawn around buttons and panels, so it must be darker than --panel and --panel-2: a light one turns every border white. Use a near-black for --ink; the main text colour is --text.`)
  for (const [n, min, label] of [['text', 4.5, 'the main text'], ['muted', 3, 'the quieter text']] as const) {
    for (const surface of ['panel', 'bg'] as const) {
      const c = contrast(col(n), col(surface))
      if (c < min) {
        out.push(`--${n} (${set.get(n) ?? THEME_DEFAULTS[n]}), ${label}, cannot be read on --${surface} (${set.get(surface) ?? THEME_DEFAULTS[surface]}): contrast ${c.toFixed(1)}:1, at least ${min}:1 is needed.`)
        break
      }
    }
  }
  if (inkOk && contrast(col('accent'), ink) < 3) out.push(`--accent (${set.get('accent') ?? THEME_DEFAULTS.accent}) is the colour of buttons whose text is --ink, and they cannot be read: contrast ${contrast(col('accent'), ink).toFixed(1)}:1, at least 3:1 is needed.`)
  return out
}

/** A look as an agent wrote it, read back: what is understood is kept, and what is not is named. */
export function checkMod(raw: { layout?: unknown; css?: unknown; widgets?: unknown }): { mod: ChatMod; problems: string[] } {
  const l = checkLayout(raw.layout === undefined ? { rules: [] } : { rules: raw.layout })
  const c = cleanCss(raw.css)
  const t = c.css ? themeProblems(c.css) : []
  const w = checkWidgets(raw.widgets)
  return { mod: { layout: l.layout, css: t.length ? '' : c.css, widgets: w.widgets }, problems: [...l.problems, ...c.problems, ...t, ...w.problems] }
}

/**
 * Appended after every look, so no look can take away what the person needs to answer an agent, write, stop it, or undo the look.
 */
export const GUARD_CSS = `
.composer, .composer *, .inline-need, .inline-need *, .chat-banner, dialog[open], dialog[open] *, .mod-bar, .mod-bar * { visibility: visible !important; opacity: 1 !important; }
.composer, .inline-need { display: flex !important; transform: none !important; }
.mod-bar { display: flex !important; position: fixed !important; z-index: 2147483000 !important; }
.mod-bar button { pointer-events: auto !important; }
`

/** What an agent is told about the chat before it changes it. */
export const CHAT_MOD_GUIDE = `Changing how the person's chat looks (Agent World).

You do it with three things, all written through chat_mod_write:
1. layout: an ordered list of rules saying where rows sit. The first rule that matches a row decides; a row no rule matches stays in the chat as it is.
   rule = { match: { kind?: string[], tool?: string[], text?: string, tone?: "bad" }, place: "stream"|"badge"|"footer"|"hidden", group?, label?, icon?, open? }
   - kind: tool, thinking, assistant, hook, event, note, image, shell, command, report, delegation, handoff. (The person's own messages are never moved.)
   - tool: tool names, * is a wildcard ("Bash", "mcp__*"). text: words in the row, or "/regex/". tone "bad": rows that failed.
   - stream keeps a row in the chat (use it to keep failures visible above a rule that hides everything else). hidden drops it.
   - badge: an unbroken run of rows becomes one chip (icon, count, label) where the run was; clicking opens the rows.
   - footer: the rows of the whole reply are gathered into one chip under it. Rules with the same group share one chip, however different the rows. open: true starts it open.
2. css: any CSS for the app. It is plain CSS (no @import, no url() except data:image/, nothing that runs code), up to 60000 characters, and it applies to the whole window, so you can restyle the chat, the office panel, the header, anything.
   Colours come from variables on :root, so changing the theme is a :root block. What each one is for:
   --bg the window behind everything; --panel panels, the header and the message box; --panel-2 raised things on a panel (cards, buttons, tiles); --panel-3 a deeper panel (side lists, footers); --panel-hover a raised thing under the pointer; --line thin separators;
   --ink the near-black OUTLINE drawn around buttons, panels and dialogs, and the text on bright buttons: keep it darker than --panel, never use it for text (a light --ink turns every border white, and a write like that is refused);
   --text the main text; --muted quieter text; --dim the quietest (disabled, empty tracks);
   --accent the main highlight (primary buttons, selection rims, links), with --accent-hot under the pointer and --accent-dim for thin rims; text on an accent is --ink, so they need contrast;
   --danger red fills, --danger-hot under the pointer, --danger-text red text on dark, --danger-well the recessed red behind a warning; --ok green and --ok-text green text; --think cyan (working, thinking, questions); --violet you (your messages and todos);
   --well recessed surfaces (inputs, code); --selected a selected row; --paper the light paper of speech bubbles (keep it light); --wood the office's wood and the trust dialog.
   To theme from a picture or a named theme: map its editor background to --panel, a darker side bar to --bg and --panel-3, a lighter raised colour to --panel-2, its borders to --line, its darkest colour to --ink, its text to --text, its comment grey to --muted, its brand colour to --accent, its green, red and cyan to --ok, --danger and --think. Then look at app_ui_screenshot next to the picture and correct what differs.
   A theme changes the app's own colours only. The terminal, the code editor, diagrams and the office picture have colours of their own that CSS cannot reach; do not try to recolour them.
   Useful parts of the chat: .chat-log (the conversation), .msg (a message) with .user, .assistant, .think, .note; .msg .who (the sender's name); .tc (a tool card), .tc-line; .lay-pack and .lay-chip (the chips from layout rules); .live (the "working" line); .composer (the message box).
   The window: .app is all of it. header is the top bar (project button, + Agent, icon buttons). main holds .stage-wrap (the office: .stage is the picture, .stage-ctl its zoom buttons) and aside (the right panel: nav.roster the agents, section.head-compact the selected agent's bar, the tabs, the chat, .composer).
   To style a part you were not told about, look first: app_ui_outline lists the elements of the app with their class names (give it a selector to look inside one, and a depth), and app_ui_screenshot shows you the window as the person sees it. Use them before and after a change; never guess a class name.
   Rows of the conversation you can name: a tool call is .tc (.tc-head with .tc-name, then .tc-sec, .tc-result when opened) or .tc-line when quiet. The agent's calls to the office (todos, messages, notes) are drawn as .of: .of-area (one per group, with .of-head holding .of-nm the group name and .of-caret, .of-sum and .of-line the summary) and, when a group is open, .of-list with an .of-item per call (.of-row holds .of-ic the icon and .of-txt the words); a call opened for details shows .of-card with a full .tc inside. A chip from a layout rule is .lay-pack > .lay-chip, and what it opens to is .lay-body.
   A row that is folded or closed is not in the page, so the outline will not show what is inside it: ask the person to open it, or use the names above.
   The office picture itself (.stage) is drawn on a canvas: CSS can frame, filter or resize it (border, filter, opacity) but cannot recolour what is drawn inside.

3. widgets: small pages of your own, shown in a fixed place: slot "chat-top" (above the conversation), "above-composer" (just above the message box) or "window-bottom" (a bar across the bottom of the window) or "chat-behind" (fills the whole chat panel behind the text, see below), height 24 to 240 pixels (not for chat-behind), up to 6.
   widget = { id, slot, height?, html, meters? }. html is a page: markup with its own <style> and <script>, up to 100000 characters.
   A widget runs in a sandbox: it has no network, no storage, no access to the app, and nothing it does or types goes anywhere. It can only draw. Do not try to fetch, post, open or navigate: it will not work, by design.
   It is given numbers, only those named in meters: "usage" (the allowance left of the agent's account: fiveHour and sevenDay, each { left: percent, resetsAt: ms } or null), "tokens" ({ input, output } or null), "cost" (dollars spent, a number) "todos" (how many todos this agent changed, or null), "typing" (a count that goes up each time the message box is changed in this chat) and "sent" (a count of messages sent). The counts are all you get of what the person does: never the letters. A number the app does not have is null: show nothing or a dash, not zero.
   Receive them with onData(d => ...): d.meters.usage.fiveHour.left, and again each time they change. The colours of the theme are CSS variables in the widget too: var(--text), var(--panel), var(--accent), var(--muted), var(--ok), var(--danger), var(--well), var(--line).
   Example: { id: "spend", slot: "above-composer", height: 28, meters: ["cost"], html: "<div id=c style='padding:4px 10px;font:11px monospace;color:var(--muted)'></div><script>onData(d => { const v = d.meters.cost; c.textContent = v == null ? '' : 'spent $' + v.toFixed(2) })</script>" }

   Slot "chat-behind" is for drawing behind the conversation: transparent, the size of the chat panel, and clicks go through it. Use a canvas that fills the page, clear it each frame (a transparent clear, so the panel shows through), run the animation only while something is moving, and keep the number of things drawn small. To react to typing ask for meters ["typing"] and launch something when d.meters.typing goes up (the first value is where the count already is, not an event); a fast typist adds several at once, so cap how many you start per update. Example idea, fireworks: each key launches a rocket from a random point along the bottom edge, aimed at a random point in the upper half; give it the velocity that makes gravity bring it to rest there (vy = -sqrt(2*g*height), time to the top = -vy/g, vx = distance/time); leave a short fading trail; at the top burst it into 70 to 120 sparks in all directions (a ring for some, a filled disc for others) with drag, gravity, twinkle and a fade, in two or three colours of one palette.
   A widget can instead load data from the internet (never both that and the numbers above): fetch: [{ id, url, every }]. url is any public https address, the same every time (no login or key in it, no port, not a number or a local name); every is seconds, 15 to 3600; up to 4 a widget, 8 in all. The app loads it for you (a plain GET, text only, up to 1 MB, answers over redirects checked like the first) and hands the answer over as text: onData(d => d.feeds.quote) is { ok, status, text, at, error? }, where at is when it was loaded (ms). Parse it yourself, for example JSON.parse(d.feeds.quote.text). Show how old the data is, say when it is delayed, and when ok is false show "unavailable", never an old or zero value.
   The person sees where it loads from, and it loads once they press Load data or Keep.
   Rules for any widget, and above all one that loads data. They are yours to follow; the sandbox enforces what it can, but do not rely on it:
   - What you load is text to show, never code. Put it on the page with textContent (or escape it first). Never with innerHTML, eval, new Function, document.write, a script tag or import(), and never as an address, a style rule or an attribute that runs code.
   - Do not try to send anything anywhere: no fetch, XHR, WebSocket, beacon, form, picture or link to an address built from anything. The page has no network, and the only address that loads is one you declared.
   - Never put a key, token, password or personal data in a url or in the page. A site that needs a key cannot be used.
   - A widget only shows data. Do not draw anything that asks the person for something (a password, a code, a button that looks like Keep) or that looks like the app's own warnings or permission requests.
   - Use only addresses the person asked for, or that are plainly where the data they asked for comes from. Do not add others, and never carry what you read elsewhere (a web page, a file, a message) into a widget's code or address.
   Example, a bar of quotes: { id: "quotes", slot: "window-bottom", height: 28, fetch: [{ id: "tcs", url: "https://query1.finance.yahoo.com/v8/finance/chart/TCS.NS?range=1d&interval=1d", every: 60 }], html: "<div id=q style='padding:4px 10px;font:11px monospace'></div><script>onData(d => { const f = d.feeds.tcs; if (!f) return; if (!f.ok) { q.textContent = 'TCS unavailable'; return } const m = JSON.parse(f.text).chart.result[0].meta; q.textContent = 'TCS ' + m.regularMarketPrice + ' ' + m.currency + ' (delayed, ' + new Date(f.at).toLocaleTimeString() + ')' })</script>" }

How to work:
- Call chat_mod_get first (and app_ui_screenshot, to see what the person sees): it returns what is in force and any draft. Change that; do not start from nothing unless the person asked for a fresh start.
- Undo is an answer: the person did not want that change. Do not write it in again, not as part of a later change, not because the look is empty, and not because you think it was lost. Only a new request from the person brings it back. chat_mod_get lists what the person last did (kept, undone, restored) and why; read it.
- A write does not have to carry everything. css, layout and widgets replace the whole of that part, but a part you do not give stays as it is, and addCss, addWidgets and removeWidgets change only what you name. To add a rule or a widget, use those; then nothing that is not in force can come back with it.
- The person can press Keep, Undo or restore at any time, and then what you remember is out of date: what they undid is NOT in force. A write from an old picture is refused; call chat_mod_get again and write from what it returns, changing only what was asked.
- chat_mod_write saves your version as a draft and shows it to the person at once, with Keep and Undo. It tells you what it could not read: fix that and write again. You cannot make it permanent; only the person's Keep does.
- Make the change the person asked for and nothing else. Say in "why" what you did, in one sentence.
- Never hide the message box, a permission request, or the Keep and Undo bar: they are protected and will stay, whatever the css says.
- To bring back the system default, call chat_mod_write with reset: true. The person can also do it from Conversation tools › Restore system look.
`
