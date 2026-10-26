/**
 * The change of size for one wheel event: proportional to how far it turned, and small, since a trackpad sends dozens of events in one swipe.
 * A pinch on a trackpad arrives as a wheel with Ctrl held and small deltas, so it counts for more per unit. Never more than a tenth at once.
 */
export function wheelFactor(e: { deltaY: number; deltaMode: number; ctrlKey: boolean }): number {
  const pixels = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY
  const f = Math.exp(-pixels * (e.ctrlKey ? 0.01 : 0.0015))
  return Math.min(1.1, Math.max(1 / 1.1, f))
}
