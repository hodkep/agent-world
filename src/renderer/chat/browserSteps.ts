import { shortUrl } from './mcp'

/**
 * Words for an agent's browser commands (agent-browser, run in its shell), so a run of them reads as steps, not as a block of command lines.
 * Pure: the command line goes in, a sentence per call comes out; a control named only by @ref is named from the page snapshot printed earlier.
 */
export interface BrowserCall {
  cmd: string
  args: string[]
}
export interface BrowserLine {
  kind: 'go' | 'see' | 'act' | 'wait' | 'size' | 'shot' | 'err'
  verb: string
  target?: string
  detail?: string
  /** An address the card can link to. */
  link?: string
  /** A file the step wrote (a screenshot), as the command named it. */
  file?: string
}

/** Options that carry a value of their own: the value is not an argument. */
const WITH_VALUE = new Set(['--session', '--cdp', '--profile', '--state', '--config', '--session-name', '--download-path', '--user-agent', '--screenshot-format', '--screenshot-quality', '--color-scheme', '--headed', '--restore'])
const clip = (t: string, n = 70) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t)

/** The words of a command line as a shell sees them: quotes and escapes resolved, and the operators that end a command (&& || ; | newline) split apart. */
function segments(command: string): string[][] {
  const out: string[][] = []
  let cur: string[] = []
  let tok = ''
  let has = false
  let q = ''
  const push = () => (has && cur.push(tok), (tok = ''), (has = false))
  const end = () => (push(), cur.length && out.push(cur), (cur = []))
  for (let i = 0; i < command.length; i++) {
    const c = command[i]!
    if (q) {
      if (c === q) q = ''
      else if (c === '\\' && q === '"' && i + 1 < command.length) tok += command[++i]
      else tok += c
      continue
    }
    if (c === '"' || c === "'") ((q = c), (has = true))
    else if (c === '\\' && i + 1 < command.length) ((tok += command[++i]), (has = true))
    else if (c === '\n' || c === ';') end()
    else if (/\s/.test(c)) push()
    else if ((c === '&' && command[i + 1] === '&') || (c === '|' && command[i + 1] === '|')) (end(), i++)
    else if (c === '|') end()
    else ((tok += c), (has = true))
  }
  end()
  return out
}

/** Redirections are not arguments: `2>/dev/null`, `> file`, `2>&1`. */
function withoutRedirects(tokens: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!
    if (/^(\d*>>?|&>)$/.test(t)) i++
    else if (!/^(\d*>>?|&>)/.test(t)) out.push(t)
  }
  return out
}

const TOOL = /^(.*\/)?agent-browser(@[\w.-]+)?$/

/** Every call to the browser tool in a command line. */
export function browserCalls(command: string): BrowserCall[] {
  const alias = new Map<string, string[]>()
  const calls: BrowserCall[] = []
  for (const seg of segments(command)) {
    let t = withoutRedirects(seg)
    // NAME="npx -y agent-browser@x": a name for the tool, used as $NAME below.
    const as = t.length === 1 ? /^([A-Za-z_]\w*)=(.+)$/s.exec(t[0]!) : null
    if (as) {
      alias.set(as[1]!, segments(as[2]!)[0] ?? [])
      continue
    }
    // NAME(){ npx -y agent-browser@x "$@"; }: a function that wraps the tool, called as NAME later.
    const fn = /^(\w+)\(\)\{?$/.exec(t[0] ?? '')
    if (fn) {
      const body = t.slice(1).filter((x) => x !== '{' && x !== '$@' && x !== '$*')
      alias.set(fn[1]!, body)
      continue
    }
    t = t.flatMap((x, i) => alias.get(/^\$\{?(\w+)\}?$/.exec(x)?.[1] ?? (i === 0 ? x : '')) ?? [x])
    while (t.length && /^[A-Za-z_]\w*=/.test(t[0]!)) t.shift()
    if (t[0] === 'npx') {
      t.shift()
      while (t[0]?.startsWith('-')) t.shift()
    }
    if (!t[0] || !TOOL.test(t[0])) continue
    const rest = t.slice(1)
    const args: string[] = []
    let cmd = ''
    for (let i = 0; i < rest.length; i++) {
      const a = rest[i]!
      if (a.startsWith('-') && (!cmd || cmd !== 'wait')) {
        if (WITH_VALUE.has(a) && !a.includes('=')) i++
        continue
      }
      cmd ? args.push(a) : (cmd = a)
    }
    if (cmd) calls.push({ cmd, args: cmd === 'wait' ? rest.slice(rest.indexOf('wait') + 1) : args })
  }
  return calls
}

export const isBrowserCommand = (command: string) => browserCalls(command).length > 0

/** Each control the page snapshot lists, by its @ref: `- button "Sign in" [ref=e2]` is e2: Sign in. A control with no name is its kind. */
export function refNames(snapshot: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of snapshot.split('\n')) {
    const m = /^\s*-\s+(\S+)(?:\s+"((?:[^"\\]|\\.)*)")?.*?\bref=(e\d+)/.exec(line)
    if (m) out[m[3]!] = m[2] ?? m[1]!
  }
  return out
}

const quote = (s: string) => `“${clip(s, 60)}”`
const isRef = (s: string) => /^@e\d+$/.test(s)
/** A control as the card names it: from the snapshot when it was given by @ref, otherwise as the agent wrote it. */
const named = (sel: string, refs: Record<string, string>) => (isRef(sel) ? (refs[sel.slice(1)] ? quote(refs[sel.slice(1)]!) : `element ${sel.slice(1)}`) : clip(sel))
const plain = (sel: string, refs: Record<string, string>) => (isRef(sel) ? (refs[sel.slice(1)] ?? `element ${sel.slice(1)}`) : sel)
const screen = (w: number) => (w < 600 ? 'phone' : w < 1024 ? 'tablet' : 'desktop')

export function describeCall(call: BrowserCall, refs: Record<string, string>, result?: string): BrowserLine {
  const a = call.args
  switch (call.cmd) {
    case 'open':
    case 'goto':
    case 'navigate': {
      const url = a[0] ?? ''
      return { kind: 'go', verb: 'Opened', target: /^https?:\/\//.test(url) ? shortUrl(url) : clip(url), ...(/^https?:\/\//.test(url) && { link: url }) }
    }
    case 'back':
      return { kind: 'go', verb: 'Went back' }
    case 'forward':
      return { kind: 'go', verb: 'Went forward' }
    case 'reload':
      return { kind: 'go', verb: 'Reloaded' }
    case 'snapshot': {
      const n = result ? (result.match(/\bref=e\d+/g) ?? []).length : 0
      return { kind: 'see', verb: 'Read the page', ...(n && { detail: `${n} ${n === 1 ? 'control' : 'controls'}` }) }
    }
    case 'click':
      return { kind: 'act', verb: 'Clicked', target: named(a[0] ?? '', refs) }
    case 'dblclick':
      return { kind: 'act', verb: 'Double-clicked', target: named(a[0] ?? '', refs) }
    case 'rightclick':
      return { kind: 'act', verb: 'Right-clicked', target: named(a[0] ?? '', refs) }
    case 'hover':
      return { kind: 'act', verb: 'Hovered over', target: named(a[0] ?? '', refs) }
    case 'focus':
      return { kind: 'act', verb: 'Focused', target: named(a[0] ?? '', refs) }
    case 'fill':
    case 'type': {
      const field = plain(a[0] ?? '', refs)
      const secret = /pass(word|code)?|secret|token|pin\b/i.test(field)
      const text = a.slice(1).join(' ')
      return { kind: 'act', verb: 'Typed', target: secret ? '••••••' : quote(text), detail: `in ${field}` }
    }
    case 'press':
      return { kind: 'act', verb: 'Pressed', target: a.join(' ') }
    case 'select':
      return { kind: 'act', verb: 'Chose', target: quote(a.slice(1).join(' ')), detail: `in ${plain(a[0] ?? '', refs)}` }
    case 'check':
      return { kind: 'act', verb: 'Ticked', target: named(a[0] ?? '', refs) }
    case 'uncheck':
      return { kind: 'act', verb: 'Unticked', target: named(a[0] ?? '', refs) }
    case 'scroll':
      return { kind: 'act', verb: `Scrolled ${/^(up|down|left|right)$/.test(a[0] ?? '') ? a[0] : 'down'}` }
    case 'scrollintoview':
      return { kind: 'act', verb: 'Scrolled to', target: named(a[0] ?? '', refs) }
    case 'drag':
      return { kind: 'act', verb: 'Dragged', target: named(a[0] ?? '', refs), detail: `to ${named(a[1] ?? '', refs)}` }
    case 'upload':
      return { kind: 'err', verb: 'Tried to upload a file', detail: 'not allowed here' }
    case 'download':
      return { kind: 'err', verb: 'Tried to download a file', detail: 'not allowed here' }
    case 'set': {
      if (a[0] === 'viewport') {
        const w = Number(a[1])
        const h = Number(a[2])
        return Number.isFinite(w) && Number.isFinite(h) ? { kind: 'size', verb: 'Resized to', target: `${w} × ${h}`, detail: screen(w) } : { kind: 'size', verb: 'Resized the page' }
      }
      if (a[0] === 'device') return { kind: 'size', verb: 'Resized to', target: a.slice(1).join(' ') }
      return { kind: 'see', verb: 'Changed a browser setting', target: a[0] ?? '' }
    }
    case 'screenshot': {
      const file = a.find((x) => /[/\\]|\.(png|jpe?g|webp)$/i.test(x))?.replace(/^\$\{?PWD\}?\//, '').replace(/^\.\//, '')
      return { kind: 'shot', verb: 'Took a screenshot', ...(file && { file }) }
    }
    case 'get': {
      if (a[0] === 'url') return { kind: 'see', verb: 'Read the address' }
      if (a[0] === 'title') return { kind: 'see', verb: 'Read the title' }
      return { kind: 'see', verb: 'Read', target: a[1] ? named(a[1], refs) : a.join(' ') }
    }
    case 'eval':
      return { kind: 'see', verb: 'Ran a script in the page' }
    case 'wait': {
      const flag = (n: string) => {
        const i = a.indexOf(n)
        return i >= 0 ? (a[i + 1] ?? '') : undefined
      }
      if (flag('--text') !== undefined) return { kind: 'wait', verb: 'Waited for', target: quote(flag('--text')!) }
      if (flag('--url') !== undefined) return { kind: 'wait', verb: 'Waited for the address', target: clip(flag('--url')!) }
      if (a.includes('--load')) return { kind: 'wait', verb: 'Waited for the page to load' }
      const ms = Number(a[0])
      if (Number.isFinite(ms)) return { kind: 'wait', verb: 'Waited', target: ms >= 1000 ? `${ms / 1000} s` : `${ms} ms` }
      return { kind: 'wait', verb: 'Waited for', target: named(a[0] ?? '', refs) }
    }
    case 'tab':
    case 'window':
      return { kind: 'see', verb: 'Looked at the tab' }
    case 'cookies':
      return { kind: 'see', verb: a[0] === 'set' ? 'Set a cookie' : a[0] === 'clear' ? 'Cleared the cookies' : 'Read the cookies' }
    case 'storage':
      return { kind: 'see', verb: 'Read the page’s storage' }
    case 'console':
    case 'errors':
      return { kind: 'see', verb: 'Read the console' }
    case 'close':
      return { kind: 'see', verb: 'Closed the browser' }
    default:
      return { kind: 'see', verb: `Ran agent-browser ${call.cmd}` }
  }
}
