import { useEffect, useRef, useState } from 'react'
import { ADD_SELECTION_EVENT } from '../addSelection'
import { keysOf } from '../shortcuts'
import type { FileInfo } from '../../shared/files'
import { languageFor } from '../code/monaco'
import { Code, Markdown } from '../chat/markdown'

const size = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)

/** A file an agent made or mentioned: shown here when it can be, otherwise offered to the program this machine uses for it. */
export function FileView({ agentId, path, onClose, onAttached }: { agentId: string; path: string; onClose: () => void; onAttached: () => void }) {
  const [info, setInfo] = useState<FileInfo | null>(null)
  const [text, setText] = useState<{ body: string; truncated: boolean } | null>(null)
  const [image, setImage] = useState('')
  const [error, setError] = useState('')
  const [opened, setOpened] = useState('')
  const body = useRef<HTMLDivElement>(null)
  const [pick, setPick] = useState<{ text: string; x: number; y: number } | null>(null)

  useEffect(() => {
    let alive = true
    setInfo(null)
    setText(null)
    setImage('')
    setError('')
    setOpened('')
    void window.aw.fileInfo(agentId, [path]).then(async ([i]) => {
      if (!alive) return
      if (!i) return setError('That file is not there any more.')
      setInfo(i)
      try {
        if (['code', 'text', 'markdown'].includes(i.kind)) {
          const r = await window.aw.fileRead(agentId, i.path)
          if (alive) setText({ body: r.text, truncated: r.truncated })
        } else if (i.kind === 'image') {
          const r = await window.aw.fileImage(agentId, i.path)
          if (alive) setImage(r.src)
        }
      } catch (e) {
        if (alive) setError((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
      }
    })
    return () => {
      alive = false
    }
  }, [agentId, path])

  const openOutside = () =>
    void window.aw.openFileExternal(agentId, info?.path ?? path).then(
      (msg) => setOpened(msg || 'Opened.'),
      (e: Error) => setOpened(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    )

  // Words selected in the file can be sent to the agent as a quote.
  const onMouseUp = () => {
    const sel = window.getSelection()
    const t = sel?.toString().trim() ?? ''
    if (!t || !sel?.rangeCount || !body.current?.contains(sel.anchorNode)) return setPick(null)
    const r = sel.getRangeAt(0).getBoundingClientRect()
    const host = body.current.getBoundingClientRect()
    setPick({ text: t, x: Math.max(8, r.left - host.left), y: Math.max(4, r.top - host.top - 32 + body.current.scrollTop) })
  }
  const addContext = () => {
    if (!pick || !info) return
    const quoted = pick.text.split('\n').map((l) => `> ${l}`.trimEnd()).join('\n')
    window.dispatchEvent(new CustomEvent('aw-context', { detail: { agentId, text: `From ${info.name}:\n${quoted}`, file: null, label: `${info.name}, selection` } }))
    window.getSelection()?.removeAllRanges()
    setPick(null)
    onAttached()
  }

  const addRef = useRef(addContext)
  addRef.current = addContext
  const pickedRef = useRef(pick)
  pickedRef.current = pick
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ handled: boolean }>).detail
      if (d.handled || !pickedRef.current) return
      d.handled = true
      addRef.current()
    }
    window.addEventListener(ADD_SELECTION_EVENT, on)
    return () => window.removeEventListener(ADD_SELECTION_EVENT, on)
  }, [])

  return (
    <div className="fileview">
      <div className="fileview-bar">
        <b className="fileview-name" title={info?.path ?? path}>{info?.name ?? path.split('/').pop()}</b>
        {info && <span className="muted">{size(info.size)}</span>}
        <button className="push" onClick={openOutside} title="Open with the program this computer uses for this kind of file">
          Open with default app
        </button>
        <button onClick={onClose} aria-label="Close file">
          Close
        </button>
      </div>
      {opened && <p className="hint" role="status">{opened}</p>}
      {error && <p className="hint bad" role="alert">{error}</p>}
      {info && info.kind === 'other' && (
        <div className="fileview-other">
          <p>
            <b>{info.name}</b> can't be shown here.
          </p>
          <p className="muted">Files like this are opened by the program your computer uses for them.</p>
          <button className="primary" onClick={openOutside}>Open with default application</button>
        </div>
      )}
      {image && (
        <div className="fileview-body fileview-image">
          <img src={image} alt={info?.name ?? ''} />
        </div>
      )}
      {text && info && (
        <div className="fileview-body" ref={body} onMouseUp={onMouseUp} onScroll={() => setPick(null)}>
          {text.truncated && <p className="hint">Only the first 2 MB are shown.</p>}
          {info.kind === 'markdown' ? <Markdown text={text.body} agentId={agentId} /> : <Code text={text.body} lang={languageFor(info.name)} className="fileview-code" />}
          {pick && (
            <button className="ask-selection fileview-ask" style={{ left: pick.x, top: pick.y }} onMouseDown={(e) => e.preventDefault()} onClick={addContext} title={`Add the selection to your message (${keysOf('add-selection')})`}>
              Add selection to message
            </button>
          )}
        </div>
      )}
    </div>
  )
}
