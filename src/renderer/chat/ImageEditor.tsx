import { useCallback, useEffect, useRef, useState } from 'react'
import { type History, type Pt, type Shape, type Tool, add, canRedo, canUndo, clear, drawShapes, empty, lineWidth, redo, undo } from './annotate'
import { Lightbox } from './Images'
import { type IconName, PixelIcon } from './PixelIcon'

const TOOLS: { tool: Tool; icon: IconName; label: string }[] = [
  { tool: 'pen', icon: 'pencil', label: 'Pen' },
  { tool: 'line', icon: 'line', label: 'Line' },
  { tool: 'arrow', icon: 'arrow', label: 'Arrow' },
  { tool: 'rect', icon: 'rect', label: 'Rectangle' },
  { tool: 'ellipse', icon: 'ellipse', label: 'Ellipse' },
  { tool: 'text', icon: 'text', label: 'Text' },
  { tool: 'hide', icon: 'hide', label: 'Hide (black out an area)' }
]
// Drawn into the picture itself, so these are picture colours and not part of the app's palette.
const COLORS = [
  { value: '#d83a3a', label: 'Red' },
  { value: '#3b7ddd', label: 'Blue' },
  { value: '#4aa24a', label: 'Green' },
  { value: '#14111c', label: 'Black' },
  { value: '#ffffff', label: 'White' }
]

/** A picture attached to a message, full size, with an Edit button that opens the annotation tools. */
export function AttachmentViewer({ src, name, onSave, onClose }: { src: string; name: string; onSave: (png: Blob) => Promise<void> | void; onClose: () => void }) {
  const [editing, setEditing] = useState(false)
  if (editing) return <ImageEditor src={src} name={name} onSave={onSave} onClose={onClose} />
  return (
    <>
      <Lightbox src={src} onClose={onClose} />
      <button className="lightbox-edit primary" onClick={() => setEditing(true)}>
        <PixelIcon name="pencil" />
        Edit
      </button>
    </>
  )
}

export function ImageEditor({ src, name, onSave, onClose }: { src: string; name: string; onSave: (png: Blob) => Promise<void> | void; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const img = useRef<HTMLImageElement | null>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState(COLORS[0]!.value)
  const [hist, setHist] = useState<History>(empty)
  const [draft, setDraft] = useState<Shape | null>(null)
  const [typing, setTyping] = useState<{ at: Pt; x: number; y: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const i = new Image()
    i.onload = () => {
      img.current = i
      setSize({ w: i.naturalWidth, h: i.naturalHeight })
    }
    i.onerror = () => setError('That picture could not be opened for editing.')
    i.src = src
  }, [src])

  const paint = useCallback(
    (ctx: CanvasRenderingContext2D, shapes: Shape[]) => {
      if (!img.current || !size) return
      ctx.clearRect(0, 0, size.w, size.h)
      ctx.drawImage(img.current, 0, 0)
      drawShapes(ctx, shapes, size.w, size.h)
    },
    [size]
  )
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (ctx) paint(ctx, draft ? [...hist.done, draft] : hist.done)
  }, [paint, hist, draft])

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') (e.stopPropagation(), onClose())
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !(e.target instanceof HTMLInputElement)) (e.preventDefault(), setHist((h) => (e.shiftKey ? redo(h) : undo(h))))
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [onClose])

  // Screen position to picture pixels, whatever size the picture is shown at.
  const at = (e: React.PointerEvent): Pt => {
    const r = canvas.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * size!.w, y: ((e.clientY - r.top) / r.height) * size!.h }
  }
  const down = (e: React.PointerEvent) => {
    if (!size || typing) return
    const p = at(e)
    if (tool === 'text') {
      const r = canvas.current!.parentElement!.getBoundingClientRect()
      return setTyping({ at: p, x: e.clientX - r.left, y: e.clientY - r.top })
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    setDraft(tool === 'pen' ? { kind: 'pen', color, pts: [p] } : tool === 'hide' ? { kind: 'hide', a: p, b: p } : { kind: tool, color, a: p, b: p })
  }
  const move = (e: React.PointerEvent) => {
    if (!draft) return
    const p = at(e)
    setDraft(draft.kind === 'pen' ? { ...draft, pts: [...draft.pts, p] } : draft.kind === 'text' ? draft : { ...draft, b: p })
  }
  const up = () => {
    if (!draft) return
    const tiny = draft.kind !== 'pen' && draft.kind !== 'text' && Math.hypot(draft.b.x - draft.a.x, draft.b.y - draft.a.y) < 3
    if (!tiny) setHist((h) => add(h, draft))
    setDraft(null)
  }
  const commitText = (text: string) => {
    if (typing && text.trim()) setHist((h) => add(h, { kind: 'text', color, at: typing.at, text: text.trim() }))
    setTyping(null)
  }

  const save = async () => {
    if (!size || !img.current) return
    setSaving(true)
    try {
      const out = document.createElement('canvas')
      out.width = size.w
      out.height = size.h
      paint(out.getContext('2d')!, hist.done)
      const png = await new Promise<Blob | null>((r) => out.toBlob(r, 'image/png'))
      if (!png) throw new Error('The picture could not be saved.')
      await onSave(png)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <div className="editor" role="dialog" aria-label={`Edit ${name}`}>
      <div className="editor-stage">
        {size && (
          <div className="editor-canvas">
            <canvas ref={canvas} width={size.w} height={size.h} onMouseDown={(e) => e.preventDefault()} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label="Picture being edited" />
            {typing && (
              <input
                className="editor-text"
                autoFocus
                aria-label="Text to add"
                style={{ left: typing.x, top: typing.y, color, fontSize: Math.max(14, (lineWidth(size.w, size.h) * 7 * canvas.current!.getBoundingClientRect().width) / size.w) }}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter') commitText(e.currentTarget.value)
                  else if (e.key === 'Escape') setTyping(null)
                }}
                onBlur={(e) => commitText(e.currentTarget.value)}
              />
            )}
          </div>
        )}
        {!size && !error && <p className="hint">Opening…</p>}
        {error && (
          <p className="editor-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="editor-bar" role="toolbar" aria-label="Picture tools">
        <div className="editor-group" role="radiogroup" aria-label="Tool">
          {TOOLS.map((t) => (
            <button key={t.tool} role="radio" aria-checked={tool === t.tool} className="tool" onClick={() => setTool(t.tool)} aria-label={t.label} title={t.label}>
              <PixelIcon name={t.icon} />
            </button>
          ))}
        </div>
        <div className="editor-group" role="radiogroup" aria-label="Colour">
          {COLORS.map((c) => (
            <button key={c.value} role="radio" aria-checked={color === c.value} className="swatch" style={{ background: c.value }} onClick={() => setColor(c.value)} aria-label={c.label} title={c.label} />
          ))}
        </div>
        <div className="editor-group">
          <button className="tool" onClick={() => setHist(undo)} disabled={!canUndo(hist)} aria-label="Undo" title="Undo (⌘Z)">
            <PixelIcon name="undo" />
          </button>
          <button className="tool" onClick={() => setHist(redo)} disabled={!canRedo(hist)} aria-label="Redo" title="Redo (⇧⌘Z)">
            <PixelIcon name="redo" />
          </button>
          <button className="tool" onClick={() => setHist(clear)} disabled={hist.done.length === 0} aria-label="Clear all marks" title="Clear all marks">
            <PixelIcon name="trash" />
          </button>
        </div>
        <button onClick={onClose}>Close</button>
        <button className="primary" onClick={() => void save()} disabled={!size || saving || hist.done.length === 0}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
