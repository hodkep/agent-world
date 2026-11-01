/**
 * The words a person types to decide one of the office's gates from a phone (or anywhere, for an agent with remote control on): a verb, the short code of the
 * decision waiting, and what the verb takes. Nothing else in the message, so a stray "approve" in ordinary talk decides nothing.
 */
export interface Reply {
  verb: string
  code: string
  rest: string
}

/** Three characters from a hash of what is waiting, so the same decision has the same code after a restart and no list is kept. */
export function codeOf(key: string): string {
  let h = 0x811c9dc5
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193)
  return (h >>> 0).toString(36).padStart(3, '0').slice(-3)
}

/** The decision a message is, or null when it is anything else. The verbs are the words the waiting decisions list; no others count. */
export function parseReply(text: string, verbs: string[]): Reply | null {
  if (!verbs.length) return null
  const m = new RegExp(`^\\s*(${verbs.join('|')})\\s+([a-z0-9]{3})(?![a-z0-9])\\s*(?::\\s*|\\s+)?([\\s\\S]*?)\\s*$`, 'i').exec(text)
  return m ? { verb: m[1]!.toLowerCase(), code: m[2]!.toLowerCase(), rest: m[3] ?? '' } : null
}

/** "1=2, 2=Warm": question numbers with an option number or words; null when any part is not a pair. */
export function parseAnswers(text: string): { n: number; value: string }[] | null {
  if (!text.trim()) return []
  const out: { n: number; value: string }[] = []
  for (const part of text.split(',')) {
    const m = /^\s*(\d+)\s*=\s*(.+?)\s*$/.exec(part)
    if (!m) return null
    out.push({ n: Number(m[1]), value: m[2]! })
  }
  return out
}

/** A waiting code that the message uses as a word, though the message is not a decision (a typo of the verb, say). */
export function mentionedCode(text: string, codes: string[]): string | null {
  const words = text.toLowerCase().split(/[^a-z0-9]+/)
  return codes.find((c) => words.includes(c)) ?? null
}
