import { useEffect, useRef, useState } from 'react'
import type { DevServer } from '../../shared/api'

// The subset of the <webview> element used here.
interface WebviewEl extends HTMLElement {
  reload(): void
  goBack(): void
  goForward(): void
  canGoBack(): boolean
  canGoForward(): boolean
  getURL(): string
  loadURL(url: string): Promise<void>
}

/** The dev servers this agent has started, shown live. The page runs in a locked-down webview that can only reach local addresses. */
export function PreviewView({ servers, agentName }: { servers: DevServer[]; agentName: string }) {
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
        <button onClick={() => void window.aw.openExternal(current.url)}>Open in browser</button>
      </div>
      {error && <p className="preview-error">{error}</p>}
      {/* Keyed by address so each server gets a fresh, isolated page. */}
      <webview key={current.url} ref={view as never} src={current.url} className="preview-frame" partition="preview" />
    </div>
  )
}
