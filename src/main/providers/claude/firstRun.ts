import { stripVTControlCharacters } from 'node:util'
import { inputBoxAfter } from './box'

export type FirstRunKind = 'theme' | 'apikey' | 'login' | 'oauth' | 'security'

export interface FirstRunScreen {
  kind: FirstRunKind
  title: string
  context: string
  options: string[]
  highlighted: number
  hint: string
  /** Whether Esc does anything on this screen: on the first questions of a new Claude Code it does not. */
  cancellable: boolean
  /** The screen takes typing or a browser, not a choice: it can only be finished in the terminal. */
  terminalOnly: boolean
}

const RULE = /^\s*[─▔━═╌]{8,}/
const OPTION_MARK = /^\s*(❯\s*)?(✔\s*)?/

/** One answer of a list drawn without numbers: the cursor `❯` and the tick `✔` are not part of its name. */
const label = (l: string) => l.replace(OPTION_MARK, '').trim()

/** The lines of a list that begins after the first blank line from `from`, up to the next blank line or rule, as options. */
function plainList(lines: string[], from: number): { options: string[]; highlighted: number } {
  let i = from
  while (i < lines.length && lines[i]!.trim()) i++
  while (i < lines.length && !lines[i]!.trim()) i++
  const options: string[] = []
  let highlighted = -1
  for (; i < lines.length && lines[i]!.trim() && !RULE.test(lines[i]!) && !/Enter to|Esc to/.test(lines[i]!); i++) {
    if (/^\s*❯/.test(lines[i]!)) highlighted = options.length
    options.push(label(lines[i]!))
  }
  return { options, highlighted: Math.max(highlighted, 0) }
}

const clean = (ls: string[]) => ls.map((l) => l.trim()).filter(Boolean)

/**
 * The questions a Claude Code asks the first time it runs in a config folder: the text style, an API key found in the environment, how to log in, the
 * page that waits for a code from the browser, and the security notes. None of them can be skipped, and Esc does nothing on most. Each counts only as
 * the last thing Claude drew: the same words in a conversation have its input box under them.
 */
export function firstRunScreen(screen: string): FirstRunScreen | null {
  const lines = stripVTControlCharacters(screen).split('\n')
  const find = (re: RegExp) => lines.findLastIndex((l) => re.test(l))
  const buried = (at: number) => inputBoxAfter(lines, at)

  const theme = find(/Choose the text style that looks best with your terminal/)
  if (theme >= 0 && !buried(theme)) {
    const { options, highlighted } = plainList(lines, theme)
    if (options.length >= 2) return { kind: 'theme', title: 'Choose the text style that looks best with your terminal', context: '', options, highlighted, hint: 'Enter to choose', cancellable: false, terminalOnly: false }
  }

  const key = find(/Detected a custom API key in your environment/)
  if (key >= 0 && !buried(key)) {
    const ask = lines.findIndex((l, i) => i > key && /Do you want to use this API key\?/.test(l))
    if (ask > key) {
      const { options, highlighted } = plainList(lines, ask)
      const hint = lines.slice(ask).map((l) => l.trim()).find((l) => /Enter to/.test(l)) ?? 'Enter to confirm · Esc to cancel'
      if (options.length >= 2) return { kind: 'apikey', title: 'Detected a custom API key in your environment', context: clean(lines.slice(key + 1, ask)).join('\n'), options, highlighted, hint, cancellable: true, terminalOnly: false }
    }
  }

  const login = find(/Select login method:/)
  if (login >= 0 && !buried(login)) {
    const run = lines.slice(login + 1).map((l) => /^\s*(❯\s*)?(\d+)\.\s+(\S.*?)\s*$/.exec(l)).filter((m): m is RegExpExecArray => !!m)
    if (run.length >= 2) {
      const above = clean(lines.slice(0, login)).filter((l) => !/^[.*░▓█▄\s]+$/.test(l) && !/^Welcome to Claude Code/.test(l))
      return { kind: 'login', title: 'Select login method', context: above.join(' '), options: run.map((m) => m[3]!), highlighted: Math.max(run.findIndex((m) => m[1]), 0), hint: 'Enter to select', cancellable: false, terminalOnly: false }
    }
  }

  const oauth = find(/Paste code here if prompted|Browser didn't open\? Use the url below to sign in/)
  if (oauth >= 0 && !buried(oauth)) {
    return {
      kind: 'oauth',
      title: 'Sign in to Claude Code',
      context: 'Claude Code opened a page in your browser to sign in; if it did not, it shows an address in the terminal. Finish there, and paste the code the page gives you into the terminal.',
      options: [],
      highlighted: 0,
      hint: '',
      cancellable: false,
      terminalOnly: true
    }
  }

  const notes = find(/Security notes:/)
  if (notes >= 0 && !buried(notes) && lines.slice(notes).some((l) => /Press Enter to continue/.test(l))) {
    const end = lines.findIndex((l, i) => i > notes && /Press Enter to continue/.test(l))
    return { kind: 'security', title: 'Security notes', context: clean(lines.slice(notes + 1, end)).join('\n'), options: ['Continue (Enter)'], highlighted: 0, hint: 'Press Enter to continue', cancellable: false, terminalOnly: false }
  }
  return null
}
