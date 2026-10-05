import { stripVTControlCharacters } from 'node:util'
import type { GenericMenu, Menu, ScreenAdapter, TerminalIO, TrustPrompt } from '../ports'
import { answerMenu } from '../shared/menu'

const lines = (screen: string) => stripVTControlCharacters(screen).split('\n')
/** The last line with anything on it: where agy keeps its hints and its model. */
const footer = (screen: string) => lines(screen).map((l) => l.trim()).filter(Boolean).at(-1) ?? ''
const OPTION = /^\s*(>)?\s*(\d+)\.\s+(\S.*?)\s*$/

const RULE = /^[─━]{8,}$/
/** The only headings agy puts above the question; anything else above a rule is text, never a name the card may take. */
const HEADINGS = new Set(['Command', 'MCP'])
const FIRST_OPTION = /^>?\s*1\.\s/

/** Numbered answers with agy's hint and footer under them: some question is open and typing now would answer it, whatever it says. */
function questionOpen(screen: string): boolean {
  const shown = lines(screen).map((l) => l.trim()).filter(Boolean)
  if (!shown.at(-1)?.startsWith('esc to cancel') || !shown.at(-2)?.startsWith('↑/↓')) return false
  return shown.slice(0, -2).some((l) => FIRST_OPTION.test(l)) && /\?$/.test(shown[shown.findLastIndex((l) => FIRST_OPTION.test(l)) - 1] ?? '')
}

/**
 * The question agy asks before it acts ("Run this command?", "Allow calling this tool?"), with numbered answers under it. Only agy's
 * own question counts: it is the last thing on the screen (a hint line, then the footer) with a rule above what it is about. The same
 * words in something the model printed higher up are text, not a question, and must never become a card that can be allowed.
 */
function permission(screen: string): GenericMenu | null {
  const shown = lines(screen).map((l) => l.trim()).filter(Boolean)
  if (!shown.at(-1)?.startsWith('esc to cancel')) return null
  const hint = shown.length - 2
  if (!shown[hint]?.startsWith('↑/↓')) return null
  // The answers sit just above the hint; a long answer may wrap onto a line of its own.
  let first = hint
  while (first > 0 && !FIRST_OPTION.test(shown[first]!)) first--
  if (!FIRST_OPTION.test(shown[first] ?? '')) return null
  const options: string[] = []
  let highlighted = -1
  for (const l of shown.slice(first, hint)) {
    const m = OPTION.exec(l)
    if (!m) continue
    if (m[1]) highlighted = options.length
    options.push(m[3]!)
  }
  const ask = first - 1
  if (options.length < 2 || !/\?$/.test(shown[ask] ?? '')) return null
  let top = ask - 1
  while (top >= 0 && !RULE.test(shown[top]!)) top--
  // What the card says it is for must come from agy's own box: a known heading directly above the rule, and nothing in between that
  // imitates the box (a command that prints rules, headings or a second question could otherwise hide the part that matters).
  const body = shown.slice(top + 1, ask).filter((l, i) => !(i === 0 && l.startsWith('Requesting permission for:')))
  if (top < 1 || !HEADINGS.has(shown[top - 1]!) || body.some((l) => RULE.test(l) || HEADINGS.has(l) || l.startsWith('Requesting permission for:') || l.startsWith('●'))) return null
  return {
    title: shown[top - 1]!,
    context: body.join('\n'),
    options,
    highlighted: Math.max(highlighted, 0),
    hint: shown[hint]!
  }
}

function trustPrompt(screen: string): TrustPrompt | null {
  const all = lines(screen).map((l) => l.trim())
  if (!all.some((l) => /^Do you trust the contents of this project\?/.test(l))) return null
  const from = all.findIndex((l) => l === 'Accessing workspace:')
  const to = all.findIndex((l) => l.startsWith('Do you trust'))
  // A long folder name wraps onto the next line.
  const path = from >= 0 ? all.slice(from + 1, to).join('') : ''
  return { path, highlighted: all.some((l) => /^>\s*No\b/.test(l)) ? 'no' : 'yes' }
}

const anyMenu = (screen: string) => questionOpen(screen) || !!permission(screen) || !!trustPrompt(screen)
// While something is typed the footer drops "? for shortcuts" and keeps only the model, so idle means: not asking, not working, a prompt showing.
const working = (screen: string) => footer(screen).startsWith('esc to cancel')
const idle = (screen: string) => !anyMenu(screen) && !working(screen) && /·/.test(footer(screen)) && lines(screen).some((l) => /^>(\s|$)/.test(l))

/** "Yes, I trust this folder" is the first answer. */
const trustMenu: Menu = (screen) => {
  const p = trustPrompt(screen)
  return p ? { highlighted: p.highlighted === 'yes' ? 0 : 1 } : null
}

const SHIFT_TAB = '\x1b[Z'
const SETTLE_MS = 350
const MAX_PRESSES = 4

/** Shift+Tab cycles the autonomy levels; press until the footer names the wanted one. */
async function setMode(io: TerminalIO, want: string) {
  for (let i = 0; i <= MAX_PRESSES; i++) {
    const now = readMode(io.screen())
    if (now === want) return true
    if (now === null || i === MAX_PRESSES) return false
    io.write(SHIFT_TAB)
    await io.sleep(SETTLE_MS)
  }
  return false
}

/** The footer shows `accept-edits ·` or `plan ·` before the model; with neither, agy is asking before it acts. Unreadable while it works or asks. */
function readMode(screen: string): string | null {
  const f = footer(screen)
  if (anyMenu(screen) || working(screen) || !f.includes('·')) return null
  return /^(?:\? for shortcuts\s+)?(accept-edits|plan)\s+·/.exec(f)?.[1] ?? 'request-review'
}

export const agyScreen: ScreenAdapter = {
  trustPrompt,
  answerTrust: (io, trust) => answerMenu(io, trustMenu, trust ? 0 : 1),
  inputReady: idle,
  // A braille spinner ("⣷  Generating…") shows only while it works; the footer then reads "esc to cancel".
  looksWorking: (screen) => !anyMenu(screen) && working(screen) && lines(screen).some((l) => /^\s*[⠀-⣿]\s+\S/.test(l)),
  anyMenu,
  planMenu: () => null,
  genericMenu: permission,
  answerMenu,
  parseAsk: () => null,
  driveAnswers: async () => false,
  readMode,
  setMode,
  autoUnavailable: () => false,
  rewindList: () => null,
  openRewindList: async () => 'agy cannot rewind a conversation from here.',
  driveRewind: async () => false,
  btwOverlay: () => null
}
