const day = (t: number) => new Date(new Date(t).setHours(0, 0, 0, 0)).getTime()

/** Puts a newest-first list under day headings (Today, Yesterday, then the date), keeping its order. */
export function groupByDay<T>(items: T[], at: (item: T) => number, now = Date.now()): { label: string; items: T[] }[] {
  const out: { label: string; items: T[] }[] = []
  for (const item of items) {
    const d = day(at(item))
    const ago = Math.round((day(now) - d) / 86400000)
    const label = ago === 0 ? 'Today' : ago === 1 ? 'Yesterday' : new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric' })
    const last = out[out.length - 1]
    if (last?.label === label) last.items.push(item)
    else out.push({ label, items: [item] })
  }
  return out
}
