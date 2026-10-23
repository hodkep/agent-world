import { useEffect, useRef, useState } from 'react'
import { activityByProject } from '../../shared/recent'
import { next } from '../cycle'
import { matches } from '../shortcuts'
import { agentOrder, spaceOrder, stepped } from '../switcher'

export type Kind = 'agents' | 'spaces'
/** The bar while it is open: the order it was opened with (not re-sorted while you step), where you began, and the one it is on. */
export interface Flight {
  kind: Kind
  ids: string[]
  start: string | null
  at: string | null
  shown: boolean
}
interface Live {
  agents: { id: string; group?: string; activeAt?: number }[]
  workspaces: { path: string; exists: boolean }[]
  selected: string | null
  folder: string | null
}

// A tap shows no bar; holding past this, or a second press, does.
const SHOW_MS = 150

/**
 * Ctrl+Tab through the agents, Shift+Mod+[ and ] through the projects, in the order their dropdowns list them. The modifier held
 * and the key pressed again step on; letting go of the modifier switches, Esc or leaving the window does not. Wins over the terminal and message box.
 */
export function useSwitcher(live: () => Live, go: { agent: (id: string) => void; space: (path: string) => void }): { flight: Flight | null; pick: (id: string) => void } {
  const [flight, setFlight] = useState<Flight | null>(null)
  const latest = useRef({ live, go })
  latest.current = { live, go }
  // The bar's own handle on the one open flight, set below, for a press on a tile.
  const choose = useRef<(id: string) => void>(() => {})
  useEffect(() => {
    let open: Flight | null = null
    // Presses made while the fresh order is still being read, and whether the modifier was already let go.
    let waiting: { kind: Kind; dirs: (1 | -1)[]; released: boolean } | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    const set = (f: Flight | null) => setFlight((open = f))
    const cancel = () => {
      waiting = null
      clearTimeout(timer)
      set(null)
    }
    const finish = (f: Flight) => {
      clearTimeout(timer)
      set(null)
      if (f.at && f.at !== f.start) (f.kind === 'agents' ? latest.current.go.agent : latest.current.go.space)(f.at)
    }
    // The dropdowns read the times as they open; the copy this window loaded with is older.
    const begin = async (kind: Kind) => {
      try {
        const list = await window.aw.listAgents()
        const w = waiting
        if (!w) return
        waiting = null
        const l = latest.current.live()
        const ids = kind === 'agents' ? agentOrder(l.agents, Object.fromEntries(list.map((a) => [a.id, a.activeAt ?? 0]))) : spaceOrder(l.workspaces, activityByProject(list))
        const start = kind === 'agents' ? l.selected : l.folder
        const f: Flight = { kind, ids, start, at: stepped(ids, start, w.dirs), shown: w.dirs.length > 1 }
        if (w.released) return finish(f)
        set(f)
        timer = setTimeout(() => open && set({ ...open, shown: true }), SHOW_MS)
      } catch {
        cancel()
      }
    }
    choose.current = (id) => open && finish({ ...open, at: id })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (open || waiting)) return e.preventDefault(), e.stopPropagation(), cancel()
      const byAgent = matches(e, 'agent-switch')
      if ((!byAgent && !matches(e, 'workspace-switch')) || document.querySelector('dialog[open]')) return
      e.preventDefault(), e.stopPropagation()
      const kind: Kind = byAgent ? 'agents' : 'spaces'
      const dir = byAgent ? (e.shiftKey ? -1 : 1) : e.code === 'BracketLeft' || e.key === '[' || e.key === '{' ? -1 : 1
      if (open) {
        if (open.kind === kind) set({ ...open, at: next(open.ids, open.at, dir) ?? open.at, shown: true })
      } else if (waiting) {
        if (waiting.kind === kind) waiting.dirs.push(dir)
      } else {
        waiting = { kind, dirs: [dir], released: false }
        void begin(kind)
      }
    }
    const onUp = (e: KeyboardEvent) => {
      if ((e.key !== 'Control' && e.key !== 'Meta') || e.ctrlKey || e.metaKey) return
      if (open) finish(open)
      else if (waiting) waiting.released = true
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('keyup', onUp, true)
    window.addEventListener('blur', cancel)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('keyup', onUp, true)
      window.removeEventListener('blur', cancel)
      clearTimeout(timer)
    }
  }, [])
  return { flight, pick: (id) => choose.current(id) }
}
