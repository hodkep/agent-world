/** How near the end counts as at the end, in pixels. */
export const NEAR_END = 80
/** How long after the wheel, a key or the pointer a scroll is still the reader's. */
export const READER_MS = 250

/**
 * Whether the conversation goes on following its end after a scroll event. Reaching the end starts it, and the reader scrolling away stops it.
 * A scroll the reader did not make does not stop it: rows that were not drawn yet are measured when they come into view, and the browser moves
 * the view to hold what is read while they change size, so a look at the end in the middle of that can find it 165 pixels off, for a moment.
 * Judging that by how far the end is off left the view stranded above the end for good, with no way back but a scroll. What leaves the end on
 * purpose without the reader (a jump to a message, a search match, a task) says so itself. A reader who was away is not brought back by the layout moving either.
 */
export function followsEnd(o: { gap: number; byReader: boolean; was: boolean }): boolean {
  if (o.gap < NEAR_END) return true
  return o.byReader ? false : o.was
}
