/** Which workspaces have their terminals drawer shown: each its own, so a drawer opened in one project is not open in the next. A workspace never seen starts closed. */
export type OpenMemory = Record<string, boolean>

export const OPEN_KEY = 'aw.termByFolder'

export function readOpen(raw: string | null): OpenMemory {
  const out: OpenMemory = {}
  try {
    const saved = JSON.parse(raw || 'null')
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) for (const [folder, open] of Object.entries(saved)) if (typeof open === 'boolean') out[folder] = open
  } catch {
    // nothing saved that can be read: every drawer closed
  }
  return out
}

export const openOf = (m: OpenMemory, folder: string) => m[folder] === true

export const setOpen = (m: OpenMemory, folder: string, open: boolean): OpenMemory => ({ ...m, [folder]: open })

export const saveOpen = (m: OpenMemory) => JSON.stringify(m)
