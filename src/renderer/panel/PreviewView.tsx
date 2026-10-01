import { useEffect, useRef, useState } from 'react'
import type { DevServer } from '../../shared/api'
import { PICKER_SOURCE, PICK_MARK, contextText, type PickedElement } from './picker'

// The subset of the <webview> element used here.
interface WebviewEl extends HTMLElement {
  reload(): void
  goBack(): void
  goForward(): void
  canGoBack(): boolean
  canGoForward(): boolean
  getURL(): string
  loadURL(url: string): Promise<void>
  executeJavaScript(code: string): Promise<unknown>
  capturePage(rect?: { x: number; y: number; width: number; height: number }): Promise<{ toDataURL(): string; isEmpty(): boolean }>
}

/** The dev servers this agent has started, shown live. The page runs in a locked-down webview that can only reach local addresses. */
export function PreviewView({ servers, agentName, agentId, onAttached }: { servers: DevServer[]; agentName: string; agentId: string; onAttached: () => void }) {
  const [picking, setPicking] = useState(false)
  const [port, setPort] = useState<number | null>(null)
  const view = useRef<WebviewEl | null>(null)
  const [error, setError] = useState<string | null>(null)
  const current = servers.find((s) => s.port === port) ?? servers.find((s) => s.alive) ?? servers[0]

  useEffect(() => {
    if (current && port === null) setPort(current.port)
  }, [current, port])

  useEffect(() => {
    const el = view.current
    if (!el) return
    const fail = (e: Event) => {
      const ev = e as Event & { errorDescription?: string; errorCode?: number }
      // -3 is a navigation interrupted by another one; not a failure worth showing.
      if (ev.errorCode !== -3) setError(ev.errorDescription ?? 'The page did not load.')
    }
    const ok = () => setError(null)
    el.addEventListener('did-fail-load', fail)
    el.addEventListener('did-finish-load', ok)
    return () => {
      el.removeEventListener('did-fail-load', fail)
      el.removeEventListener('did-finish-load', ok)
    }
  }, [current?.url])

  // Point at something on the page: it goes into the message box as words plus a picture of it.
  useEffect(() => {
    const el = view.current
    if (!el) return
    const heard = async (e: Event) => {
      const msg = (e as Event & { message?: string }).message ?? ''
      if (!msg.startsWith(PICK_MARK)) return
      setPicking(false)
      const picked = JSON.parse(msg.slice(PICK_MARK.length)) as PickedElement | null
      if (!picked) return
      let file: File | null = null
      try {
        const img = await el.capturePage(picked.rect)
        if (!img.isEmpty()) file = new File([Uint8Array.from(atob(img.toDataURL().split(',')[1]!), (c) => c.charCodeAt(0))], `${picked.tag}-picked.png`, { type: 'image/png' })
      } catch {
        /* the words alone still go */
      }
      window.dispatchEvent(new CustomEvent('aw-context', { detail: { agentId, text: contextText(picked), file } }))
      onAttached()
    }
    el.addEventListener('console-message', heard)
    return () => el.removeEventListener('console-message', heard)
  }, [current?.url, agentId, onAttached])
  const togglePick = () => {
    const el = view.current
    if (!el) return
    if (picking) void el.executeJavaScript("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))")
    else void el.executeJavaScript(PICKER_SOURCE).then(() => setPicking(true))
    if (picking) setPicking(false)
  }

  if (!current)
    return (
      <div className="preview empty">
        <p className="hint">
          When {agentName} starts a dev server (Vite, Next, a Python or Node app…), its page appears here. Ask it to run the project and preview it.
        </p>
      </div>
    )

  return (
    <div className="preview">
      <div className="preview-bar">
        {servers.length > 1 ? (
          <select aria-label="Dev server" value={current.port} onChange={(e) => setPort(Number(e.target.value))}>
            {servers.map((s) => (
              <option key={s.port} value={s.port}>
                {s.url}
              </option>
            ))}
          </select>
        ) : (
          <code className="preview-url">{current.url}</code>
        )}
        <span className={`preview-state ${current.alive ? 'up' : 'down'}`}>{current.alive ? 'running' : 'not answering'}</span>
        <button onClick={() => view.current?.goBack()} aria-label="Back">
          Back
        </button>
        <button onClick={() => view.current?.reload()} aria-label="Reload">
          Reload
        </button>
        <button className={picking ? 'primary' : ''} aria-pressed={picking} onClick={togglePick} title="Point at something on the page to send it to the agent as context (Esc cancels)">
          {picking ? 'Click an element…' : 'Select element'}
        </button>
        <button onClick={() => void window.aw.openExternal(current.url)}>Open in browser</button>
      </div>
      {error && <p className="preview-error">{error}</p>}
      {/* Keyed by address so each server gets a fresh, isolated page. */}
      <webview key={current.url} ref={view as never} src={current.url} className="preview-frame" partition="preview" />
    </div>
  )
}
