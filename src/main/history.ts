import { closeSync, openSync, readSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

export interface PastSession {
  id: string
  title: string
  /** Last modified, ms since epoch. */
  updated: number
}

const TITLE_LEN = 80
// Transcripts run to megabytes; the first prompt is always near the top.
const HEAD_BYTES = 256 * 1024

/** Claude keeps a project's sessions in a folder named after its path with every non-alphanumeric turned into a dash. */
export const projectSlug = (path: string) => path.replace(/[^a-zA-Z0-9]/g, '-')

/** The first thing the user typed, skipping the wrappers Claude records for slash commands. */
export function titleOf(jsonl: string): string {
  for (const l of jsonl.split('\n')) {
    let o: { type?: string; message?: { content?: unknown } }
    try {
      o = JSON.parse(l)
    } catch {
      continue
    }
    if (o.type !== 'user') continue
    const c = o.message?.content
    const text = typeof c === 'string' ? c : Array.isArray(c) ? c.map((b: { type?: string; text?: string }) => (b.type === 'text' ? b.text : '')).join(' ') : ''
    const clean = text.replace(/\s+/g, ' ').trim()
    if (clean && !clean.startsWith('<')) return clean.slice(0, TITLE_LEN)
  }
  return ''
}

const head = (file: string) => {
  const fd = openSync(file, 'r')
  try {
    const buf = Buffer.alloc(HEAD_BYTES)
    return buf.subarray(0, readSync(fd, buf, 0, HEAD_BYTES, 0)).toString('utf8')
  } finally {
    closeSync(fd)
  }
}

/** Past sessions saved under the given project folders (see projectSlug), newest first; ones with no prompt are skipped. */
export function listSessions(claudeProjectsDir: string, slugs: string[]): PastSession[] {
  const out: PastSession[] = []
  for (const slug of slugs) {
    let files: string[]
    try {
      files = readdirSync(join(claudeProjectsDir, slug)).filter((f) => f.endsWith('.jsonl'))
    } catch {
      continue
    }
    for (const f of files) {
      const path = join(claudeProjectsDir, slug, f)
      const title = titleOf(head(path))
      if (title) out.push({ id: f.slice(0, -'.jsonl'.length), title, updated: statSync(path).mtimeMs })
    }
  }
  return out.sort((a, b) => b.updated - a.updated)
}
