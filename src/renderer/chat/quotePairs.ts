/** A message split into its quoted blocks (lines that start with "> ") and the words around them. */
export function quoted(text: string): { quote: boolean; text: string }[] {
  const out: { quote: boolean; text: string }[] = []
  for (const line of text.split('\n')) {
    const q = /^>\s?(.*)$/.exec(line)
    const last = out[out.length - 1]
    if (q) {
      if (last?.quote) last.text += `\n${q[1]}`
      else out.push({ quote: true, text: q[1]! })
    } else if (last && !last.quote) last.text += `\n${line}`
    else out.push({ quote: false, text: line })
  }
  return out.map((b) => ({ ...b, text: b.quote ? b.text : b.text.replace(/^\n+|\n+$/g, '') })).filter((b) => b.text !== '' || b.quote)
}

export type QuotePiece = { kind: 'free'; text: string } | { kind: 'qa'; quote: string; note: string }

/** Each quote with the words written under it as its note; only words before the first quote stand on their own. */
export function pairQuotes(text: string): QuotePiece[] {
  const out: QuotePiece[] = []
  for (const b of quoted(text)) {
    const last = out[out.length - 1]
    if (b.quote) out.push({ kind: 'qa', quote: b.text, note: '' })
    else if (last?.kind === 'qa' && !last.note) last.note = b.text
    else out.push({ kind: 'free', text: b.text })
  }
  return out
}
