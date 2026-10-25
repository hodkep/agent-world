import type { LibraryKind } from '../../shared/library'

export interface Origin { label: string; chip: string; tone: 'cl' | 'me' | 'ag' | 'k'; rank: number }
export interface AddableItem { id: string; name: string; kind: LibraryKind; source: string; description: string }
export interface ItemGroup<T extends AddableItem = AddableItem> { source: string; label: string; chip: string; tone: Origin['tone']; items: T[] }

// A source is the folder or plugin a skill was imported from; these are the friendly names for the well-known ones.
const KNOWN: Record<string, Origin> = {
  'Claude plugin anthropic-skills': { label: 'Anthropic skills', chip: 'Claude plugin', tone: 'cl', rank: 0 },
  'Claude plugin mattpocock-skills': { label: 'Matt Pocock skills', chip: 'Claude plugin', tone: 'cl', rank: 1 },
  'Claude plugin antv-infographic-skills': { label: 'AntV infographic skills', chip: 'Claude plugin', tone: 'cl', rank: 1 },
  '~/.claude/skills': { label: 'Your Claude skills', chip: 'yours', tone: 'me', rank: 2 },
  '~/.gemini/antigravity/skills': { label: 'Your Antigravity skills', chip: 'agy', tone: 'ag', rank: 3 },
  new: { label: 'Instructions & prompts', chip: 'written here', tone: 'k', rank: 4 },
  // The app's own guide, made by the app at start; last, so it does not move what the person has put here.
  'built-in': { label: 'Agent World', chip: 'built in', tone: 'k', rank: 5 }
}
const PLUGIN = /^Claude plugin /

export function originOf(source: string): Origin {
  const known = KNOWN[source]
  if (known) return known
  if (PLUGIN.test(source)) {
    const name = source.replace(PLUGIN, '').replace(/-/g, ' ')
    return { label: `${name.charAt(0).toUpperCase()}${name.slice(1)}${/skills$/.test(name) ? '' : ' skills'}`, chip: 'Claude plugin', tone: 'cl', rank: 1 }
  }
  return { label: source, chip: 'folder', tone: 'k', rank: 2 }
}

/** Every word typed must appear in the name, the one-line description, the publisher or the kind. */
export function matchesItem(i: AddableItem, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const hay = `${i.name} ${i.description} ${originOf(i.source).label} ${i.kind}`.toLowerCase()
  return words.every((w) => hay.includes(w))
}

/** Groups by where the item came from: Anthropic, other publishers A to Z, yours, then instructions and prompts. Groups without a match are left out. */
export function groupItems<T extends AddableItem>(items: T[], query: string): ItemGroup<T>[] {
  const by = new Map<string, T[]>()
  for (const i of items) if (matchesItem(i, query)) by.set(i.source, [...(by.get(i.source) ?? []), i])
  return [...by.entries()]
    .map(([source, list]) => ({ source, ...originOf(source), items: list }))
    .sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label))
    .map(({ source, label, chip, tone, items: list }) => ({ source, label, chip, tone, items: list }))
}
