import { stripVTControlCharacters } from 'node:util'
import type { TerminalIO } from '../ports'

/** Claude's permission mode, as shown in the footer under its input box ("⏸ plan mode on"). */
export function readMode(screen: string): string | null {
  // The footer sits at the bottom of a full screen; take the last one shown, and only when it carries Claude's glyph.
  // Only the bottom of the screen counts: the same words in the conversation above it are text.
  const bottom = stripVTControlCharacters(screen).split('\n').filter((l) => l.trim()).slice(-6).join('\n')
  const all = [...bottom.matchAll(/[⏸⏵]+\s*(manual|accept edits|plan|auto|bypass permissions|don'?t ask)(?: mode)? on\b/gi)]
  const name = all.at(-1)?.[1]?.toLowerCase()
  if (!name) return null
  return name === 'manual' ? 'default' : name === 'accept edits' ? 'acceptEdits' : name === 'bypass permissions' ? 'bypassPermissions' : name.startsWith('don') ? 'dontAsk' : name
}

/** Claude says so in its footer when Auto is not offered (a plan or model without it). */
export const autoUnavailable = (screen: string) => /auto mode unavailable/i.test(stripVTControlCharacters(screen))

const SHIFT_TAB = '\x1b[Z'
const SETTLE_MS = 350
const MAX_PRESSES = 8

/**
 * Move Claude to a permission mode with Shift+Tab, reading the footer after each press. Stops as soon as the footer
 * shows the wanted mode, and gives up if it never does (the mode is not in this session's cycle) or cannot be read.
 */
export async function setMode(io: TerminalIO, want: string): Promise<boolean> {
  for (let i = 0; i <= MAX_PRESSES; i++) {
    const now = readMode(io.screen())
    if (now === want) return true
    if (now === null || i === MAX_PRESSES) return false
    io.write(SHIFT_TAB)
    await io.sleep(SETTLE_MS)
  }
  return false
}
