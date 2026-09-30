export interface Btw {
  question: string
  /** null while Claude is still working on it. */
  answer: string | null
}

const RULE = /^\s*▔{6,}\s*$/

/** The side-question overlay `/btw` opens over the conversation: its question, then the answer once there is one. */
export function btwOverlay(screen: string): Btw | null {
  const lines = screen.split('\n')
  let at = -1
  lines.forEach((l, i) => {
    // The rule that opens the overlay may be a blank line or two above the question.
    const above = lines.slice(Math.max(0, i - 3), i).reverse().find((x) => x.trim())
    if (/^\s+\/btw\s+\S/.test(l) && above !== undefined && RULE.test(above)) at = i
  })
  if (at < 0) return null
  const end = lines.findIndex((l, i) => i > at && /Esc to close/.test(l))
  if (end < 0) return null
  const body = lines.slice(at + 1, end).map((l) => l.trim()).filter(Boolean)
  const pending = body.length === 1 && /Answering/.test(body[0]!)
  return { question: lines[at]!.trim().replace(/^\/btw\s+/, ''), answer: pending || !body.length ? null : body.join(' ') }
}
