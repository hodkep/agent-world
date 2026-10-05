import { stripVTControlCharacters } from 'node:util'
import type { GenericMenu, Menu, RewindList, ScreenAdapter, TerminalIO, TrustPrompt } from '../ports'
import { answerMenu } from '../shared/menu'

// Direction overrides and zero-width characters let text read differently from what it says; they are never part of what is shown or matched.
const INVISIBLE = /[\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g
const lines = (screen: string) => stripVTControlCharacters(screen).replace(INVISIBLE, '').split('\n')
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
  // A tool of a connected server is asked about by name only; what it is called with is on the call line above the box.
  const call = shown[top - 1] === 'MCP' && shown[top - 2]?.startsWith('●') ? shown[top - 2]!.replace(/^●\s*/, '').replace(/\s*\(ctrl\+o to expand\)$/, '') : ''
  return {
    title: shown[top - 1]!,
    context: [...body, call].filter(Boolean).join('\n'),
    options,
    highlighted: Math.max(highlighted, 0),
    hint: shown[hint]!
  }
}

/**
 * The trust question of a new folder. Like the permission question it counts only as agy drew it: the last thing on the screen, with its
 * two answers and the hint under it. The same words in text the model printed are not a question, and answering one would press Enter on
 * whatever is really there.
 */
function trustPrompt(screen: string): TrustPrompt | null {
  const all = lines(screen).map((l) => l.trim()).filter(Boolean)
  // agy may draw its model on a last line under the hint ("Gemini 3.8 Flash · low"); that line is its own, not part of any text.
  if (/^[^↑]*\s·\s(low|medium|high|xhigh|max)$/.test(all.at(-1) ?? '')) all.pop()
  if (!/^↑\/↓ Navigate · enter Confirm/.test(all.at(-1) ?? '')) return null
  const yes = all.at(-3) ?? ''
  const no = all.at(-2) ?? ''
  if (!/^>?\s*Yes, I trust this folder$/.test(yes) || !/^>?\s*No, exit$/.test(no)) return null
  const q = all.findLastIndex((l) => l.startsWith('Do you trust the contents of this project?'))
  if (q < all.length - 5 || q > all.length - 4) return null
  const from = all.slice(0, q).findLastIndex((l) => l === 'Accessing workspace:')
  if (from < 0) return null
  // A long folder name wraps onto the next line.
  return { path: all.slice(from + 1, q).join(''), highlighted: no.startsWith('>') ? 'no' : 'yes' }
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

const TIME = /^\((?:\d+\S*\s+ago|just now)\)$/
const UP = '\x1b[A'
const DOWN = '\x1b[B'
const MAX_MOVES = 80
const squash = (t: string) => t.replace(/\s+/g, ' ').trim()

/**
 * agy's /rewind panel: its earlier messages (each cut with "..." and followed by how long ago), then "(current)", with ">" on the one
 * chosen. Like the questions it counts only as agy drew it, as the last thing on the screen before the footer.
 */
function rewindList(screen: string): RewindList | null {
  const all = lines(screen).map((l) => l.trim()).filter(Boolean)
  if (!all.at(-2)?.startsWith('Keyboard:')) return null
  const head = all.findLastIndex((l) => l === 'Rewind Conversation')
  if (head < 0) return null
  const entries: RewindList['entries'] = []
  let highlighted = -1
  for (const l of all.slice(head + 1, -2)) {
    if (TIME.test(l)) continue
    if (l.startsWith('>')) highlighted = entries.length
    const text = l.replace(/^>\s*/, '')
    entries.push({ text, current: text === '(current)' })
  }
  return entries.length ? { entries, highlighted } : null
}

/** The words in the input box: what follows ">" between the two rules above the footer. */
function typedText(screen: string): string {
  const all = lines(screen)
  const rules = all.flatMap((l, i) => (RULE.test(l.trim()) ? [i] : []))
  for (let k = rules.length - 2; k >= 0; k--) {
    const body = all.slice(rules[k]! + 1, rules[k + 1]!)
    if (body[0]?.startsWith('>')) return body.map((l, i) => (i === 0 ? l.slice(1) : l)).map((l) => l.trim()).filter(Boolean).join('\n')
  }
  return ''
}

async function openRewindList(io: TerminalIO): Promise<string | null> {
  if (typedText(io.screen())) return 'Clear what is typed in the message box first.'
  io.write('/rewind')
  await io.sleep(500)
  io.write('\r')
  for (let i = 0; i < 20; i++) {
    await io.sleep(150)
    const l = rewindList(io.screen())
    if (l) return l.entries.length > 1 ? null : 'There is nothing to rewind to yet: agy can only go back to a message sent before this one.'
  }
  return 'agy did not open its rewind list.'
}

/** Walks the list to the message (it moves a step at a time and reads the screen after each) and presses Enter only on it, never on the current point. */
async function driveRewind(io: TerminalIO, target: string): Promise<boolean> {
  const want = squash(target).slice(0, 40)
  const is = (e: { text: string; current: boolean }) => !e.current && squash(e.text).startsWith(want)
  for (let i = 0; i < MAX_MOVES; i++) {
    const l = rewindList(io.screen())
    if (!l || l.highlighted < 0 || !want) return false
    if (is(l.entries[l.highlighted]!)) {
      io.write('\r')
      return true
    }
    const at = l.entries.findIndex(is)
    if (at < 0) return false
    io.write(at < l.highlighted ? UP : DOWN)
    await io.sleep(120)
  }
  return false
}

/** The footer ends with the model and its effort ("Gemini 3.8 Flash · high"), after a hint or a mode label. */
function readModel(screen: string) {
  const f = footer(screen).replace(/^(\? for shortcuts|esc to cancel)\s+/, '').replace(/^(accept-edits|plan)\s+·\s+/, '')
  const m = /^(\S.*?)\s+·\s+(\w+)$/.exec(f)
  return m ? { model: m[1]!, effort: m[2]! } : null
}

export const agyScreen: ScreenAdapter = {
  readModel,
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
  rewindList,
  openRewindList,
  driveRewind,
  typedText,
  btwOverlay: () => null
}
