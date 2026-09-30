import { stripVTControlCharacters } from 'node:util'

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
    if (!numbered || run.length < 2 || cursors !== 1) {
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
