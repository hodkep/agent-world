import { useEffect, useRef, useState } from 'react'

/** A picture in the conversation. Clicking opens it full size; a picture too big to carry says where it is. */
export function Picture({ src, onOpen, label = 'Picture' }: { src: string; onOpen: (src: string) => void; label?: string }) {
  if (!src) return <div className="pic missing">{label} is too large to show here. It is kept in the saved conversation.</div>
  return (
    <button className="pic" onClick={() => onOpen(src)} aria-label={`${label}: open full size`}>
      <img src={src} alt="" />
    </button>
  )
}

const MIN = 1
const MAX = 8

/**
 * A picture shown whole, fitted to the window both ways. The wheel or the buttons zoom (keys + - 0 too), a drag moves it
 * once zoomed in, and a double click toggles between fitted and zoomed. A click on the dark area, or Esc, closes it.
 */
export function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  const [view, setView] = useState({ s: 1, x: 0, y: 0 })
  const [panning, setPanning] = useState(false)
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const zoomTo = (f: (s: number) => number) =>
    setView((v) => {
      const s = Math.min(MAX, Math.max(MIN, f(v.s)))
      // Back at the fitted size the picture re-centres.
      return s === MIN ? { s, x: 0, y: 0 } : { ...v, s }
    })
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return void (e.stopPropagation(), onClose())
      if (e.key === '+' || e.key === '=') zoomTo((s) => s * 1.25)
      else if (e.key === '-') zoomTo((s) => s / 1.25)
      else if (e.key === '0') setView({ s: 1, x: 0, y: 0 })
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [onClose])
  return (
    <div
      className={`lightbox ${panning ? 'panning' : ''}`}
      role="dialog"
      aria-label="Picture"
      onClick={() => !drag.current?.moved && onClose()}
      onWheel={(e) => zoomTo((s) => s * (e.deltaY < 0 ? 1.15 : 1 / 1.15))}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d) return
        if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 3) d.moved = true
        setView((v) => (v.s > 1 ? { ...v, x: v.x + e.movementX, y: v.y + e.movementY } : v))
      }}
      onPointerUp={() => {
        setPanning(false)
        // `moved` outlives the pointer so the click that follows a drag does not close the picture.
        setTimeout(() => (drag.current = null))
      }}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={() => zoomTo((s) => (s > 1 ? 1 : 2))}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, moved: false }
          if (view.s > 1) setPanning(true)
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
      />
      <div className="lightbox-bar" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
        <button onClick={() => zoomTo((s) => s / 1.25)} aria-label="Zoom out" title="Zoom out (−)" disabled={view.s <= MIN}>−</button>
        <span>{view.s === 1 ? 'Fit' : `${Math.round(view.s * 100)}%`}</span>
        <button onClick={() => zoomTo((s) => s * 1.25)} aria-label="Zoom in" title="Zoom in (+)" disabled={view.s >= MAX}>+</button>
        <button onClick={() => setView({ s: 1, x: 0, y: 0 })} aria-label="Fit to window" disabled={view.s === 1}>Fit</button>
      </div>
      <button onClick={onClose} className="lightbox-x" aria-label="Close" title="Close (Esc)" />
    </div>
  )
}
