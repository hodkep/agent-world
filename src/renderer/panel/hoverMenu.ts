import { useEffect, useMemo, useRef, useState } from 'react'

export interface HoverState {
  open: boolean
  /** Opened by a click: it stays when the pointer leaves, until a click elsewhere or Esc. */
  pinned: boolean
}

/**
 * The behaviour of a menu that opens when the pointer rests on its button and stays when the button is clicked:
 * it opens after `openMs` of resting (a pass over it opens nothing), closes `closeMs` after the pointer leaves it and its panel
 * (coming back in that time keeps it, which crosses the gap between them), a click keeps it open until a click elsewhere or Esc.
 */
export function createHoverMenu(o: { onChange: (s: HoverState) => void; openMs?: number; closeMs?: number }) {
  const openMs = o.openMs ?? 150
  const closeMs = o.closeMs ?? 300
  let state: HoverState = { open: false, pinned: false }
  let opening: ReturnType<typeof setTimeout> | undefined
  let closing: ReturnType<typeof setTimeout> | undefined
  let gone = false
  const set = (s: HoverState) => {
    if (gone || (s.open === state.open && s.pinned === state.pinned)) return
    state = s
    o.onChange(s)
  }
  const stop = () => (clearTimeout(opening), clearTimeout(closing), (opening = closing = undefined))
  return {
    enter() {
      clearTimeout(closing)
      closing = undefined
      if (!state.open && opening === undefined) opening = setTimeout(() => ((opening = undefined), set({ open: true, pinned: false })), openMs)
    },
    leave() {
      clearTimeout(opening)
      opening = undefined
      if (state.open && !state.pinned && closing === undefined) closing = setTimeout(() => ((closing = undefined), set({ open: false, pinned: false })), closeMs)
    },
    click() {
      stop()
      set(state.open && state.pinned ? { open: false, pinned: false } : { open: true, pinned: true })
    },
    away() {
      stop()
      set({ open: false, pinned: false })
    },
    esc() {
      stop()
      set({ open: false, pinned: false })
    },
    chosen() {
      stop()
      set({ open: false, pinned: false })
    },
    dispose() {
      stop()
      gone = true
    }
  }
}

/** The menu's state in a component, with the handlers for its wrapper (pointer in and out) and a click outside it. */
export function useHoverMenu() {
  const [state, setState] = useState<HoverState>({ open: false, pinned: false })
  const menu = useMemo(() => createHoverMenu({ onChange: setState }), [])
  const wrap = useRef<HTMLElement | null>(null)
  useEffect(() => () => menu.dispose(), [menu])
  useEffect(() => {
    if (!state.open) return
    const away = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && menu.away()
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && menu.esc()
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', esc)
    return () => (window.removeEventListener('mousedown', away), window.removeEventListener('keydown', esc))
  }, [state.open, menu])
  return { ...state, menu, wrap }
}
