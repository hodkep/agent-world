import { stripVTControlCharacters } from 'node:util'
import type { Menu, TerminalIO, TrustPrompt } from '../ports'
import { inputBoxAfter } from './box'

const YES = 'Yes, I trust this folder'
const CONFIRM = 'Enter to confirm'

/** Claude Code's first-run "do you trust this folder?" menu, if it is on the given rendered screen. */
export function trustPrompt(screen: string): TrustPrompt | null {
  const text = stripVTControlCharacters(screen)
  const yesAt = text.lastIndexOf(YES)
  const confirmAt = text.lastIndexOf(CONFIRM)
  if (yesAt < 0 || confirmAt < yesAt) return null
  // Claude's own menu is the last thing drawn, with only its hint line after it; anything more (above all its input box) means these are words in the conversation.
  if (text.slice(confirmAt).split('\n').filter((l) => l.trim()).length > 1 || inputBoxAfter(text.split('\n'), text.slice(0, yesAt).split('\n').length - 1)) return null
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
  return lines.some((l) => l.startsWith('───')) && lines.some((l) => /^❯([ \u00a0]|$)/.test(l))
}

/** Claude's "ready to execute, would you like to proceed?" plan menu: options 1-3, which one is highlighted. */
export function planMenu(screen: string): { highlighted: number } | null {
  const text = stripVTControlCharacters(screen)
  const at = text.search(/Would\s+you\s+like\s+to\s+proceed\?/)
  if (at < 0 || !/ready to execute/.test(text) || inputBoxAfter(text.split('\n'), text.slice(0, at).split('\n').length - 1)) return null
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
  const lines = stripVTControlCharacters(screen).split('\n')
  const at = lines.findLastIndex((l) => /^\s*❯\s*\d+\.\s/.test(l))
  return at >= 0 && !inputBoxAfter(lines, at)
}

export { answerMenu } from '../shared/menu'
import { answerMenu } from '../shared/menu'

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
