import { stripVTControlCharacters } from 'node:util'

const YES = 'Yes, I trust this folder'
const CONFIRM = 'Enter to confirm'

export interface TrustPrompt {
  path: string
  highlighted: 'yes' | 'no'
}

/** Claude Code's first-run "do you trust this folder?" menu, if it is on the given rendered screen. */
export function trustPrompt(screen: string): TrustPrompt | null {
  const text = stripVTControlCharacters(screen)
  const yesAt = text.lastIndexOf(YES)
  const confirmAt = text.lastIndexOf(CONFIRM)
  if (yesAt < 0 || confirmAt < yesAt) return null
  const start = text.lastIndexOf('Accessing workspace:', yesAt)
  const end = text.indexOf('Quick safety check', start)
  const path = start >= 0 && end > start ? text.slice(start + 'Accessing workspace:'.length, end).split(/\r?\n/).map((l) => l.trim()).join('') : ''
  const cursor = text.lastIndexOf('❯', confirmAt)
  const line = text.slice(cursor, text.indexOf('\n', cursor) >>> 0)
  return { path, highlighted: line.includes('Yes') ? 'yes' : 'no' }
}

/** Claude's input box (a `❯` line between rules) is on screen and no menu is in the way. */
export function inputReady(screen: string): boolean {
  if (trustPrompt(screen)) return false
  const lines = screen.split('\n').map((l) => l.trimStart())
  return lines.some((l) => l.startsWith('───')) && lines.some((l) => /^❯( |$)/.test(l))
}

/** Claude's "ready to execute, would you like to proceed?" plan menu: options 1-3, which one is highlighted. */
export function planMenu(screen: string): { highlighted: number } | null {
  const text = stripVTControlCharacters(screen)
  const at = text.search(/Would\s+you\s+like\s+to\s+proceed\?/)
  if (at < 0 || !/ready to execute/.test(text)) return null
  const options = text
    .slice(at)
    .split('\n')
    .map((l) => /^\s*(❯)?\s*([1-9])\.\s/.exec(l))
    .filter((m): m is RegExpExecArray => !!m)
  const highlighted = options.findIndex((m) => m[1] === '❯')
  return options.length >= 2 && highlighted >= 0 ? { highlighted } : null
}

/** Any of Claude's terminal menus is open (trust, plan, permission...): typing now would answer it. */
export function anyMenu(screen: string): boolean {
  if (trustPrompt(screen)) return true
  return /^\s*❯\s*\d+\.\s/m.test(stripVTControlCharacters(screen))
}

const MOVE_SETTLE_MS = 200
const CONFIRM_SETTLE_MS = 1200
const MAX_STEPS = 6
const DOWN = '\x1b[B'
const UP = '\x1b[A'

interface TerminalIO {
  screen: () => string
  write: (keys: string) => void
  sleep: (ms: number) => Promise<void>
}

type Menu = (screen: string) => { highlighted: number } | null

/**
 * Answer one of Claude's terminal menus: move the cursor a step at a time, re-reading the screen after each
 * key, and press Enter only once the wanted option is highlighted. A swallowed arrow followed by a blind Enter
 * could pick "No, exit" and close the agent, so nothing is ever pressed without looking first.
 */
export async function answerMenu(io: TerminalIO, detect: Menu, want: number): Promise<boolean> {
  for (let step = 0; step < MAX_STEPS; step++) {
    const state = detect(io.screen())
    if (!state) return true
    if (state.highlighted === want) {
      io.write('\r')
      await io.sleep(CONFIRM_SETTLE_MS)
      if (!detect(io.screen())) return true
      continue
    }
    io.write(state.highlighted < want ? DOWN : UP)
    await io.sleep(MOVE_SETTLE_MS)
  }
  return !detect(io.screen())
}

const trustMenu: Menu = (screen) => {
  const p = trustPrompt(screen)
  return p ? { highlighted: p.highlighted === 'yes' ? 1 : 0 } : null
}

/** "No, exit" is option 0 and "Yes, I trust this folder" option 1. */
export function answerTrust(io: TerminalIO, trust: boolean) {
  return answerMenu(io, trustMenu, trust ? 1 : 0)
}

/**
 * Claude shows a spinner line while it works ("✽ Thundering… (3s · ↓ 120 tokens)", or "(running PreToolUse hooks…)"),
 * and redraws it every second. When none is on the screen, nothing is running.
 */
export function looksWorking(screen: string): boolean {
  const text = stripVTControlCharacters(screen)
  return /\S…\s*\(\d+s?\b/.test(text) || /\(running [^)\n]*hooks/i.test(text) || /esc to interrupt/i.test(text)
}
