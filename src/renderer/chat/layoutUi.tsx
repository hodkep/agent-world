import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { OutlineIcon } from '../panel/IconButton'
import { DEFAULT_LAYOUT, type ChatLayout, type Pack } from '../../shared/chatLayout'
import { EMPTY_MOD, GUARD_CSS, isEmptyMod, type ChatMod, type ChatModState } from '../../shared/chatMod'
import { type FeedResult, type MeterName, type Meters, type Widget, type WidgetSlot, feedHost } from '../../shared/widgets'

// POC: the look an agent wrote for the chat. The main process holds it; this is the window's copy, kept current by what main announces.
const NONE: ChatModState = { current: EMPTY_MOD, draft: null, draftBy: null, draftWhy: '', history: 0, draftData: false }
let state: ChatModState = NONE
const listeners = new Set<() => void>()
let started = false
const set = (s: ChatModState) => {
  state = s
  listeners.forEach((l) => l())
}
function start() {
  if (started || !window.aw?.chatModState) return
  started = true
  void window.aw.chatModState().then(set, () => {})
  window.aw.onChatMod(set)
}
const subscribe = (cb: () => void) => {
  start()
  listeners.add(cb)
  return () => void listeners.delete(cb)
}
export const useChatModState = () => useSyncExternalStore(subscribe, () => state)

// While the compare button is held, the window shows the look in force instead of the draft.
let comparing = false
const compareListeners = new Set<() => void>()
const setComparing = (on: boolean) => {
  if (comparing === on) return
  comparing = on
  compareListeners.forEach((l) => l())
}
const useComparing = () =>
  useSyncExternalStore(
    (cb) => (compareListeners.add(cb), () => void compareListeners.delete(cb)),
    () => comparing
  )

/** The look on screen: the draft an agent is trying (the one in force while the compare button is held), else the one the person kept. */
export function useChatMod(): ChatMod {
  const s = useChatModState()
  const compare = useComparing()
  return s.draft && !compare ? s.draft : s.current
}
export const useChatLayout = (): ChatLayout => useChatMod().layout ?? DEFAULT_LAYOUT

/** The CSS of the look, with the guard after it that keeps the message box, a request waiting for you and the Keep and Undo bar showing. */
export function ModStyle() {
  const mod = useChatMod()
  useEffect(() => {
    const el = document.createElement('style')
    el.id = 'aw-mod-css'
    el.textContent = isEmptyMod(mod) || !mod.css ? '' : `${mod.css}\n${GUARD_CSS}`
    document.head.append(el)
    return () => el.remove()
  }, [mod.css])
  return null
}

/** While an agent's draft is on screen: who, what it says it did, and Keep or Undo. It stays until one of them is pressed. */
export function ModBar() {
  const s = useChatModState()
  const compare = useComparing()
  // A draft that goes away (Keep, Undo, a new one) must not leave the window stuck on the old look; so must a lost pointer or focus.
  useEffect(() => {
    if (!s.draft) setComparing(false)
  }, [s.draft])
  useEffect(() => {
    const off = () => setComparing(false)
    window.addEventListener('blur', off)
    window.addEventListener('pointerup', off)
    return () => (window.removeEventListener('blur', off), window.removeEventListener('pointerup', off))
  }, [])
  if (!s.draft) return null
  // A draft's widgets that ask to load something from the internet do not, until the person says so (or keeps the look): the bar says where from.
  const hosts = [...new Set(s.draft.widgets.flatMap((w) => w.fetch.map((f) => feedHost(f.url))))]
  return (
    <div className="mod-bar" role="status" aria-label="A new look for the chat" data-comparing={compare}>
      <span>
        {compare ? (
          <>
            Showing the <b>current</b> look. Let go to see the new one.
          </>
        ) : (
          <>
            <b>{s.draftBy ?? 'An agent'}</b> changed how the chat looks{s.draftWhy ? `: ${s.draftWhy}` : ''}
            {hosts.length > 0 && <small className="mod-hosts"> Loads data from {hosts.join(', ')}{s.draftData ? '' : ' once you allow it.'}</small>}
          </>
        )}
      </span>
      {hosts.length > 0 && !s.draftData && (
        <button onClick={() => void window.aw.chatModLoadData()} title={`Let this look load data from ${hosts.join(', ')} now, before you keep it`}>
          Load data
        </button>
      )}
      <button
        className="mod-compare"
        aria-label="Hold to compare with the current look"
        aria-pressed={compare}
        title="Hold to see the current look; let go to see the new one"
        onPointerDown={(e) => (e.currentTarget.setPointerCapture(e.pointerId), setComparing(true))}
        onPointerUp={() => setComparing(false)}
        onPointerCancel={() => setComparing(false)}
        onLostPointerCapture={() => setComparing(false)}
        onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), setComparing(true))}
        onKeyUp={() => setComparing(false)}
        onBlur={() => setComparing(false)}
      >
        <OutlineIcon name="eye" size={16} />
      </button>
      <button className="primary" onClick={() => void window.aw.chatModKeep()}>
        Keep
      </button>
      <button onClick={() => void window.aw.chatModUndo()}>Undo</button>
    </div>
  )
}

/** Two menu rows for the chat's "…" menu: the way back to the system look, and to the look before this one. */
export function LookRows({ close }: { close: () => void }) {
  const s = useChatModState()
  const custom = !isEmptyMod(s.current) || s.draft !== null
  return (
    <>
      <button role="menuitem" disabled={!custom} title="Remove every change an agent made to the look of the app" onClick={() => (close(), void window.aw.chatModReset())}>
        <span className="l">
          <OutlineIcon name="undo" size={14} />
          Restore system look
        </span>
      </button>
      <button role="menuitem" disabled={s.history === 0} title="Bring back the look before the last one you kept" onClick={() => (close(), void window.aw.chatModBack())}>
        <span className="l">
          <OutlineIcon name="history" size={14} />
          Previous look
        </span>
      </button>
    </>
  )
}

/** A folded group of rows: its icon, label and count, opening to the rows themselves. */
export function PackView<T>({ pack, draw }: { pack: Pack<T>; draw: (item: T) => ReactNode }) {
  const [open, setOpen] = useState(pack.open)
  const n = pack.items.length
  return (
    <div className={`lay-pack ${pack.place}`} data-pack={pack.label}>
      <button className="lay-chip" aria-expanded={open} onClick={() => setOpen((o) => !o)} title={`${n} ${pack.label}`}>
        <span aria-hidden="true">{pack.icon}</span>
        <b>{n}</b>
        <span className="lay-name">{pack.label}</span>
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="lay-body">{pack.items.map((i) => draw(i))}</div>}
    </div>
  )
}

// What the widgets' addresses answered, kept by `current:<id>` or `draft:<id>`; main tells us each time one loads.
let feedState: Record<string, Record<string, FeedResult>> = {}
const feedListeners = new Set<() => void>()
let feedsStarted = false
function startFeeds() {
  if (feedsStarted || !window.aw?.widgetFeeds) return
  feedsStarted = true
  const tell = () => feedListeners.forEach((l) => l())
  void window.aw.widgetFeeds().then((s) => ((feedState = s), tell()), () => {})
  window.aw.onWidgetFeed(({ key, feed, r }) => {
    feedState = { ...feedState, [key]: { ...feedState[key], [feed]: r } }
    tell()
  })
}
const useFeeds = () =>
  useSyncExternalStore(
    (cb) => (startFeeds(), feedListeners.add(cb), () => void feedListeners.delete(cb)),
    () => feedState
  )

const THEME_VARS = ['--bg', '--panel', '--panel-2', '--line', '--ink', '--text', '--muted', '--accent', '--ok', '--danger', '--think', '--violet', '--well']
const themeNow = () => {
  const cs = getComputedStyle(document.documentElement)
  return Object.fromEntries(THEME_VARS.map((v) => [v, cs.getPropertyValue(v).trim()]).filter(([, c]) => c))
}
// Changes the address when the page changes, so the frame loads the new one.
const stamp = (t: string) => [...t].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7).toString(36)

/**
 * A widget in its sandbox: a frame that may run script and nothing else (no same-origin, no forms, no popups, no navigation of the window) on an address of its own with a policy that forbids every connection.
 * Numbers and the theme's colours are sent into it; the window never listens to anything it says.
 */
function WidgetFrame({ widget, which, meters, css }: { widget: Widget; which: 'draft' | 'current'; meters: Meters; css: string }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const feeds = useFeeds()[`${which}:${widget.id}`]
  // What an address answered is handed over as text, never as markup; a widget that loaded nothing is given nothing.
  const key = JSON.stringify(meters) + Object.entries(feeds ?? {}).map(([k, v]) => `${k}${v.at}${v.ok}`).join()
  const send = () => ref.current?.contentWindow?.postMessage({ type: 'data', meters, feeds: feeds ?? {}, theme: themeNow() }, '*')
  useEffect(send, [key, css]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <iframe
      ref={ref}
      className="wd-frame"
      title={`Widget ${widget.id}`}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      src={`aw-widget://look/${which}/${widget.id}?v=${stamp(widget.html)}`}
      style={{ height: widget.height }}
      onLoad={send}
    />
  )
}

/** The widgets of the look on screen that sit in one place, each given only the numbers it asked for. */
export function WidgetSlot({ slot, meters }: { slot: WidgetSlot; meters: (want: MeterName[]) => Meters }) {
  const s = useChatModState()
  const mod = useChatMod()
  const which = s.draft && mod === s.draft ? 'draft' : 'current'
  const list = mod.widgets.filter((w) => w.slot === slot)
  if (!list.length) return null
  return (
    <div className={`wd-slot ${slot}`}>
      {list.map((w) => (
        <WidgetFrame key={`${which}:${w.id}`} widget={w} which={which} meters={meters(w.meters)} css={mod.css} />
      ))}
    </div>
  )
}

/** An agent asks to see the window, which shows your chats and todos: a picture is taken only if you press Allow once. */
export function ShotAsk() {
  const [ask, setAsk] = useState<{ id: string; agent: string } | null>(null)
  useEffect(() => window.aw.onShotAsk(setAsk), [])
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => (ask ? ref.current?.showModal() : ref.current?.close()), [ask])
  if (!ask) return null
  const answer = (ok: boolean) => (void window.aw.answerShot(ask.id, ok), setAsk(null))
  return (
    <dialog ref={ref} className="shot-ask" aria-label={`Let ${ask.agent} see the window?`} onCancel={() => answer(false)}>
      <h3>{ask.agent} wants to see the window</h3>
      <p>It would get one picture of what is on screen now, which can include your chats and todos. It is asked for when checking how a look turned out.</p>
      <div className="shot-acts">
        <button onClick={() => answer(false)}>Not now</button>
        <button className="primary" onClick={() => answer(true)}>
          Allow once
        </button>
      </div>
    </dialog>
  )
}
