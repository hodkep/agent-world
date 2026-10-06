export interface Row {
  path: string
  name: string
  depth: number
  dir: boolean
}

/** Every folder above a file, outermost first: `a/b/c.ts` gives `a`, `a/b`. */
export const ancestors = (path: string) =>
  path
    .split('/')
    .slice(0, -1)
    .map((_, i, parts) => parts.slice(0, i + 1).join('/'))

const base = (p: string) => p.slice(p.lastIndexOf('/') + 1)
const byName = (a: string, b: string) => base(a).localeCompare(base(b), undefined, { sensitivity: 'base', numeric: true })

/** The rows of a folder tree built from file paths: folders before files, closed folders hide their contents, a filter keeps matching files and opens their folders. */
export function visibleRows(paths: string[], open: Set<string>, filter: string): Row[] {
  const q = filter.trim().toLowerCase()
  const kept = q ? paths.filter((p) => p.toLowerCase().includes(q)) : paths
  const kids = new Map<string, { dirs: Set<string>; files: string[] }>()
  const of = (dir: string) => kids.get(dir) ?? kids.set(dir, { dirs: new Set(), files: [] }).get(dir)!
  for (const p of kept) {
    const up = ancestors(p)
    of(up.at(-1) ?? '').files.push(p)
    up.forEach((d, i) => of(up[i - 1] ?? '').dirs.add(d))
  }
  const rows: Row[] = []
  const walk = (dir: string, depth: number) => {
    const here = kids.get(dir)
    if (!here) return
    for (const d of [...here.dirs].sort(byName)) {
      rows.push({ path: d, name: base(d), depth, dir: true })
      if (q || open.has(d)) walk(d, depth + 1)
    }
    for (const f of [...here.files].sort(byName)) rows.push({ path: f, name: base(f), depth, dir: false })
  }
  walk('', 0)
  return rows
}

export interface ChangeRow extends Row {
  /** How many changed files a folder holds, below it at any depth. */
  count: number
}

/**
 * The rows of a folder tree of changed files: every folder open unless it is in `closed`, a chain of folders that hold nothing else
 * joined into one row (`backend/src/main/java`), and only files matching the filter kept. A joined row is closed by its last folder.
 */
export function changeRows(paths: string[], closed: Set<string>, filter: string): ChangeRow[] {
  const q = filter.trim().toLowerCase()
  const kept = q ? paths.filter((p) => p.toLowerCase().includes(q)) : paths
  const kids = new Map<string, { dirs: Set<string>; files: string[] }>()
  const count = new Map<string, number>()
  const of = (dir: string) => kids.get(dir) ?? kids.set(dir, { dirs: new Set(), files: [] }).get(dir)!
  for (const p of kept) {
    const up = ancestors(p)
    of(up.at(-1) ?? '').files.push(p)
    up.forEach((d, i) => {
      of(up[i - 1] ?? '').dirs.add(d)
      count.set(d, (count.get(d) ?? 0) + 1)
    })
  }
  const rows: ChangeRow[] = []
  const walk = (dir: string, depth: number) => {
    const here = kids.get(dir)
    if (!here) return
    for (const first of [...here.dirs].sort(byName)) {
      let d = first
      let name = base(first)
      for (let k = kids.get(d)!; k.files.length === 0 && k.dirs.size === 1; k = kids.get(d)!) {
        d = [...k.dirs][0]!
        name += `/${base(d)}`
      }
      rows.push({ path: d, name, depth, dir: true, count: count.get(d) ?? 0 })
      if (!closed.has(d)) walk(d, depth + 1)
    }
    for (const f of [...here.files].sort(byName)) rows.push({ path: f, name: base(f), depth, dir: false, count: 1 })
  }
  walk('', 0)
  return rows
}
