import { useEffect, useRef, useState } from 'react'
import { DiagramViewer } from './DiagramViewer'
import { BOX, labelOf } from './diagramDom'
import { diagramContext } from './diagramContext'

/**
 * A Mermaid diagram in a reply. A click opens it large (zoom, pick boxes, draw); Shift+click picks a box here in the chat, and the
 * one button next to it adds the diagram, with what is picked, to the message box.
 */
export function Diagram({ svg, source, agentId }: { svg: string; source: string; agentId?: string }) {
  const host = useRef<HTMLDivElement>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (host.current) host.current.innerHTML = svg
  }, [svg])

  const emit = (names: string[], file: File | null) => {
    const c = diagramContext(source, names)
    window.dispatchEvent(new CustomEvent('aw-context', { detail: { agentId, text: c.text, file, label: c.label, source: 'Diagram' } }))
  }
  const clear = () => (host.current?.querySelectorAll('.sel').forEach((n) => n.classList.remove('sel')), setPicked([]))

  const click = (e: React.MouseEvent) => {
    const node = (e.target as Element).closest(BOX)
    if (e.shiftKey && node && host.current?.contains(node)) {
      node.classList.toggle('sel')
      setPicked([...host.current.querySelectorAll(`${BOX}.sel`)].map(labelOf))
    } else setOpen(true)
  }

  return (
    <div className="dia" data-picked={picked.length || undefined}>
      <div className="dia-bar" role="toolbar" aria-label="Diagram">
        {picked.length > 0 && <span className="dia-n">{picked.length} picked</span>}
        <button
          className="primary"
          onClick={() => (emit(picked, null), clear())}
          title={picked.length ? 'Add the diagram and the boxes you picked to the message box' : 'Add the diagram to the message box (click it to open, Shift+click a box to pick)'}
        >
          {picked.length ? 'Ask about them' : 'Add to message'}
        </button>
        {picked.length > 0 && <button onClick={clear}>Clear</button>}
      </div>
      <div ref={host} className="dia-svg" onClick={click} role="button" tabIndex={0} aria-label="Open the diagram" onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setOpen(true))} />
      {open && (
        <DiagramViewer
          svg={svg}
          picked={picked}
          onClose={() => setOpen(false)}
          onAsk={(names) => (emit(names, null), clear(), setOpen(false))}
          onDrawn={(png, names) => (emit(names, new File([png], 'diagram.png', { type: 'image/png' })), clear(), setOpen(false))}
        />
      )}
    </div>
  )
}
