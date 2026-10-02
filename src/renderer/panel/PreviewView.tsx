import { useEffect, useRef, useState } from 'react'
import type { DevServer } from '../../shared/api'
import { PICKER_SOURCE, PICK_MARK, contextText, type PickedElement } from './picker'
import { pageLabels } from '../files/context'
import { isPreviewable } from '../links'

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
export function PreviewView({ servers, agentName, agentId, onAttached, target }: { servers: DevServer[]; agentName: string; agentId: string; onAttached: () => void; target?: { url: string; n: number } }) {
  const [picking, setPicking] = useState(false)
  const [port, setPort] = useState<number | null>(null)
  const view = useRef<WebviewEl | null>(null)
  const ready = useRef(false)
  const [error, setError] = useState<string | null>(null)
  // A link clicked in the chat opens here, whether or not the agent started that server.
  const [opened, setOpened] = useState<string | null>(null)
  const known = opened ? servers.find((s) => new URL(opened).port === String(s.port)) : undefined
  const asked: DevServer | undefined = opened && !known ? { port: Number(new URL(opened).port) || 80, url: opened, alive: true } : undefined
  const current = asked ?? servers.find((s) => s.port === port) ?? servers.find((s) => s.alive) ?? servers[0]
  useEffect(() => {
    if (!target || !isPreviewable(target.url)) return
    const u = new URL(target.url)
    const match = servers.find((s) => String(s.port) === u.port)
    // Another page on a server already shown: go there in place. Anything else is shown by its own address.
    if (match) {
      setOpened(null)
      setPort(match.port)
      // A webview only answers getURL and loadURL once it has loaded something, so a fresh one is told after it has.
      const el = view.current
      const go = () => {
        try {
          if (el && el.getURL() !== target.url) void el.loadURL(target.url).catch(() => {})
        } catch {
          /* it went away before it was ready */
        }
      }
      if (ready.current) go()
      else el?.addEventListener('dom-ready', go, { once: true })
    } else setOpened(target.url)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.n])

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
    ready.current = false
    const up = () => (ready.current = true)
    el.addEventListener('dom-ready', up)
    el.addEventListener('did-fail-load', fail)
    el.addEventListener('did-finish-load', ok)
    return () => {
      el.removeEventListener('dom-ready', up)
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
      // A page shown from a file is named after the file, not the temporary address it is served at.
      picked.url = pageLabels.get(picked.url) ?? picked.url
      let file: File | null = null
      try {
        const img = await el.capturePage(picked.rect)
        if (!img.isEmpty()) file = new File([Uint8Array.from(atob(img.toDataURL().split(',')[1]!), (c) => c.charCodeAt(0))], `${picked.tag}-picked.png`, { type: 'image/png' })
      } catch {
        /* the words alone still go */
      }
      let page = picked.url
      try {
        const u = new URL(picked.url)
        page = `${u.host}${u.pathname === '/' ? '' : u.pathname}`
      } catch {
        /* the address as it came is label enough */
      }
      window.dispatchEvent(new CustomEvent('aw-context', { detail: { agentId, text: contextText(picked), file, label: `${picked.tag} on ${page}` } }))
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
