import { useEffect, useMemo, useRef, useState } from 'react'
import type { DevServer } from '../../shared/api'
import { PICKER_SOURCE, PICK_MARK, contextText, type PickedElement } from './picker'
import { DEVICES, USER_AGENT, fitScale, sizeOf, viewOf, type DeviceKind } from './devices'
import { MAX_VISITS, addVisit, ago, completion, forget, suggest, type Visit } from './addressHistory'
import { OutlineIcon } from './IconButton'
import { pageLabels } from '../files/context'
import { PREVIEW_EVENT, isPreviewable, localAddress } from '../links'

// The subset of the <webview> element used here.
interface WebviewEl extends HTMLElement {
  reload(): void
  goBack(): void
  goForward(): void
  canGoBack(): boolean
  canGoForward(): boolean
  getURL(): string
  getZoomFactor(): number
  loadURL(url: string): Promise<void>
  getUserAgent(): string
  setUserAgent(ua: string): void
  executeJavaScript(code: string): Promise<unknown>
  capturePage(rect?: { x: number; y: number; width: number; height: number }): Promise<{ toDataURL(): string; isEmpty(): boolean }>
}

/** What was opened in this project's Preview before, kept on this computer so an address can be picked instead of typed. */
const historyKey = (folder: string) => `aw.preview.history:${folder}`
function loadHistory(folder: string): Visit[] {
  try {
    const list = JSON.parse(localStorage.getItem(historyKey(folder)) ?? '[]') as Visit[]
    return Array.isArray(list) ? list.filter((v) => v && typeof v.url === 'string').slice(0, MAX_VISITS) : []
  } catch {
    return []
  }
}

/**
 * The address bar: shows where the page is, and typing in it opens another address. A list under it offers the dev servers
 * running now and the pages opened before, narrowed as you type, with the best match completed in grey (Tab or → takes it).
 */
function AddressField({ agentId, shown, state, live, history, onForget }: { agentId: string; shown: string; state?: 'up' | 'down'; live: { url: string; title: string }[]; history: Visit[]; onForget: (url: string) => void }) {
  const [typed, setTyped] = useState<string | null>(null)
  const [bad, setBad] = useState(false)
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState(0)
  const [moved, setMoved] = useState(false)
  const q = typed ?? ''
  const sug = useMemo(() => suggest(history, live, q), [history, live, q])
  const rows = [...sug.live, ...sug.recent]
  const rest = typed ? completion(typed, rows[0]?.url) : ''
  const now = Date.now()
  const go = (raw: string) => {
    const url = localAddress(raw)
    setBad(!url)
    if (!url) return
    // The same path a link in the chat takes, so a server already listed is switched to and anything else is shown by its own address.
    window.dispatchEvent(new CustomEvent(PREVIEW_EVENT, { detail: { agentId, url } }))
    setTyped(null)
    setOpen(false)
  }
  const close = () => {
    setOpen(false)
    setTyped(null)
    setMoved(false)
  }
  const bare = (u: string) => u.replace(/^https?:\/\//, '')
  const row = (r: (typeof rows)[number], i: number) => (
    <div key={r.url} role="option" aria-selected={i === at} className={`pa-row ${i === at ? 'on' : ''}`} onMouseDown={(e) => (e.preventDefault(), go(r.url))} onMouseMove={() => setAt(i)}>
      <i className={`pa-dot ${r.live ? 'live' : ''}`} aria-hidden="true" />
      <span className="pa-url">{bare(r.url)}</span>
      <span className="pa-title">{r.title}</span>
      <span className="pa-when">{r.live ? 'running' : ago(r.at, now)}</span>
      {!r.live && <button type="button" className="pa-x" tabIndex={-1} aria-label={`Forget ${bare(r.url)}`} title="Forget this address" onMouseDown={(e) => (e.preventDefault(), e.stopPropagation(), onForget(r.url))}>✕</button>}
    </div>
  )
  return (
    <div className="pa">
      {state && <span className={`preview-state ${state}`} role="status" title={state === 'up' ? 'The page is running' : 'Nothing is answering at this address'}><span className="sr-only">{state === 'up' ? 'running' : 'not answering'}</span></span>}
      <div className="pa-ghost" aria-hidden="true"><i>{typed ?? ''}</i>{rest}</div>
      <input
        className="pa-input"
        value={typed ?? shown}
        onFocus={(e) => (setOpen(true), e.currentTarget.select())}
        onClick={() => setOpen(true)}
        onBlur={() => setTimeout(close, 100)}
        onChange={(e) => (setTyped(e.target.value), setBad(false), setOpen(true), setAt(0), setMoved(false))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') (e.preventDefault(), setOpen(true), setAt((i) => Math.min(rows.length - 1, i + 1)), setMoved(true))
          else if (e.key === 'ArrowUp') (e.preventDefault(), setAt((i) => Math.max(0, i - 1)), setMoved(true))
          else if ((e.key === 'Tab' || e.key === 'ArrowRight') && rest && e.currentTarget.selectionStart === e.currentTarget.value.length) (e.preventDefault(), setTyped(rows[0]!.url.replace(/^https?:\/\//, '')), setAt(0))
          else if (e.key === 'Enter') {
            e.preventDefault()
            if (moved && rows[at]) go(rows[at]!.url)
            else if (typed?.trim()) go(typed)
            else if (rows[at]) go(rows[at]!.url)
          } else if (e.key === 'Escape' && (open || typed !== null)) (e.preventDefault(), e.stopPropagation(), close(), e.currentTarget.blur())
        }}
        placeholder="Open a local address, like 5287 or localhost:3000/app"
        aria-label="Local address to preview"
        aria-invalid={bad}
        aria-expanded={open}
        aria-controls="preview-suggestions"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
      />
      {open && (
        <div className="pa-list" id="preview-suggestions" role="listbox" aria-label="Addresses">
          {sug.live.length > 0 && <h5>Running now</h5>}
          {sug.live.map((r, i) => row(r, i))}
          {sug.recent.length > 0 && <h5>Recent</h5>}
          {sug.recent.map((r, i) => row(r, sug.live.length + i))}
          {rows.length === 0 && <p className="pa-none">{typed ? 'No address here yet. Press Enter to open it.' : 'No pages opened here yet. Type an address, like 5173.'}</p>}
          <p className="pa-keys"><span>↑↓ choose</span><span>Tab complete</span><span>Enter open</span><span>Esc close</span></p>
        </div>
      )}
      {bad && <span className="preview-bad" role="alert">Only addresses on this computer, like localhost:3000.</span>}
    </div>
  )
}

/** The picture of what was picked, no wider than needed: a bigger one costs the agent more to look at and shows nothing more. */
const PICTURE_MAX = 640
async function shrunk(dataUrl: string): Promise<Blob | null> {
  const img = new Image()
  img.src = dataUrl
  await img.decode()
  const k = Math.min(1, PICTURE_MAX / img.naturalWidth)
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(img.naturalWidth * k))
  c.height = Math.max(1, Math.round(img.naturalHeight * k))
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  return new Promise((r) => c.toBlob(r, 'image/png'))
}

/** The page itself. Only the address it is made with matters: later moves are the page's own, and a new size makes a new one. */
function Frame({ url, ua, viewRef }: { url: string; ua?: string; viewRef: { current: WebviewEl | null } }) {
  const [src] = useState(url)
  return <webview ref={viewRef as never} src={src} useragent={ua} className="preview-frame" partition="preview" />
}

/** The dev servers this agent has started, shown live. The page runs in a locked-down webview that can only reach local addresses. */
export function PreviewView({ servers, agentName, agentId, folder, onAttached, target }: { servers: DevServer[]; agentName: string; agentId: string; folder: string; onAttached: () => void; target?: { url: string; n: number } }) {
  const [picking, setPicking] = useState(false)
  const [port, setPort] = useState<number | null>(null)
  const view = useRef<WebviewEl | null>(null)
  const ready = useRef(false)
  // The screen size the page is shown at, kept for each agent; desktop is the panel's own width and the rest are real devices scaled to fit.
  const devKey = `aw.preview.device:${agentId}`
  const [dev, setDev] = useState<{ kind: DeviceKind; preset: string; rotated: boolean }>(() => {
    try {
      const d = JSON.parse(localStorage.getItem(devKey) ?? 'null') as { kind: DeviceKind; preset: string; rotated: boolean } | null
      return d && d.kind in DEVICES ? d : { kind: 'desktop', preset: '', rotated: false }
    } catch {
      return { kind: 'desktop', preset: '', rotated: false }
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(devKey, JSON.stringify(dev))
    } catch {
      /* the choice just is not kept */
    }
  }, [devKey, dev])
  const [devMenu, setDevMenu] = useState(false)
  const devWrap = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!devMenu) return
    const away = (e: MouseEvent) => !devWrap.current?.contains(e.target as Node) && setDevMenu(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), setDevMenu(false))
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', esc, true)
    return () => {
      window.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', esc, true)
    }
  }, [devMenu])
  const size = sizeOf(dev.kind, dev.preset, dev.rotated)
  // The page's zoom (the app opens at 120%): a device of 390 px must be 390 × zoom wide here for the page to see 390.
  const [zoom, setZoom] = useState(1)
  const holder = useRef<HTMLDivElement>(null)
  const [room, setRoom] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = holder.current
    if (!el) return
    const look = () => setRoom((r) => (r.w === el.clientWidth && r.h === el.clientHeight ? r : { w: el.clientWidth, h: el.clientHeight }))
    look()
    const ro = new ResizeObserver(look)
    ro.observe(el)
    return () => ro.disconnect()
  })
  // Where the page is, whether it can go back or forward, and the pages opened here, for the address bar.
  const [shownAt, setShownAt] = useState({ base: '', url: '' })
  const [nav, setNav] = useState({ back: false, forward: false })
  const [history, setHistory] = useState<Visit[]>(() => loadHistory(folder))
  useEffect(() => {
    try {
      localStorage.setItem(historyKey(folder), JSON.stringify(history))
    } catch {
      /* the list just is not kept */
    }
  }, [folder, history])
  const currentUrl = useRef('')
  const [error, setError] = useState<string | null>(null)
  // A link clicked in the chat opens here, whether or not the agent started that server.
  const [opened, setOpened] = useState<string | null>(null)
  const known = opened ? servers.find((s) => new URL(opened).port === String(s.port)) : undefined
  const askedPort = opened && !known ? Number(new URL(opened).port) || 80 : null
  // An address that was typed or clicked is not one the app has been watching, so it is looked at here: is anything answering?
  const [askedUp, setAskedUp] = useState(true)
  useEffect(() => {
    if (askedPort === null) return
    let alive = true
    const look = () => void window.aw.probePort(askedPort).then((up) => alive && setAskedUp(up))
    look()
    const t = setInterval(look, 2000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [askedPort])
  const asked: DevServer | undefined = opened && askedPort !== null ? { port: askedPort, url: opened, alive: askedUp } : undefined
  const current = asked ?? servers.find((s) => s.port === port) ?? servers.find((s) => s.alive) ?? servers[0]
  currentUrl.current = current?.url ?? ''
  const shown = current && shownAt.base === current.url ? shownAt.url : ''
  // Each screen size is a page of its own: a page given its size when it is made is the way to be sure the page sees that size.
  const frameKey = `${current?.url}|${dev.kind}|${dev.preset}|${dev.rotated}`
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
    const look = () => {
      try {
        setNav({ back: el.canGoBack(), forward: el.canGoForward() })
        setZoom(el.getZoomFactor())
      } catch {
        /* the page is not ready to be asked */
      }
    }
    const up = () => ((ready.current = true), look())
    // A page opened or followed here is remembered, and its title is added when it arrives.
    const visited = (e: Event) => {
      const ev = e as Event & { url?: string; isMainFrame?: boolean }
      if (ev.isMainFrame === false || !ev.url) return
      setShownAt({ base: currentUrl.current, url: ev.url })
      setHistory((h) => addVisit(h, { url: ev.url!, title: '', at: Date.now() }))
      look()
    }
    const titled = (e: Event) => {
      const title = (e as Event & { title?: string }).title ?? ''
      try {
        const url = el.getURL()
        if (title && url) setHistory((h) => addVisit(h, { url, title, at: Date.now() }))
      } catch {
        /* the page went away */
      }
    }
    el.addEventListener('dom-ready', up)
    el.addEventListener('did-fail-load', fail)
    el.addEventListener('did-finish-load', ok)
    el.addEventListener('did-navigate', visited)
    el.addEventListener('did-navigate-in-page', visited)
    el.addEventListener('page-title-updated', titled)
    return () => {
      el.removeEventListener('dom-ready', up)
      el.removeEventListener('did-fail-load', fail)
      el.removeEventListener('did-finish-load', ok)
      el.removeEventListener('did-navigate', visited)
      el.removeEventListener('did-navigate-in-page', visited)
      el.removeEventListener('page-title-updated', titled)
    }
  }, [frameKey, current?.alive])

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
        // The picture is asked for in the page's zoomed pixels (the app opens at 120%), the rectangle comes in the page's own.
        const k = el.getZoomFactor()
        const r = picked.rect
        const img = await el.capturePage({ x: Math.round(r.x * k), y: Math.round(r.y * k), width: Math.round(r.width * k), height: Math.round(r.height * k) })
        if (!img.isEmpty()) {
          const blob = await shrunk(img.toDataURL())
          if (blob) file = new File([blob], `${picked.tag}-picked.png`, { type: 'image/png' })
        }
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
      // The view it was seen in: the device chosen, and the size of the page's window as the page itself sees it.
      let seen = { w: 0, h: 0 }
      try {
        const [w, h] = (await el.executeJavaScript('[innerWidth, innerHeight]')) as [number, number]
        seen = { w, h }
      } catch {
        /* the label then has no size */
      }
      window.dispatchEvent(new CustomEvent('aw-context', { detail: { agentId, text: contextText(picked), file, label: `${picked.tag} on ${page}`, view: viewOf(dev.kind, seen) } }))
      onAttached()
    }
    el.addEventListener('console-message', heard)
    return () => el.removeEventListener('console-message', heard)
  }, [frameKey, current?.alive, agentId, onAttached, dev.kind])
  const togglePick = () => {
    const el = view.current
    if (!el) return
    if (picking) void el.executeJavaScript("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))")
    else void el.executeJavaScript(PICKER_SOURCE).then(() => setPicking(true))
    if (picking) setPicking(false)
  }

  const forgetVisit = (url: string) => setHistory((h) => forget(h, url))
  const live = servers.filter((s) => s.alive).map((s) => ({ url: s.url, title: '' }))

  if (!current)
    return (
      <div className="preview empty">
        <p className="hint">
          When {agentName} starts a dev server (Vite, Next, a Python or Node app…), its page appears here. Ask it to run the project and preview it, or open an address yourself.
        </p>
        <div className="preview-nav">
          <AddressField agentId={agentId} shown="" live={live} history={history} onForget={forgetVisit} />
        </div>
      </div>
    )

  const k = size ? fitScale(size.w * zoom, size.h * zoom, room.w, room.h) : 1
  const frame = size ? { width: size.w * zoom, height: size.h * zoom, transform: `scale(${k})`, marginBottom: size.h * zoom * (k - 1) } : undefined
  const DEVICE_ICON = { desktop: 'desktop', tablet: 'tablet', mobile: 'phone' } as const
  const presets = DEVICES[dev.kind].presets
  return (
    <div className="preview">
      <div className="preview-nav">
        <button onClick={() => view.current?.goBack()} disabled={!nav.back} aria-label="Back" title="Back">
          <OutlineIcon name="back" />
        </button>
        <button onClick={() => view.current?.goForward()} disabled={!nav.forward} aria-label="Forward" title="Forward">
          <OutlineIcon name="forward" />
        </button>
        <button onClick={() => view.current?.reload()} aria-label="Reload" title="Reload the page">
          <OutlineIcon name="reload" />
        </button>
        <AddressField agentId={agentId} shown={shown || current.url} state={current.alive ? 'up' : 'down'} live={live} history={history} onForget={forgetVisit} />
        <span className="preview-dev" ref={devWrap}>
          <button className="dev-btn" aria-haspopup="menu" aria-expanded={devMenu} aria-label={`Screen size: ${DEVICES[dev.kind].label}`} title="Screen size: see the page as it looks on a tablet or phone" onClick={() => setDevMenu((o) => !o)}>
            <OutlineIcon name={DEVICE_ICON[dev.kind]} />
            <span className="dev-label">{DEVICES[dev.kind].label}</span>
          </button>
          {devMenu && (
            <div className="dev-menu" role="menu">
              {(Object.keys(DEVICES) as DeviceKind[]).map((kind) => (
                <button key={kind} role="menuitemradio" aria-checked={dev.kind === kind} className={dev.kind === kind ? 'on' : ''} onClick={() => (setDev({ kind, preset: DEVICES[kind].presets[0]?.name ?? '', rotated: false }), setDevMenu(false))}>
                  <OutlineIcon name={DEVICE_ICON[kind]} />
                  {DEVICES[kind].label}
                  <small>{DEVICES[kind].blurb}</small>
                </button>
              ))}
            </div>
          )}
        </span>
        <button className={picking ? 'primary' : ''} aria-pressed={picking} onClick={togglePick} aria-label={picking ? 'Click an element…' : 'Select element'} title={picking ? 'Click an element on the page… (Esc cancels)' : 'Select element: point at something on the page to send it to the agent as context (Esc cancels)'}>
          <OutlineIcon name="pointer" />
        </button>
        <button onClick={() => void window.aw.openExternal(current.url)} aria-label="Open in browser" title="Open in your browser">
          <OutlineIcon name="external" />
        </button>
      </div>
      {/* Nothing answering, or a page that would not load: say so here instead of showing a blank white page. */}
      {(!current.alive || error) && (
        <div className="preview-down" role="status">
          <b>{!current.alive ? `Nothing is answering at ${new URL(current.url).host}` : 'The page did not load'}</b>
          <p>
            {!current.alive
              ? `Start the dev server there, or ask ${agentName} to run the project. The page appears here on its own as soon as something answers.`
              : `${error}. The server answered but the page could not be shown.`}
          </p>
          {current.alive && (
            <button onClick={() => (setError(null), view.current?.reload())}>Try again</button>
          )}
        </div>
      )}
      {/* The caption names a tablet or phone, its size and how much it is shrunk; there is none for desktop, so it takes no room there. */}
      {current.alive && !error && size && (
        <div className="preview-cap">
          <span className="cap-name">{DEVICES[dev.kind].label}</span>
          <select value={dev.preset} aria-label="Device" onChange={(e) => setDev({ ...dev, preset: e.target.value })}>
            {presets.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name} · {p.w}×{p.h}
              </option>
            ))}
          </select>
          <button onClick={() => setDev({ ...dev, rotated: !dev.rotated })} aria-pressed={dev.rotated} title="Turn it on its side" aria-label="Turn it on its side">
            <OutlineIcon name="reload" size={12} /> <span className="cap-text">rotate</span>
          </button>
          <span>{Math.round(k * 100)}%</span>
        </div>
      )}
      {/* Keyed by address so each server gets a fresh, isolated page; it is only there while something answers. */}
      {current.alive && (
        <div className="preview-holder" ref={holder} style={error ? { display: 'none' } : undefined}>
          <div className={`device-frame is-${dev.kind}`} style={frame}>
            <Frame key={frameKey} url={shown || current.url} ua={dev.kind === 'desktop' ? undefined : USER_AGENT[dev.kind]} viewRef={view} />
          </div>
        </div>
      )}
    </div>
  )
}
