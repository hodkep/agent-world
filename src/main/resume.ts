import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** A heartbeat of which agents are running, so a quick restart (a code change in dev, a crash) can bring them straight back. */
export function writeRunning(file: string, ids: string[], now: number) {
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify({ at: now, ids }))
  } catch {
    /* only a convenience */
  }
}

export function recentlyRunning(file: string, now: number, maxAgeMs: number): string[] {
  try {
    const d = JSON.parse(readFileSync(file, 'utf8')) as { at?: number; ids?: unknown }
    return typeof d.at === 'number' && now - d.at <= maxAgeMs && Array.isArray(d.ids) ? d.ids.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}
