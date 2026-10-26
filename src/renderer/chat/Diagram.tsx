import { useEffect, useRef, useState } from 'react'
import { ImageEditor } from './ImageEditor'
import { Lightbox } from './Images'
import { diagramContext } from './diagramContext'

const PAPER = '#0c0b12'
/** A box in the drawing: Mermaid's own `node`, and `rough-node` when it is drawn by hand. */
const BOX = '.node, .rough-node'

/** The diagram's SVG as a PNG (twice its size, on the chat's dark paper), for the viewer, the editor, the clipboard and an attachment. */
async function pngOf(host: HTMLElement): Promise<Blob> {
  const svg = host.querySelector('svg')
  if (!svg) throw new Error('No diagram to draw')
  const copy = svg.cloneNode(true) as SVGSVGElement
  copy.querySelectorAll('.sel').forEach((n) => n.classList.remove('sel'))
  const box = svg.viewBox.baseVal
  const w = box?.width || svg.getBoundingClientRect().width
  const h = box?.height || svg.getBoundingClientRect().height
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  copy.setAttribute('width', String(w))
  copy.setAttribute('height', String(h))
  copy.removeAttribute('style')
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml' }))
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => {
      const i = new Image()
      i.onload = () => ok(i)
      i.onerror = () => no(new Error('The diagram could not be drawn as a picture'))
      i.src = url
    })
    const c = document.createElement('canvas')
    c.width = Math.round(w * 2)
    c.height = Math.round(h * 2)
    const g = c.getContext('2d')!
    g.fillStyle = PAPER
    g.fillRect(0, 0, c.width, c.height)
    g.drawImage(img, 0, 0, c.width, c.height)
    return await new Promise<Blob>((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('The diagram could not be saved as a picture'))), 'image/png'))
  } finally {
    URL.revokeObjectURL(url)
  }
}

const labelOf = (node: Element) => (node.textContent ?? '').replace(/\s+/g, ' ').trim()

/** A Mermaid diagram in a reply: boxes can be picked, and it can be zoomed, drawn on, copied or added to the message box. */
export function Diagram({ svg, source, agentId }: { svg: string; source: string; agentId?: string }) {
  const host = useRef<HTMLDivElement>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [shown, setShown] = useState<{ mode: 'zoom' | 'draw'; src: string } | null>(null)
  const [note, setNote] = useState('')

  useEffect(() => {
    if (host.current) host.current.innerHTML = svg
  }, [svg])
  useEffect(() => () => void (shown && URL.revokeObjectURL(shown.src)), [shown])

  const pick = (e: React.MouseEvent) => {
    const node = (e.target as Element).closest(BOX)
    if (!node || !host.current?.contains(node)) return
    if (!e.shiftKey) host.current.querySelectorAll('.sel').forEach((n) => n !== node && n.classList.remove('sel'))
    node.classList.toggle('sel')
    setPicked([...host.current.querySelectorAll(`${BOX}.sel`)].map(labelOf))
  }
  const clear = () => (host.current?.querySelectorAll('.sel').forEach((n) => n.classList.remove('sel')), setPicked([]))

  const emit = (file: File | null) => {
    const c = diagramContext(source, picked)
    window.dispatchEvent(new CustomEvent('aw-context', { detail: { agentId, text: c.text, file, label: c.label, source: 'Diagram' } }))
    clear()
  }
  const run = async (what: 'zoom' | 'draw' | 'copy') => {
    setNote('')
    try {
      const png = await pngOf(host.current!)
      if (what === 'copy') {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
        setNote('Copied')
        setTimeout(() => setNote(''), 1200)
      } else setShown({ mode: what, src: URL.createObjectURL(png) })
    } catch (err) {
      setNote((err as Error).message)
    }
  }

  return (
    <div className="dia" data-picked={picked.length || undefined}>
      <div className="dia-bar" role="toolbar" aria-label="Diagram">
        {picked.length > 0 && <span className="dia-n">{picked.length} picked</span>}
        <button onClick={() => void run('zoom')} title="Open it large: wheel or + − to zoom, drag to move">Zoom</button>
        <button onClick={() => void run('draw')} title="Draw on it with the pen, arrow and text tools, then add it to the message">Draw</button>
        <button onClick={() => void run('copy')} title="Copy the diagram as a picture">{note === 'Copied' ? 'Copied' : 'Copy'}</button>
        {picked.length > 0 ? (
          <>
            <button className="primary" onClick={() => emit(null)} title="Add the diagram and the boxes you picked to the message box">Ask about them</button>
            <button onClick={clear}>Clear</button>
          </>
        ) : (
          <button className="primary" onClick={() => emit(null)} title="Add the diagram to the message box">Add to message</button>
        )}
      </div>
      <div ref={host} className="dia-svg" onClick={pick} />
      {note && note !== 'Copied' && <p className="dia-error" role="alert">{note}</p>}
      {shown?.mode === 'zoom' && <Lightbox src={shown.src} onClose={() => setShown(null)} />}
      {shown?.mode === 'draw' && (
        <ImageEditor
          src={shown.src}
          name="diagram.png"
          onClose={() => setShown(null)}
          onSave={(png) => {
            emit(new File([png], 'diagram.png', { type: 'image/png' }))
            setShown(null)
          }}
        />
      )}
    </div>
  )
}
