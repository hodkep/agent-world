import type { Menu, TerminalIO } from '../ports'

const MOVE_SETTLE_MS = 200
const CONFIRM_SETTLE_MS = 1200
const MAX_STEPS = 6
const DOWN = '\x1b[B'
const UP = '\x1b[A'

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
