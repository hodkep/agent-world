/** Where the message box is in the messages sent before: -1 is the text being typed, 0 the newest sent, and so on. */
export interface Recall {
  index: number
  /** What was in the box when the walk back began, kept so it is never lost. */
  draft: string
}

export const fresh: Recall = { index: -1, draft: '' }

/** ↑ acts when the caret is on the first line, ↓ when it is on the last, so moving about in a longer message is unchanged. */
export const onFirstLine = (text: string, selStart: number) => !text.slice(0, selStart).includes('\n')
export const onLastLine = (text: string, selEnd: number) => !text.slice(selEnd).includes('\n')

/** One step back to an older message, or null when there is none. The first step saves the draft. */
export function older(r: Recall, sent: string[], text: string): { recall: Recall; text: string } | null {
  if (r.index >= sent.length - 1) return null
  return { recall: { index: r.index + 1, draft: r.index < 0 ? text : r.draft }, text: sent[r.index + 1]! }
}

/** One step forward; past the newest message the draft comes back. Null when already on the draft. */
export function newer(r: Recall, sent: string[]): { recall: Recall; text: string } | null {
  if (r.index < 0) return null
  const index = r.index - 1
  return { recall: index < 0 ? fresh : { index, draft: r.draft }, text: index < 0 ? r.draft : sent[index]! }
}

/** Esc leaves the walk and brings the draft back. */
export const back = (r: Recall): { recall: Recall; text: string } | null => (r.index < 0 ? null : { recall: fresh, text: r.draft })
