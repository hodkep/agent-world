import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * A speech bubble over the button that was pressed, with a tail pointing at it (below it when there is no room above). A result (`seconds`) takes itself away after that long or at the
 * next click; a question stays until Escape, a click outside it, or what it offers is chosen.
 */
export function Callout({ at, tone = 'ok', seconds, label, onClose, children }: { at: DOMRect; label?: string; tone?: 'ok' | 'bad' | 'ask'; seconds?: number; onClose: () => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const t = seconds ? setTimeout(() => close.current(), seconds * 1000) : undefined
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close.current()
    const down = (e: PointerEvent) => !box.current?.contains(e.target as Node) && close.current()
    document.addEventListener('keydown', key)
    // Not in the same turn as the click that made it, or that click would close it at once.
    const arm = setTimeout(() => document.addEventListener('pointerdown', down), 0)
    return () => {
      if (t) clearTimeout(t)
      clearTimeout(arm)
      document.removeEventListener('keydown', key)
      document.removeEventListener('pointerdown', down)
    }
  }, [seconds])
  const below = at.top < 150
  const left = Math.max(8, Math.min(at.left, window.innerWidth - 400))
  const style = below ? { left, top: at.bottom + 12 } : { left, bottom: window.innerHeight - at.top + 12 }
  return createPortal(
    <div ref={box} className={`callout ${tone}${below ? ' below' : ''}`} style={style} role={tone === 'ask' ? 'alertdialog' : 'status'} aria-label={label} aria-live={tone === 'ask' ? undefined : 'polite'}>
      {children}
    </div>,
    // A modal dialog sits in the top layer, above anything else on the page: the bubble goes inside the open one.
    [...document.querySelectorAll('dialog[open]')].at(-1) ?? document.body
  )
}
