const RULE = /^\s*[─▔━═]{8,}/
const PROMPT = /^❯([ \u00a0]|$)/

/**
 * Claude's input box (a `❯` line between two rules) is what an open menu takes the place of. So a menu is Claude's own only if no input
 * box is drawn after it: the same words printed in the conversation sit above the box and status line Claude draws under it.
 */
export function inputBoxAfter(lines: string[], from: number): boolean {
  for (let i = Math.max(from + 1, 1); i < lines.length - 1; i++) {
    const t = lines[i]!.trimStart()
    if (PROMPT.test(t) && !/^❯\s*\d+\./.test(t) && RULE.test(lines[i - 1]!) && RULE.test(lines[i + 1]!)) return true
  }
  return false
}

/**
 * An input box drawn above a numbered line means that line is left over from a dialog Claude has closed (a tall one it could not erase
 * fully): a live menu takes the box's place, so nothing above it is a box.
 */
export function inputBoxBefore(lines: string[], until: number): boolean {
  return inputBoxAfter(lines.slice(0, until), -1)
}
