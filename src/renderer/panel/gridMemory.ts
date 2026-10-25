import { type Node, isTerm, keepOnly, readLayout, tilesOf } from './tiling'

/** What one workspace remembers of its grid: whether it is shown, and how it is laid out (null: the overview tiles). */
export interface Slot {
  grid: boolean
  layout: { root: Node | null } | null
  /** The agents whose pane shows their terminal instead of the chat; one not here shows its chat. Absent when there are none. */
  views?: Record<string, 'terminal'>
}
/** `old` is what every workspace showed before each had its own: the start for one with nothing saved. */
export interface Memory {
  slots: Record<string, Slot>
  old: Slot
}

export const MEMORY_KEY = 'aw.gridByFolder'

const slotFrom = (raw: unknown): Slot | null => {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as { grid?: unknown; layout?: unknown; views?: unknown }
  const views = r.views && typeof r.views === 'object' && !Array.isArray(r.views) ? Object.fromEntries(Object.entries(r.views).filter(([, v]) => v === 'terminal')) : {}
  return { grid: r.grid === true, layout: readLayout(r.layout), ...(Object.keys(views).length > 0 && { views: views as Record<string, 'terminal'> }) }
}

export function readMemory(raw: string | null, old: { grid: string | null; layout: string | null }): Memory {
  let layout: Slot['layout'] = null
  try {
    layout = readLayout(JSON.parse(old.layout || 'null'))
  } catch {
    /* an unreadable old layout is no layout */
  }
  // The shells of the run that saved the old layout are gone by now.
  const start: Slot = { grid: old.grid === '1', layout: layout && { root: keepOnly(layout.root, (t) => !isTerm(t)) } }
  const slots: Memory['slots'] = {}
  try {
    const saved = JSON.parse(raw || 'null')
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) for (const [folder, s] of Object.entries(saved)) slots[folder] = slotFrom(s) ?? { grid: false, layout: null }
  } catch {
    /* nothing saved that can be read */
  }
  return { slots, old: start }
}

export const slotOf = (m: Memory, folder: string): Slot => m.slots[folder] ?? m.old

export const setSlot = (m: Memory, folder: string, patch: Partial<Slot>): Memory => ({ ...m, slots: { ...m.slots, [folder]: { ...slotOf(m, folder), ...patch } } })

export const saveMemory = (m: Memory) => JSON.stringify(m.slots)

/** Every shell in any workspace's grid. */
export const termTiles = (m: Memory) => Object.values(m.slots).flatMap((s) => tilesOf(s.layout?.root ?? null).filter(isTerm))

/** The views with one agent's pane turned to its terminal (or back to the chat); none left over when the last goes back. */
export function setView(views: Slot['views'], id: string, terminal: boolean): Slot['views'] {
  const { [id]: _, ...rest } = views ?? {}
  const next = terminal ? { ...rest, [id]: 'terminal' as const } : rest
  return Object.keys(next).length > 0 ? next : undefined
}

/** Only the choices of agents that still have a tile: one taken out of the grid and put back again starts as a chat. */
export function pruneViews(views: Slot['views'], root: Node | null): Slot['views'] {
  const here = new Set(tilesOf(root))
  const kept = Object.fromEntries(Object.entries(views ?? {}).filter(([id]) => here.has(id)))
  return Object.keys(kept).length > 0 ? (kept as Record<string, 'terminal'>) : undefined
}
