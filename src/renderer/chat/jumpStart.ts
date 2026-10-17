/**
 * The index of the message a keyboard jump starts from, when nothing was jumped to yet: the message just above the middle of what is on screen
 * for Alt+Up (the last one when the conversation is at its end, whatever a reply that is still being measured shows there for a moment),
 * or just below it for Alt+Down. `tops` are the tops of your messages, first to last; null when there is none to go to.
 */
export function jumpStart(tops: number[], mid: number, dir: 1 | -1, atEnd: boolean): number | null {
  if (tops.length === 0) return null
  if (dir < 0 && atEnd) return tops.length - 1
  const above = tops.filter((t) => t < mid).length
  if (dir < 0) return above > 0 ? above - 1 : 0
  return above < tops.length ? above : null
}
