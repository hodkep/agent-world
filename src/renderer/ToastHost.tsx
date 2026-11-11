import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { dismissToast, useToasts, type Toast } from './toasts'

const SECONDS = { bad: 8, ok: 4 }

function Item({ t }: { t: Toast }) {
  const [held, setHeld] = useState(false)
  const left = useRef(SECONDS[t.tone] * 1000)
  // Time left is kept while the pointer is over it, so a message being read does not leave.
  useEffect(() => {
    if (held) return
    const from = Date.now()
    const id = setTimeout(() => dismissToast(t.id), left.current)
    return () => (clearTimeout(id), void (left.current -= Date.now() - from))
  }, [held, t.id])
  return (
    <div className={`toast toast-${t.tone}`} role={t.tone === 'bad' ? 'alert' : 'status'} onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)}>
      <i aria-hidden>{t.tone === 'bad' ? '!' : '✓'}</i>
      <div>{t.text}</div>
      <button className="toast-x" aria-label="Dismiss" onClick={() => dismissToast(t.id)}>✕</button>
    </div>
  )
}

/** Messages on top of the whole window, above every pane and callout. */
export function Toasts() {
  const list = useToasts()
  const box = useRef<HTMLDivElement>(null)
  // A modal box (Settings, the Library) sits in the browser's top layer, which no z-index beats; a popover is put there too, and shown last it is the topmost. Shown again for each new message, so one that comes while a box is open still lies over it.
  useEffect(() => {
    const el = box.current
    if (!el) return
    try {
      if (el.matches(':popover-open')) el.hidePopover()
      el.showPopover()
    } catch {
      /* no popover support: the z-index still lifts it over the plain panes */
    }
  }, [list.length])
  if (!list.length) return null
  // A modal box makes everything outside it inert, so the toast (its ✕, its hover) lives inside the open one, if any.
  const host = [...document.querySelectorAll('dialog[open]')].pop() ?? document.body
  return createPortal(<div ref={box} popover="manual" className="toasts">{list.map((t) => <Item key={t.id} t={t} />)}</div>, host)
}
