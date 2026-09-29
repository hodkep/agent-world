import { stripVTControlCharacters } from 'node:util'

const YES = 'Yes, I trust this folder'
const CONFIRM = 'Enter to confirm'
// Anything longer than this after the menu means Claude has moved on and redrawn the screen.
const ANSWERED_AFTER = 12

export interface TrustPrompt {
  path: string
  highlighted: 'yes' | 'no'
}

/** Claude Code's first-run "do you trust this folder?" menu, if it is what the terminal shows right now. */
// Claude's TUI places each word with a cursor move (CSI n G / CSI n C) rather than a space,
// so those moves must become spaces before the text can be matched.
export const screenText = (raw: string) => stripVTControlCharacters(raw.replace(/\x1b\[\d*[GC]/g, ' ')).replace(/[ \t]+/g, ' ')

export function trustPrompt(raw: string): TrustPrompt | null {
  const text = screenText(raw)
  const yesAt = text.lastIndexOf(YES)
  const confirmAt = text.lastIndexOf(CONFIRM)
  if (yesAt < 0 || confirmAt < yesAt) return null
  if (text.slice(confirmAt + CONFIRM.length).replace(/[\s·a-zA-Z]*cancel/, '').trim().length > ANSWERED_AFTER) return null

  const start = text.lastIndexOf('Accessing workspace:', yesAt)
  const end = text.indexOf('Quick safety check', start)
  const path = start >= 0 && end > start ? text.slice(start + 'Accessing workspace:'.length, end).split(/\r?\n/).map((l) => l.trim()).join('') : ''
  const cursor = text.lastIndexOf('❯', confirmAt)
  const line = text.slice(cursor, text.indexOf('\n', cursor) >>> 0)
  return { path, highlighted: line.includes('Yes') ? 'yes' : 'no' }
}

/** Keys that move the menu cursor onto the wanted option and confirm it. */
export function trustAnswerKeys(highlighted: 'yes' | 'no', trust: boolean) {
  const want = trust ? 'yes' : 'no'
  if (highlighted === want) return '\r'
  return (want === 'yes' ? '\x1b[B' : '\x1b[A') + '\r'
}
