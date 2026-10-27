import { type RefObject, useEffect } from 'react'

/** Closes a popup on a click outside it or Esc (Esc does not also close the window under it). A click inside a confirmation does not count as outside. */
export function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return
    // The press that opened the popup can still be on its way up the page when this runs: it is not a click outside.
    const born = performance.now()
    const down = (e: MouseEvent) => {
      if (e.timeStamp <= born) return
      const t = e.target as Element
      if (!ref.current?.contains(t) && !t.closest?.('.confirm-dialog')) onClose()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('.confirm-dialog')) return
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key, true)
    return () => (document.removeEventListener('mousedown', down), document.removeEventListener('keydown', key, true))
  }, [ref, open, onClose])
}
