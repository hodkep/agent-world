/** The item one step from `current`, wrapping at the ends; from nothing it is the first (or last, going back). Undefined when there is nowhere else to go. */
export function next<T>(items: T[], current: T | null, dir: 1 | -1): T | undefined {
  if (!items.length) return undefined
  const i = current === null ? -1 : items.indexOf(current)
  if (i < 0) return items[dir === 1 ? 0 : items.length - 1]
  if (items.length === 1) return undefined
  return items[(i + dir + items.length) % items.length]
}
