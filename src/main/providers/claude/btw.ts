import type { Btw } from '../ports'
const RULE = /^\s*▔{6,}\s*$/

/** The side-question overlay `/btw` opens over the conversation: its question, then the answer once there is one. */
export function btwOverlay(screen: string): Btw | null {
  const lines = screen.split('\n')
  // The rule that opens the overlay, and the line that says how to close it (which can wrap on a narrow terminal, and changes once questions have been asked before: "c to copy" is on every version of it).
  const rule = lines.findLastIndex((l) => RULE.test(l))
  if (rule < 0) return null
  const end = lines.findIndex((l, i) => i > rule && /\bc to copy\b|Esc to( close|\s*$)|^\s*↑\/↓ to scroll/.test(l))
  if (end < 0) return null
  // The overlay lists the questions asked before, then the latest with its answer under it.
  const asked = lines.map((l, i) => (i > rule && i < end && /^\s+\/btw\s+\S/.test(l) ? i : -1)).filter((i) => i >= 0)
  const at = asked.at(-1)
  if (at === undefined) return null
  const body = lines.slice(at + 1, end).map((l) => l.trim()).filter(Boolean)
  const pending = body.length === 1 && /Answering/.test(body[0]!)
  return { question: lines[at]!.trim().replace(/^\/btw\s+/, ''), answer: pending || !body.length ? null : body.join(' ') }
}
