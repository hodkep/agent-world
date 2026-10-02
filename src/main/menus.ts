import { stripVTControlCharacters } from 'node:util'
import { anyMenu, inputReady } from './prompts'

export interface GenericMenu {
  /** The first line of the block the menu belongs to ("Bash command", "Rewind"…). */
  title: string
  /** The lines between the title and the options: what is being asked about. */
  context: string
  options: string[]
  highlighted: number
  /** The key hint under the options ("Esc to cancel · Tab to amend"). */
  hint: string
}

const RULE = /^\s*[─▔━═]{8,}/
const OPTION = /^\s*(❯)?\s*(\d+)\.\s+(\S.*?)\s*$/

/**
 * Any of Claude's numbered choice menus: a permission dialog Claude insists on showing itself, the rewind
 * confirmation, a model picker… One `❯` cursor sits on one of a run of options numbered from 1.
 */
export function genericMenu(screen: string): GenericMenu | null {
  const lines = stripVTControlCharacters(screen).split('\n')
  // The last run of consecutively numbered options that carries the cursor.
  for (let end = lines.length - 1; end >= 0; end--) {
    if (!OPTION.test(lines[end]!)) continue
    let start = end
    while (start > 0 && OPTION.test(lines[start - 1]!)) start--
    const run = lines.slice(start, end + 1).map((l) => OPTION.exec(l)!)
    const numbered = run.every((m, i) => Number(m[2]) === i + 1)
    const cursors = run.filter((m) => m[1]).length
    // A menu is the last thing drawn: your own numbered message echoed after the ❯ prompt marker has Claude's reply, a status line or the input box below it.
    const buried = lines.slice(end + 1).some((l) => /^\s*[●⏺✱✻✽❯]/.test(l) || RULE.test(l))
    if (!numbered || run.length < 2 || cursors !== 1 || buried) {
      end = start
      continue
    }
    // Everything above the options, back to the last horizontal rule, is the question and what it is about.
    let top = start
    while (top > 0 && !RULE.test(lines[top - 1]!)) top--
    const block = lines.slice(top, start).map((l) => l.trim()).filter(Boolean)
    const hint = lines.slice(end + 1, end + 4).map((l) => l.trim()).find((l) => /esc|enter/i.test(l)) ?? ''
    return { title: block[0] ?? '', context: block.slice(1).join('\n'), options: run.map((m) => m[3]!), highlighted: run.findIndex((m) => m[1]), hint }
  }
  return null
}

export interface RewindList {
  entries: { text: string; current: boolean }[]
  highlighted: number
}

/** The /rewind list: prompts to go back to, each with a line under it, and a `❯` on the one selected. */
export function rewindList(screen: string): RewindList | null {
  const lines = stripVTControlCharacters(screen).split('\n')
  const head = lines.map((l) => l.trim()).lastIndexOf('Rewind')
  if (head < 0) return null
  const end = lines.findIndex((l, i) => i > head && /Enter to continue/.test(l))
  if (end < 0) return null
  const entries: RewindList['entries'] = []
  let highlighted = -1
  for (const raw of lines.slice(head + 1, end)) {
    const l = raw.trim()
    if (!l || /^Restore the code/.test(l) || /^[↑↓] \d+ more/.test(l) || /^No code changes$|^\d+ files? changed|^[+-]\d/.test(l) || /changes?$/.test(l)) continue
    const cursor = l.startsWith('❯')
    const text = l.replace(/^❯\s*/, '')
    if (cursor) highlighted = entries.length
    entries.push({ text, current: text === '(current)' })
  }
  return entries.length ? { entries, highlighted } : null
}

interface TerminalIO {
  screen: () => string
  write: (keys: string) => void
  sleep: (ms: number) => Promise<void>
}

const UP = '\x1b[A'
const DOWN = '\x1b[B'
const MAX_MOVES = 80

/**
 * Walk the rewind list to the prompt that starts with `target` (the list scrolls, so this moves a step at a time
 * and re-reads the screen) and press Enter on it. Never presses Enter on the wrong entry.
 */
export async function driveRewind(io: TerminalIO, target: string): Promise<boolean> {
  const want = target.trim().slice(0, 40)
  for (let i = 0; i < MAX_MOVES; i++) {
    const l = rewindList(io.screen())
    if (!l || l.highlighted < 0) return false
    const here = l.entries[l.highlighted]!
    if (!here.current && here.text.startsWith(want)) {
      io.write('\r')
      return true
    }
    const at = l.entries.findIndex((e) => !e.current && e.text.startsWith(want))
    // Visible: go toward it. Not visible: prompts you rewind to are earlier, so go up.
    io.write(at < 0 || at < l.highlighted ? UP : DOWN)
    await io.sleep(120)
    // The top of the list: nothing above and not found.
    if (at < 0 && l.highlighted === 0 && !l.entries.some((e) => e.text.startsWith(want))) return false
  }
  return false
}

const CLEAR_LINE = '\x15'
const NOTHING = 'There is nothing to rewind to yet. Claude can only go back to a message sent before this one, and it has none saved for this conversation.'

/** Claude's /rewind box when it has no earlier prompt to go back to ("Nothing to rewind to yet."). */
export function nothingToRewind(screen: string): boolean {
  return /Nothing to rewind to yet/i.test(stripVTControlCharacters(screen))
}

/**
 * Type /rewind and open its list. Waits for the input box first (right after Esc the TUI can still be settling),
 * clears any draft text, and presses Enter a second time if the first one only went to the slash-command popup.
 * Returns what went wrong, or null once the list is on screen.
 */
export async function openRewindList(io: TerminalIO): Promise<string | null> {
  const until = async (ok: () => boolean, tries: number) => {
    for (let i = 0; i < tries && !ok(); i++) await io.sleep(200)
    return ok()
  }
  if (!(await until(() => inputReady(io.screen()), 15))) return 'Claude is not showing its message box yet (it may still be settling after being stopped). Try again in a moment.'
  io.write(CLEAR_LINE)
  await io.sleep(150)
  io.write('/rewind')
  await io.sleep(500)
  io.write('\r')
  const opened = () => !!rewindList(io.screen()) || nothingToRewind(io.screen())
  const said = async () => {
    if (!nothingToRewind(io.screen())) return null
    io.write('\x1b')
    return NOTHING
  }
  if (await until(opened, 10)) return (await said()) ?? null
  // The first Enter can be spent on picking from the popup of matching commands.
  io.write('\r')
  if (await until(opened, 20)) return (await said()) ?? null
  const screen = io.screen()
  if (anyMenu(screen)) return 'Another menu is open in Claude. Close it first.'
  if (/\/rewind/.test(stripVTControlCharacters(screen).split('\n').find((l) => l.trim().startsWith('❯')) ?? '')) return 'Claude left /rewind in its message box without running it. Try /rewind in the Terminal tab.'
  return 'Claude did not open the rewind list. Try /rewind in the Terminal tab.'
}
