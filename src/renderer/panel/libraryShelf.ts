import type { LibraryItem, PlaybookRule } from '../../shared/library'

export type Tier = 'desk' | 'shelf' | 'box'

/** Where an item sits on the shelf: told every time, pointed at (or put in by a step), or in no playbook. */
export function tierOf(rules: PlaybookRule[], id: string): Tier {
  const m = rules.find((r) => r.id === id)?.mode
  return m === 'always' ? 'desk' : m === 'on-demand' || m === 'step' ? 'shelf' : 'box'
}

const COLOURS = ['#d83a3a', '#3f8f9f', '#c9a21e', '#5f9e5f', '#b03f5e', '#4a6a96', '#e08a5a', '#c9c5d8']

/** A spine's colour comes from its name, its height from what it costs to read, so a library has a shape. */
export function spineLook(i: Pick<LibraryItem, 'name' | 'tokens'>): { height: number; colour: string } {
  let h = 0
  for (const ch of i.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return { height: 52 + ((h >> 3) % 34) + Math.min(30, Math.round(i.tokens.body / 120)), colour: COLOURS[h % COLOURS.length]! }
}

export interface Mark { text: string; kind?: 'told' | 'when' }

/** Splits the opening text so the told items' names and the when-lines can be coloured. */
export function highlightOpening(text: string, told: string[], when: string[]): Mark[] {
  const kinds = new Map<string, 'told' | 'when'>()
  for (const w of when.filter(Boolean)) kinds.set(w, 'when')
  for (const t of told.filter(Boolean)) kinds.set(t, 'told')
  if (!kinds.size) return [{ text }]
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(${[...kinds.keys()].sort((a, b) => b.length - a.length).map(esc).join('|')})`)
  return text.split(re).filter(Boolean).map((t) => (kinds.has(t) ? { text: t, kind: kinds.get(t) } : { text: t }))
}
