/** What a folder takes on disk, and how much of it is a folder an install brings back (node_modules, dist, caches). */
export interface Dir {
  bytes: number
  regen: number
}
/** One line of a workspace's storage: where an agent works and what that place takes. */
export interface Place {
  id: string
  name: string
  note: string
  bytes: number
  regen: number
  kind: 'folder' | 'agent' | 'sub' | 'orphan' | 'data'
  /** The place of the agent this one hangs under (a subagent under its parent). */
  of?: string
  /** The folder itself, for what could be freed. */
  path?: string
}
export interface Storage {
  path: string
  name: string
  bytes: number
  places: Place[]
}
/** What the app knows of an agent that matters here: where it works and who started it. */
export interface Who {
  id: string
  name: string
  cwd: string
  parent?: string
  activeAt?: number
}
export interface Tip {
  bytes: number
  text: string
  cmd?: string
}

const HOUR = 3_600_000
function ago(at: number | undefined, now: number): string {
  if (!at) return 'never active'
  const h = Math.floor((now - at) / HOUR)
  return h < 1 ? 'under an hour ago' : h < 48 ? `${h} h ago` : `${Math.floor(h / 24)} days ago`
}
const base = (p: string) => p.replace(/\/+$/, '').split('/').pop() ?? p

/**
 * A workspace's storage by place: its own folder (where agents that work in place sit, adding nothing of their own), each agent's
 * worktree, a subagent under its parent (with a folder of its own, or sharing its parent's and taking nothing), and a worktree
 * folder no agent owns last.
 */
export function arrange(o: { path: string; name: string; agents: Who[]; folder: Dir; dirs: Record<string, Dir>; now: number }): Storage {
  const { agents, dirs } = o
  const inPlace = agents.filter((a) => !a.parent && a.cwd === o.path).map((a) => a.name)
  const places: Place[] = [{ id: 'folder', name: 'Project folder', note: inPlace.length ? `${inPlace.join(', ')} work${inPlace.length === 1 ? 's' : ''} here` : 'no agent works here', bytes: o.folder.bytes, regen: o.folder.regen, kind: 'folder', path: o.path }]
  const owned = new Set<string>()
  const mine = (p: string) => agents.find((a) => a.cwd === p)
  const withDir: Place[] = Object.entries(dirs).flatMap(([path, d]): Place[] => {
    const a = mine(path)
    if (!a) return [{ id: path, name: base(path), note: 'no agent', bytes: d.bytes, regen: d.regen, kind: 'orphan', path }]
    owned.add(a.id)
    const parent = a.parent && agents.find((x) => x.id === a.parent)
    return [{ id: a.id, name: a.name, note: parent ? 'subagent · own folder' : `worktree · last active ${ago(a.activeAt, o.now)}`, bytes: d.bytes, regen: d.regen, kind: parent ? 'sub' : 'agent', ...(parent && { of: parent.id }), path }]
  })
  // A subagent in a folder that is not one of the worktrees is in its parent's (or the project's): it takes nothing.
  const sharing: Place[] = agents.filter((a) => a.parent && !owned.has(a.id) && agents.some((p) => p.id === a.parent)).map((a) => {
    const p = agents.find((x) => x.id === a.parent)!
    return { id: a.id, name: a.name, note: `subagent · shares ${p.name}'s folder`, bytes: 0, regen: 0, kind: 'sub', of: p.id }
  })
  const all = [...withDir, ...sharing]
  const ids = new Set(all.map((p) => p.id))
  const subsOf = (id: string) => all.filter((p) => p.of === id).sort((a, b) => b.bytes - a.bytes)
  const top = all.filter((p) => p.kind === 'agent' || (p.kind === 'sub' && !(p.of && ids.has(p.of))))
  const weight = (p: Place) => p.bytes + subsOf(p.id).reduce((n, s) => n + s.bytes, 0)
  top.sort((a, b) => weight(b) - weight(a))
  for (const p of top) places.push(p, ...subsOf(p.id))
  places.push(...all.filter((p) => p.kind === 'orphan').sort((a, b) => b.bytes - a.bytes))
  return { path: o.path, name: o.name, bytes: places.reduce((n, p) => n + p.bytes, 0), places }
}

/** What could be freed in a workspace, biggest first: the folders an install brings back inside worktrees (never the project's own folder), and worktrees nobody owns. Only said, never done. */
export function recommend(s: Storage): Tip[] {
  // Not an orphan's: that folder is freed whole below, so its share would be counted twice.
  const trees = s.places.filter((p) => p.kind === 'agent' || p.kind === 'sub')
  const regen = trees.reduce((n, p) => n + p.regen, 0)
  const withRegen = trees.filter((p) => p.regen > 0).length
  const orphans = s.places.filter((p) => p.kind === 'orphan')
  const tips: Tip[] = []
  if (regen > 0) tips.push({ bytes: regen, text: `node_modules, dist and caches in ${withRegen} worktree${withRegen === 1 ? '' : 's'}. An install brings them back.` })
  if (orphans.length) tips.push({ bytes: orphans.reduce((n, p) => n + p.bytes, 0), text: `${orphans.map((p) => p.name).join(', ')} ${orphans.length === 1 ? 'has' : 'have'} no agent. Check nothing is unpushed, then remove ${orphans.length === 1 ? 'it' : 'each'}.`, cmd: 'git worktree remove <path>' })
  return tips.sort((a, b) => b.bytes - a.bytes)
}
