import { useEffect, useRef, useState } from 'react'
import { ADD_SELECTION_EVENT } from '../addSelection'
import { IconButton } from '../panel/IconButton'
import { cellsContext, wordsContext } from './selection'
import { gridOf, parseFrameMessage } from './frameMessage'
import { readTheme, saveTheme, type OfficeTheme } from './theme'
import { ZOOMS, zoomLabel, zoomStep, type Zoom } from './zoom'

const size = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)

/**
 * A Word, Excel, PowerPoint or CSV file, read-only. The file is drawn by a page of its own in a sandboxed frame (scripts, but no network and
 * no access to the app), which is sent the bytes and tells back only a checked selection, a search count or an error.
 * One bar of icon buttons holds find (also ⌘F), zoom, the paper or dark look and opening in the computer's own program; the file view
 * adds the file's name and a close button at its ends, and the Code tab a way back to a CSV's text.
 */
export function OfficeView({ agentId, path, name, fileSize, onClose, onOutside, onText, onAttached, reload = 0 }: { agentId: string; path: string; name: string; fileSize?: number; onClose?: () => void; onOutside?: () => void; onText?: () => void; onAttached?: () => void; reload?: number }) {
  const root = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const findBox = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState('')
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [theme, setTheme] = useState<OfficeTheme>(() => readTheme())
  const [zoom, setZoom] = useState<Zoom>('width')
  const [menu, setMenu] = useState(false)
  const [kind, setKind] = useState('')
  const [presenting, setPresenting] = useState(false)
  const [finding, setFinding] = useState(false)
  const [q, setQ] = useState('')
  const [found, setFound] = useState({ count: 0, index: 0 })
  const selecting = useRef(false)
  const themeRef = useRef(theme)
  themeRef.current = theme
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const tell = (m: Record<string, unknown>, transfer: Transferable[] = []) => frame.current?.contentWindow?.postMessage(m, '*', transfer)

  useEffect(() => {
    let alive = true
    void window.aw.officeUrl().then((u) => alive && setUrl(u))
    return () => {
      alive = false
    }
  }, [])

  // Each time the frame has loaded, or the file changes, the bytes go in.
  useEffect(() => {
    if (!ready) return
    let alive = true
    setError('')
    setFound({ count: 0, index: 0 })
    window.aw.fileBytes(agentId, path).then(
      (r) => {
        if (!alive) return
        const buf = r.bytes.buffer.slice(r.bytes.byteOffset, r.bytes.byteOffset + r.bytes.byteLength) as ArrayBuffer
        setKind(r.info.kind)
        tell({ t: 'load', kind: r.info.kind, name, bytes: buf, theme: themeRef.current, zoom: zoomRef.current }, [buf])
      },
      (e: Error) => alive && setError(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the file, a reload, or the frame being ready
  }, [ready, agentId, path, name, reload])

  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return
      const m = parseFrameMessage(e.data)
      if (!m) return
      if (m.t === 'ready') setReady(true)
      else if (m.t === 'selection') selecting.current = m.on
      else if (m.t === 'present') {
        setPresenting(m.on)
        if (!m.on && document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
      }
      else if (m.t === 'key') window.dispatchEvent(new KeyboardEvent('keydown', { key: m.key, code: m.code, metaKey: m.meta, ctrlKey: m.ctrl, shiftKey: m.shift, altKey: m.alt, bubbles: true, cancelable: true }))
      else if (m.t === 'found') setFound({ count: m.count, index: m.index })
      else if (m.t === 'error') setError('This file could not be read. It may be damaged, password-protected or not what its name says.')
      else {
        const picked = m.t === 'words' ? wordsContext(name, m.text, m.where) : m.t === 'cells' ? cellsContext(name, m.sheet, gridOf(m), { r1: m.r1, c1: m.c1, r2: m.r2, c2: m.c2 }) : null
        if (!picked) return
        window.dispatchEvent(new CustomEvent('aw-context', { detail: { agentId, text: picked.text, file: null, label: picked.label } }))
        onAttached?.()
      }
    }
    window.addEventListener('message', on)
    return () => window.removeEventListener('message', on)
  }, [agentId, name, onAttached])

  // The key for "add the selection to the message" works when the frame has something selected.
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ handled: boolean }>).detail
      if (d.handled || !selecting.current) return
      d.handled = true
      tell({ t: 'add' })
    }
    window.addEventListener(ADD_SELECTION_EVENT, on)
    return () => window.removeEventListener(ADD_SELECTION_EVENT, on)
  }, [])

  // ⌘F / Ctrl+F finds in this file while it is showing (the frame passes the key up when it has the focus).
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'f' || !root.current || root.current.offsetParent === null) return
      e.preventDefault()
      setFinding(true)
      setTimeout(() => (findBox.current?.focus(), findBox.current?.select()), 0)
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [])

  // Leaving full screen (Esc, or the system's way) ends present mode in the frame too.
  useEffect(() => {
    const on = () => {
      if (!document.fullscreenElement && presenting) {
        setPresenting(false)
        tell({ t: 'present', on: false })
      }
    }
    // Esc also ends it when the focus is outside the frame, on the button that started it.
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !presenting) return
      setPresenting(false)
      tell({ t: 'present', on: false })
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    }
    document.addEventListener('fullscreenchange', on)
    window.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('fullscreenchange', on)
      window.removeEventListener('keydown', esc)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the frame handle is a ref
  }, [presenting])

  // The zoom menu closes on a click elsewhere, or Esc.
  useEffect(() => {
    if (!menu) return
    const away = (e: MouseEvent) => !(e.target as Element | null)?.closest?.('.officeview-zoomwrap') && setMenu(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false)
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', esc)
    }
  }, [menu])

  // Another file starts fitted to the width again.
  useEffect(() => {
    setZoom('width')
    setMenu(false)
    setQ('')
    setFinding(false)
  }, [path])

  const choose = (t: OfficeTheme) => {
    setTheme(t)
    saveTheme(t)
    tell({ t: 'theme', theme: t })
  }
  const search = (text: string, dir: -1 | 0 | 1) => {
    setQ(text)
    tell({ t: 'find', q: text, dir })
  }
  const closeFind = () => {
    setFinding(false)
    search('', 0)
  }
  const zoomTo = (z: Zoom) => {
    setZoom(z)
    setMenu(false)
    tell({ t: 'zoom', z })
  }
  // A sheet has nothing to fit, so it shows 100% until zoomed.
  const shown: Zoom = kind === 'sheet' && typeof zoom !== 'number' ? 1 : zoom
  const present = () => {
    void frame.current?.requestFullscreen?.().catch(() => undefined)
    setPresenting(true)
    tell({ t: 'present', on: true })
    // The keys that move through the slides go to the frame.
    frame.current?.focus()
    frame.current?.contentWindow?.focus()
  }
  const outside = onOutside ?? (() => void window.aw.openFileExternal(agentId, path).catch(() => undefined))

  return (
    <div className="officeview" ref={root}>
      <div className="officeview-bar">
        {onClose && (
          <>
            <b className="officeview-name" title={path}>{name}</b>
            {fileSize !== undefined && <span className="muted">{size(fileSize)}</span>}
          </>
        )}
        {finding ? (
          <>
            <input
              ref={findBox}
              type="search"
              className="officeview-find"
              placeholder="Find in this file…"
              aria-label={`Find in ${name}`}
              value={q}
              onChange={(e) => search(e.target.value, 0)}
              onKeyDown={(e) => (e.key === 'Enter' ? search(q, e.shiftKey ? -1 : 1) : e.key === 'Escape' && closeFind())}
            />
            {q && <span className="officeview-count" role="status">{found.count ? `${found.index} of ${found.count}` : 'No match'}</span>}
            <IconButton icon="up" label="Previous match" tip="Previous match (Shift+Enter)" onClick={() => search(q, -1)} disabled={!found.count} />
            <IconButton icon="chevron" label="Next match" tip="Next match (Enter)" onClick={() => search(q, 1)} disabled={!found.count} />
            <IconButton icon="cross" label="Close find" tip="Close find (Esc)" onClick={closeFind} />
          </>
        ) : (
          <IconButton icon="search" label="Find in this file" tip="Find (⌘F)" onClick={() => (setFinding(true), setTimeout(() => findBox.current?.focus(), 0))} />
        )}
        <span className="officeview-tools">
          <IconButton icon="minus" label="Zoom out" tip="Zoom out" onClick={() => zoomTo(zoomStep(shown, -1))} disabled={typeof shown === 'number' && shown <= 0.5} />
        <span className="officeview-zoomwrap">
          <button className="officeview-zoom" onClick={() => setMenu((v) => !v)} aria-haspopup="menu" aria-expanded={menu} title="Zoom">
            {zoomLabel(shown)} ▾
          </button>
          {menu && (
            <div className="officeview-menu" role="menu" aria-label="Zoom">
              {(kind === 'word' || kind === 'slides' ? (['width', 'page'] as Zoom[]) : []).concat(ZOOMS).map((z) => (
                <button key={String(z)} role="menuitemradio" aria-checked={z === shown} onClick={() => zoomTo(z)}>
                  {zoomLabel(z)}
                  {z === shown && <span aria-hidden>✓</span>}
                </button>
              ))}
            </div>
          )}
        </span>
        <IconButton icon="plus" label="Zoom in" tip="Zoom in" onClick={() => zoomTo(zoomStep(shown, 1))} disabled={typeof shown === 'number' && shown >= 3} />
        <IconButton icon={theme === 'dark' ? 'sun' : 'moon'} label={theme === 'dark' ? 'Show as made' : 'Dark look'} tip={theme === 'dark' ? 'Show the file as it was made' : 'Show the file in the app’s dark colours'} pressed={theme === 'dark'} onClick={() => choose(theme === 'dark' ? 'paper' : 'dark')} />
          {kind === 'slides' && <IconButton icon="present" label="Present" tip="Present: one slide fills the screen" pressed={presenting} onClick={present} />}
        {onText && <IconButton icon="code" label="View as text" tip="View the file as text" onClick={onText} />}
          <IconButton icon="external" label="Open with default app" tip="Open with the program this computer uses for it" onClick={outside} />
          {onClose && <IconButton icon="cross" label="Close file" tip="Close" onClick={onClose} />}
        </span>
      </div>
      {error && <p className="hint bad" role="alert">{error}</p>}
      {url && <iframe ref={frame} className="officeview-frame" title={`${name}`} src={url} sandbox="allow-scripts" style={error ? { display: 'none' } : undefined} />}
    </div>
  )
}
