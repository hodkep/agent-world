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

const MOVE_SETTLE_MS = 200
const CONFIRM_SETTLE_MS = 1200
const ATTEMPTS = 3

interface TerminalIO {
  screen: () => string
  write: (keys: string) => void
  sleep: (ms: number) => Promise<void>
}

/**
 * Move Claude's trust-menu cursor to the wanted option and confirm it, checking the screen between steps.
 * Enter is only pressed once the wanted option is highlighted: a swallowed arrow followed by Enter would
 * otherwise pick "No, exit" and close the agent.
 */
export async function answerTrust(io: TerminalIO, trust: boolean): Promise<boolean> {
  const want = trust ? 'yes' : 'no'
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    let prompt = trustPrompt(io.screen())
    if (!prompt) return true
    if (prompt.highlighted !== want) {
      io.write(want === 'yes' ? '\x1b[B' : '\x1b[A')
      await io.sleep(MOVE_SETTLE_MS)
      prompt = trustPrompt(io.screen())
      if (!prompt) return true
      if (prompt.highlighted !== want) continue
    }
    io.write('\r')
    await io.sleep(CONFIRM_SETTLE_MS)
  }
  return !trustPrompt(io.screen())
}
