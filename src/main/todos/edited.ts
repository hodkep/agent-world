import { realpathSync } from 'node:fs'
import { isAbsolute, relative } from 'node:path'
import type { ChatItem } from '../../shared/chat'

const EDITS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

/** The files an agent wrote or edited with its own tools after a time, relative to its folder: work that counts even before anything is committed. */
export function editedFiles(items: ChatItem[], cwd: string, since: number): string[] {
  const out = new Set<string>()
  // A folder may be written two ways (a temp folder on a Mac is /var/... and /private/var/...), and a tool may name the other one.
  let real = cwd
  try {
    real = realpathSync(cwd)
  } catch {
    /* the folder is gone: only the name given is used */
  }
  const inside = (p: string) => [cwd, real].map((c) => relative(c, p)).find((r) => r && !r.startsWith('..') && !isAbsolute(r))
  for (const i of items) {
    if (i.kind !== 'tool' || i.at < since || !EDITS.has(i.name)) continue
    const p = i.input.file_path ?? i.input.notebook_path
    if (typeof p !== 'string') continue
    const rel = isAbsolute(p) ? inside(p) : p
    if (rel && !rel.startsWith('..')) out.add(rel)
  }
  return [...out]
}
