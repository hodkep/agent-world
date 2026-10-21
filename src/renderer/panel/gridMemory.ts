import { type Node, isTerm, keepOnly, readLayout, tilesOf } from './tiling'

/** What one workspace remembers of its grid: whether it is shown, and how it is laid out (null: the overview tiles). */
export interface Slot {
  grid: boolean
  layout: { root: Node | null } | null
}
/** `old` is what every workspace showed before each had its own: the start for one with nothing saved. */
export interface Memory {
  slots: Record<string, Slot>
  old: Slot
}

export const MEMORY_KEY = 'aw.gridByFolder'

const slotFrom = (raw: unknown): Slot | null => {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as { grid?: unknown; layout?: unknown }
  return { grid: r.grid === true, layout: readLayout(r.layout) }
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
