import { type ReactNode, useEffect, useState, useSyncExternalStore } from 'react'
import { OutlineIcon } from '../panel/IconButton'
import { DEFAULT_LAYOUT, type ChatLayout, type Pack } from '../../shared/chatLayout'
import { EMPTY_MOD, GUARD_CSS, isEmptyMod, type ChatMod, type ChatModState } from '../../shared/chatMod'

// POC: the look an agent wrote for the chat. The main process holds it; this is the window's copy, kept current by what main announces.
const NONE: ChatModState = { current: EMPTY_MOD, draft: null, draftBy: null, draftWhy: '', history: 0 }
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
          </>
        )}
      </span>
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
