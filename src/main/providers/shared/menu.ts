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
  let asked: string | undefined
  for (let step = 0; step < MAX_STEPS; step++) {
    const state = detect(io.screen())
    if (!state) return true
    // A first-run question is followed at once by the next one: that is the answer taken, not a menu left to answer.
    if (asked !== undefined && state.key !== undefined && state.key !== asked) return true
    asked ??= state.key
    if (state.highlighted === want) {
      io.write('\r')
      await io.sleep(CONFIRM_SETTLE_MS)
      const after = detect(io.screen())
      if (!after || (asked !== undefined && after.key !== undefined && after.key !== asked)) return true
      continue
    }
    io.write(state.highlighted < want ? DOWN : UP)
    await io.sleep(MOVE_SETTLE_MS)
  }
  return !detect(io.screen())
}
