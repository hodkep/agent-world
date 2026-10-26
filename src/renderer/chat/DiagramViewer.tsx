import { useEffect, useRef, useState } from 'react'
import { ImageEditor } from './ImageEditor'
import { pickedAt, pngOf, showPicks, toggled } from './diagramDom'
import { wheelFactor } from './wheelZoom'

const MIN = 0.4
const MAX = 6
const SLOP = 6

/**
 * A diagram opened large. The wheel or the buttons zoom (keys + - 0 too), a drag moves it, and a click on a box picks it (more than one
 * can be picked; arrows cannot). "Ask" adds the diagram and the picked boxes to the message box, and Draw opens the same pen, arrow and
 * text tools as a picture, then adds the marked-up picture.
 */
export function DiagramViewer({ svg, picked: first, onClose, onAsk, onDrawn }: { svg: string; picked: string[]; onClose: () => void; onAsk: (picked: string[]) => void; onDrawn: (png: Blob, picked: string[]) => void }) {
  const host = useRef<HTMLDivElement>(null)
  const [picked, setPicked] = useState(first)
  const [view, setView] = useState({ s: 1, x: 0, y: 0 })
  const [drawing, setDrawing] = useState<string | null>(null)
  const [error, setError] = useState('')
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)

  useEffect(() => {
    if (host.current) host.current.innerHTML = svg
  }, [svg])
  useEffect(() => showPicks(host.current, picked), [picked, svg])
  useEffect(() => () => void (drawing && URL.revokeObjectURL(drawing)), [drawing])

  const zoom = (f: (s: number) => number) =>
    setView((v) => {
      const s = Math.min(MAX, Math.max(MIN, f(v.s)))
      return s === 1 ? { s, x: 0, y: 0 } : { ...v, s }
    })
  useEffect(() => {
    if (drawing) return
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === '+' || e.key === '=') zoom((s) => s * 1.25)
      else if (e.key === '-') zoom((s) => s / 1.25)
      else if (e.key === '0') zoom(() => 1)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [drawing, onClose])

  // A box is picked when the button goes up on the box it went down on, having moved no more than a trackpad click does by itself.
  const down = useRef<{ x: number; y: number; name: string | null } | null>(null)
  const pick = (e: React.PointerEvent) => {
    const d = down.current
    down.current = null
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > SLOP) return
    const name = host.current ? pickedAt(e.target as Element, host.current) : null
    if (name && name === d.name) setPicked((p) => toggled(p, name))
  }
  const unpick = (name: string) => setPicked((p) => p.filter((x) => x !== name))
  const clear = () => setPicked([])
  const draw = async () => {
    setError('')
    try {
      setDrawing(URL.createObjectURL(await pngOf(host.current!)))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  if (drawing)
    return (
      <ImageEditor
        src={drawing}
        name="diagram.png"
        // Closing the editor closes the whole pane, as it does for a picture: back to the chat, not to a viewer.
        onClose={onClose}
        onSave={(png) => {
          onDrawn(png, picked)
        }}
      />
    )
  return (
    <div className="dv" role="dialog" aria-label="Diagram">
      <div className="dv-bar" role="toolbar" aria-label="Diagram tools">
        <div className="dv-group" role="group" aria-label="Zoom">
          <button onClick={() => zoom((s) => s / 1.25)} aria-label="Zoom out" title="Zoom out (−)" disabled={view.s <= MIN}>−</button>
          <span className="dv-zoom" aria-live="polite">{Math.round(view.s * 100)}%</span>
          <button onClick={() => zoom((s) => s * 1.25)} aria-label="Zoom in" title="Zoom in (+)" disabled={view.s >= MAX}>+</button>
          <button onClick={() => zoom(() => 1)} title="Fit to the window (0)">Fit</button>
        </div>
        <span className="dv-hint">Click boxes to pick them (arrows cannot be picked). Scroll to zoom, drag to move.</span>
        <button onClick={() => void draw()} title="Draw on it with the pen, arrow and text tools">Draw</button>
        <button onClick={onClose} aria-label="Close" title="Close (Esc)">Close</button>
      </div>
      <div
        className="dv-stage"
        onClick={(e) => e.target === e.currentTarget && !drag.current?.moved && onClose()}
        onWheel={(e) => zoom((s) => s * wheelFactor(e))}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, moved: false }
          down.current = { x: e.clientX, y: e.clientY, name: host.current ? pickedAt(e.target as Element, host.current) : null }
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d || e.buttons !== 1) return
          if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > SLOP) d.moved = true
          if (d.moved) setView((v) => ({ ...v, x: v.x + e.movementX, y: v.y + e.movementY }))
        }}
        onPointerUp={(e) => (pick(e), setTimeout(() => (drag.current = null)))}
      >
        <div ref={host} className="dia-svg dv-svg" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }} />
      </div>
      <div className="dv-foot">
        {picked.length === 0 ? (
          <span className="dv-none">Nothing picked. Ask adds the whole diagram.</span>
        ) : (
          <ul className="dv-picked" aria-label="Picked boxes">
            {picked.map((p) => (
              <li key={p}>
                {p}
                <button onClick={() => unpick(p)} aria-label={`Let go of ${p}`} title="Let go">×</button>
              </li>
            ))}
          </ul>
        )}
        {picked.length > 0 && <button onClick={clear}>Clear</button>}
        <button className="primary" onClick={() => onAsk(picked)} title="Add the diagram and what you picked to the message box">
          {picked.length ? `Ask about ${picked.length === 1 ? 'it' : `these ${picked.length}`}` : 'Add to message'}
        </button>
      </div>
      {error && <p className="dia-error" role="alert">{error}</p>}
    </div>
  )
}
