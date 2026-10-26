import { useEffect, useRef, useState } from 'react'
import { wheelFactor } from './wheelZoom'
import { GALLERY_MAX, type PictureSet, type Shot, galleryShown, stepPicture } from './gallery'

/** A picture in the conversation. Clicking opens it full size; a picture too big to carry says where it is. */
export function Picture({ src, onOpen, label = 'Picture' }: { src: string; onOpen: (src: string) => void; label?: string }) {
  if (!src) return <div className="pic missing">{label} is too large to show here. It is kept in the saved conversation.</div>
  return (
    <button className="pic" onClick={() => onOpen(src)} aria-label={`${label}: open full size`}>
      <img src={src} alt="" />
    </button>
  )
}

/** A message's pictures as a row of tiles, up to three and then "+n more"; any tile opens the viewer on that picture. */
export function Gallery({ shots, onOpen }: { shots: Shot[]; onOpen: (index: number) => void }) {
  const { shown, more } = galleryShown(shots.length)
  return (
    <div className="gallery" role="group" aria-label={`${shots.length} picture${shots.length === 1 ? '' : 's'} with this message`}>
      {shots.slice(0, shown).map((p, i) => (
        <button key={p.src + i} className="tile" onClick={() => onOpen(i)} aria-label={`${p.label}: open full size`} title={p.label}>
          <img src={p.src} alt="" />
          <span className="tile-n">{p.label}</span>
        </button>
      ))}
      {more > 0 && (
        <button className="tile more-t" onClick={() => onOpen(GALLERY_MAX)} aria-label={`${more} more picture${more === 1 ? '' : 's'}: open the next one`}>
          <span>
            +{more}
            <small>more</small>
          </span>
        </button>
      )}
    </div>
  )
}

const MIN = 1
const MAX = 8

/**
 * A picture shown whole, fitted to the window both ways. The wheel or the buttons zoom (keys + - 0 too), a drag moves it
 * once zoomed in, and a double click toggles between fitted and zoomed. A click on the dark area, or Esc, closes it.
 */
export function Lightbox({ src, set, onClose }: { src: string; /** Several pictures to step through (the ones of one message). */ set?: PictureSet; onClose: () => void }) {
  const [at, setAt] = useState(set?.index ?? 0)
  const total = set?.pictures.length ?? 1
  const current = set ? (set.pictures[at]?.src ?? src) : src
  const [view, setView] = useState({ s: 1, x: 0, y: 0 })
  const [panning, setPanning] = useState(false)
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const zoomTo = (f: (s: number) => number) =>
    setView((v) => {
      const s = Math.min(MAX, Math.max(MIN, f(v.s)))
      // Back at the fitted size the picture re-centres.
      return s === MIN ? { s, x: 0, y: 0 } : { ...v, s }
    })
  // A step to another picture starts it fitted, as a picture opened anew does.
  const go = (dir: 1 | -1) => {
    const next = stepPicture(at, dir, total)
    if (next !== at) (setAt(next), setView({ s: 1, x: 0, y: 0 }))
  }
  const goRef = useRef(go)
  goRef.current = go
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return void (e.stopPropagation(), onClose())
      if (total > 1 && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return void (e.preventDefault(), e.stopPropagation(), goRef.current(e.key === 'ArrowRight' ? 1 : -1))
      if (e.key === '+' || e.key === '=') zoomTo((s) => s * 1.25)
      else if (e.key === '-') zoomTo((s) => s / 1.25)
      else if (e.key === '0') setView({ s: 1, x: 0, y: 0 })
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [onClose, total])
  return (
    <div
      className={`lightbox ${panning ? 'panning' : ''}`}
      role="dialog"
      aria-label={total > 1 ? `Picture ${at + 1} of ${total}` : 'Picture'}
      onClick={() => !drag.current?.moved && onClose()}
      onWheel={(e) => zoomTo((s) => s * wheelFactor(e))}
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
        src={current}
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
      {set && total > 1 && (
        <>
          <button className="lb-nav l" aria-label="Previous picture" title="Previous (←)" disabled={at === 0} onClick={(e) => (e.stopPropagation(), go(-1))} onPointerDown={(e) => e.stopPropagation()}>
            ‹
          </button>
          <button className="lb-nav r" aria-label="Next picture" title="Next (→)" disabled={at === total - 1} onClick={(e) => (e.stopPropagation(), go(1))} onPointerDown={(e) => e.stopPropagation()}>
            ›
          </button>
          <div className="lb-cap" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
            <b>{set.pictures[at]?.label}</b>
            <span aria-live="polite">
              {at + 1} / {total}
            </span>
          </div>
          <div className="lb-strip" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
            {set.pictures.map((p, i) => (
              <button key={p.src + i} aria-label={`Picture ${i + 1}: ${p.label}`} aria-current={i === at} onClick={() => (setAt(i), setView({ s: 1, x: 0, y: 0 }))}>
                <img src={p.src} alt="" />
              </button>
            ))}
          </div>
        </>
      )}
      <button onClick={onClose} className="lightbox-x" aria-label="Close" title="Close (Esc)" />
    </div>
  )
}
