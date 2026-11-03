import type { LibraryCandidate, LibraryItem } from '../../shared/library'

export interface ShelfRow {
  /** The library item's id, or the found skill's folder. */
  key: string
  name: string
  /** The one thing the row says about itself: where it is installed from, or which folder it is in. */
  fact: string
  bytes?: number
  found?: true
  /** A reason to look at it: its folder is gone, or its original is still there. */
  warn?: string
  /** For a copy the library holds whose original was found: that original's folder. */
  original?: string
  candidate?: LibraryCandidate
  /** The skill's logo (a data link), when it has one. */
  logo?: string
}

export interface ShelfGroup {
  key: string
  kind: 'global' | 'project' | 'plugin' | 'library' | 'found'
  title: string
  path: string
  rows: ShelfRow[]
  /** The total of the sizes measured so far. */
  bytes: number
  /** Every row's size is known. */
  measured: boolean
}

/** A path as people read it: under the home folder it starts with ~, and a long one keeps its last two folders. */
export function shortPath(p: string): string {
  const m = /^\/(?:Users|home)\/[^/]+(\/.*)?$/.exec(p)
  if (!m) return p
  const rest = (m[1] ?? '').split('/').filter(Boolean)
  return rest.length > 3 ? `~/…/${rest.slice(-2).join('/')}` : `~/${rest.join('/')}`
}

/** A skills folder as people name it: ~/.claude/skills, ~/.agents/skills, ~/.gemini/…, wherever the home folder is. */
export function homeFolder(p: string): string {
  const m = /\/(\.(?:claude|agents|gemini)(?:\/.+)?)$/.exec(p)
  return m ? `~/${m[1]}` : shortPath(p)
}

const slug = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
const base = (p: string) => p.split('/').filter(Boolean).pop() ?? p

function skillFolder(item: LibraryItem): string {
  const real = item.place?.real ?? ''
  const project = item.place?.project
  return project && real.startsWith(`${project}/`) ? real.slice(project.length + 1).split('/').slice(0, -1).join('/') : shortPath(real.split('/').slice(0, -1).join('/'))
}

/** What a found skill says about itself: the project and folder it is in, the plugin it is from, or where it was installed from. */
function foundFact(c: LibraryCandidate): string {
  const folder = c.dir.split('/').slice(0, -1).join('/')
  if (c.kind === 'plugin') return [c.from, c.license].filter(Boolean).join(' · ')
  if (c.kind === 'project' && c.project) return `${base(c.project)} · ${folder.startsWith(`${c.project}/`) ? folder.slice(c.project.length + 1) : shortPath(folder)}`
  return c.from ?? homeFolder(folder)
}

const bySize = (a: ShelfRow, b: ShelfRow) => (b.bytes ?? -1) - (a.bytes ?? -1) || a.name.localeCompare(b.name)

/**
 * The skills as the window lists them: a group for the global folders, one for each project, the plugins, what is kept in the library itself, and what was found on this computer
 * but is not in the library. Biggest first inside a group, and only what matches the words typed.
 */
export function shelfGroups(items: LibraryItem[], found: LibraryCandidate[], query: string): ShelfGroup[] {
  const q = query.trim().toLowerCase()
  const match = (name: string, description: string) => !q || name.toLowerCase().includes(q) || description.toLowerCase().includes(q)
  const skills = items.filter((i) => i.kind === 'skill')
  const have = new Set(skills.flatMap((i) => (i.place ? [i.place.real] : [])))
  const ids = new Set(skills.map((i) => i.id))
  const groups: ShelfGroup[] = []
  const add = (key: string, kind: ShelfGroup['kind'], title: string, path: string, rows: ShelfRow[]) => {
    if (!rows.length) return
    rows.sort(bySize)
    groups.push({ key, kind, title, path, rows, bytes: rows.reduce((n, r) => n + (r.bytes ?? 0), 0), measured: rows.every((r) => r.bytes !== undefined) })
  }
  const rowOf = (i: LibraryItem): ShelfRow => {
    const p = i.place
    const fact = i.missing ? 'The folder is gone' : !p ? 'Kept in the library' : p.kind === 'plugin' ? [p.from, p.license].filter(Boolean).join(' · ') : p.kind === 'project' ? skillFolder(i) : (p.from ?? homeFolder((p.real.split('/').slice(0, -1).join('/')) || p.real))
    return { key: i.id, name: i.name, fact, ...(i.size && { bytes: i.size.bytes }), ...(i.logo && { logo: i.logo }), ...(i.missing && { warn: 'The folder is gone' }) }
  }
  const mine = skills.filter((i) => match(i.name, i.description))
  add('global', 'global', 'Global', '~/.claude · ~/.agents', mine.filter((i) => i.place?.kind === 'global').map(rowOf))
  const projects = [...new Set(mine.flatMap((i) => (i.place?.kind === 'project' && i.place.project ? [i.place.project] : [])))].sort((a, b) => base(a).localeCompare(base(b)))
  for (const p of projects) add(`project:${p}`, 'project', base(p), p, mine.filter((i) => i.place?.kind === 'project' && i.place.project === p).map(rowOf))
  add('plugin', 'plugin', 'Plugins', 'read only · managed by Claude', mine.filter((i) => i.place?.kind === 'plugin').map(rowOf))
  // A copy the library holds, whose original was found as well: it says so, so the copy can be swapped for the original.
  const originals = new Map(found.map((c) => [slug(c.name), c]))
  add('library', 'library', 'Kept in the library', '~/.agent-world/library', mine.filter((i) => !i.place).map((i) => {
    const o = originals.get(i.id)
    return { ...rowOf(i), ...(o && { warn: `Its original is still at ${shortPath(o.real)}`, original: o.dir }) }
  }))
  add('found', 'found', 'Found, not in the library', 'click one to add a link', found
    .filter((c) => !have.has(c.real) && !ids.has(slug(c.name)) && match(c.name, c.description))
        .map((c) => ({ key: c.dir, name: c.name, fact: foundFact(c), found: true as const, candidate: c })))
  return groups
}
