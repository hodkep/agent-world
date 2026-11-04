/**
 * When the top bars are hidden, they slide down while the pointer rests on the top edge (or on the bars themselves) and go back a moment after it leaves.
 * `point(true)` says the pointer is on the edge or a bar, `point(false)` that it is not; the wait is not restarted by every small move.
 */
export function createPeek(o: { set: (peek: boolean) => void; openMs?: number; closeMs?: number }) {
  const openMs = o.openMs ?? 150
  const closeMs = o.closeMs ?? 350
  let peek = false
  let pending: boolean | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  return {
    point(want: boolean) {
      if (want === peek) {
        if (pending !== null) (clearTimeout(timer), (pending = null))
        return
      }
      if (pending === want) return
      clearTimeout(timer)
      pending = want
      timer = setTimeout(() => ((pending = null), (peek = want), o.set(want)), want ? openMs : closeMs)
    },
    reset() {
      clearTimeout(timer)
      pending = null
      peek = false
      o.set(false)
    }
  }
}
