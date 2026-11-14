export interface FileGroup {
  /** The top folder, or '' for the files beside SKILL.md. */
  folder: string
  files: { path: string; name: string; tokens?: number }[]
  tokens: number
}

/** A skill's files grouped by their top folder: the files beside SKILL.md first, then each folder, the most tokens first; names inside a group are given from that folder, sorted. */
export function fileGroups(files: string[], sizes: Record<string, number>): FileGroup[] {
  const by = new Map<string, FileGroup>()
  for (const path of files) {
    const cut = path.indexOf('/')
    const folder = cut < 0 ? '' : path.slice(0, cut)
    const g = by.get(folder) ?? { folder, files: [], tokens: 0 }
    g.files.push({ path, name: path.slice(cut + 1), tokens: sizes[path] })
    g.tokens += sizes[path] ?? 0
    by.set(folder, g)
  }
  for (const g of by.values()) g.files.sort((a, b) => a.name.localeCompare(b.name))
  return [...by.values()].sort((a, b) => (a.folder === '' ? -1 : b.folder === '' ? 1 : b.tokens - a.tokens || a.folder.localeCompare(b.folder)))
}
