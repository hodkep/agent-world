import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** The folder the office is working in, and the ones worked in before (newest first). */
export interface WorkspaceState {
  active: string | null
  recent: string[]
}

const MAX_RECENT = 12
export const emptyWorkspaces = (): WorkspaceState => ({ active: null, recent: [] })

/** Opening a folder switches to it; it is only saved to the list once work has happened there (see remember). */
export const activate = (s: WorkspaceState, path: string): WorkspaceState => ({ ...s, active: path })

export const remember = (s: WorkspaceState, path: string): WorkspaceState => ({
  active: path,
  recent: [path, ...s.recent.filter((p) => p !== path)].slice(0, MAX_RECENT)
})

export function forget(s: WorkspaceState, path: string): WorkspaceState {
  const recent = s.recent.filter((p) => p !== path)
  return { active: s.active === path ? (recent[0] ?? null) : s.active, recent }
}

/** Where to start: the last active folder if it is still there, else the newest saved one that is. */
export const resume = (s: WorkspaceState, exists: (path: string) => boolean): string | null =>
  [s.active, ...s.recent].find((p): p is string => !!p && exists(p)) ?? null

export function loadWorkspaces(file: string): WorkspaceState {
  try {
    const d = JSON.parse(readFileSync(file, 'utf8')) as Partial<WorkspaceState>
    return { active: typeof d.active === 'string' ? d.active : null, recent: Array.isArray(d.recent) ? d.recent.filter((p): p is string => typeof p === 'string') : [] }
  } catch {
    return emptyWorkspaces()
  }
}

export function saveWorkspaces(file: string, s: WorkspaceState) {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(s, null, 2))
  renameSync(tmp, file)
}
