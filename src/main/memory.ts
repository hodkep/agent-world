import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

export interface MemoryEntry {
  id: string
  text: string
  /** The agent's name, or "you". */
  by: string
  at: number
}

const MAX_ENTRIES = 200
const MAX_TEXT = 2000

export function loadMemory(file: string): MemoryEntry[] {
  try {
    if (!existsSync(file)) return []
    const data = JSON.parse(readFileSync(file, 'utf8'))
    return Array.isArray(data) ? data.filter((e): e is MemoryEntry => typeof e?.id === 'string' && typeof e?.text === 'string') : []
  } catch {
    return []
  }
}

function save(file: string, entries: MemoryEntry[]) {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(entries, null, 2))
  renameSync(tmp, file)
}

/** Adds a note the whole team can find. The same words twice are kept once; past the limit the oldest go. */
export function remember(file: string, text: string, by: string, now = Date.now()): MemoryEntry {
  const clean = text.trim().slice(0, MAX_TEXT)
  if (!clean) throw new Error('There is nothing to remember: the text is empty.')
  const all = loadMemory(file)
  const same = all.find((e) => e.text === clean)
  if (same) return same
  const entry = { id: randomUUID(), text: clean, by, at: now }
  save(file, [...all, entry].slice(-MAX_ENTRIES))
  return entry
}

export function forget(file: string, id: string) {
  const all = loadMemory(file)
  save(file, all.filter((e) => e.id !== id))
}

const words = (t: string) => t.toLowerCase().match(/[\p{L}\p{N}_-]{2,}/gu) ?? []

/** Notes that mention the query's words, best match first; with no query, the newest notes. */
export function recall(entries: MemoryEntry[], query: string, limit = 10): MemoryEntry[] {
  const q = [...new Set(words(query))]
  if (q.length === 0) return [...entries].sort((a, b) => b.at - a.at).slice(0, limit)
  return entries
    .map((e) => ({ e, score: q.filter((w) => e.text.toLowerCase().includes(w)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.e.at - a.e.at)
    .slice(0, limit)
    .map((x) => x.e)
}
