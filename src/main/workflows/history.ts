import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { HistoryEntry } from '../../shared/builder'
import type { Scope } from '../../shared/workflow'

export const HISTORY_MAX = 100

/** The file name a workflow's history is kept under. A project's workflow is kept apart from another project's with the same id; one kept for everything has one history. */
export function historyKey(project: string | null, scope: Scope, id: string): string {
  const where = scope === 'project' && project ? `p-${createHash('sha1').update(project).digest('hex').slice(0, 8)}` : 'global'
  return `${where}-${id}`
}

/**
 * What was changed in each workflow and when, kept in the app's own folder (never in the repository), one file for each workflow, so the builder can read why a workflow is the way it is.
 * A damaged file means no history.
 */
export class WorkflowHistory {
  constructor(private dir: string) {}

  private file(key: string) {
    return join(this.dir, `${key.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`)
  }

  /** Newest first. */
  list(key: string): HistoryEntry[] {
    try {
      const raw = JSON.parse(readFileSync(this.file(key), 'utf8')) as HistoryEntry[]
      return Array.isArray(raw) ? raw.filter((e) => e && typeof e.at === 'number' && typeof e.summary === 'string').reverse() : []
    } catch {
      return []
    }
  }

  add(key: string, entry: HistoryEntry) {
    const kept = [...this.list(key).reverse(), entry].slice(-HISTORY_MAX)
    mkdirSync(this.dir, { recursive: true })
    const tmp = `${this.file(key)}.tmp`
    writeFileSync(tmp, JSON.stringify(kept))
    renameSync(tmp, this.file(key))
  }
}
