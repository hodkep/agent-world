import { open, readdir, stat } from 'node:fs/promises'
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

async function head(file: string) {
  const fh = await open(file, 'r')
  try {
    const buf = Buffer.alloc(HEAD_BYTES)
    const { bytesRead } = await fh.read(buf, 0, HEAD_BYTES, 0)
    return buf.subarray(0, bytesRead).toString('utf8')
  } finally {
    await fh.close()
  }
}

const BATCH = 8

/**
 * Past sessions saved under the given project folders (see projectSlug), newest first; ones with no prompt are skipped.
 * Only the newest few are read, and the reads do not hold up the app: a folder with hundreds of large transcripts
 * must not make opening the list slow.
 */
export async function listSessions(claudeProjectsDir: string, slugs: string[], limit = 40): Promise<PastSession[]> {
  const found: { id: string; path: string; updated: number }[] = []
  for (const slug of slugs) {
    let files: string[]
    try {
      files = (await readdir(join(claudeProjectsDir, slug))).filter((f) => f.endsWith('.jsonl'))
    } catch {
      continue
    }
    const stats = await Promise.all(
      files.map(async (f) => {
        const path = join(claudeProjectsDir, slug, f)
        try {
          return { id: f.slice(0, -'.jsonl'.length), path, updated: (await stat(path)).mtimeMs }
        } catch {
          return null
        }
      })
    )
    found.push(...stats.filter((x): x is NonNullable<typeof x> => x !== null))
  }
  found.sort((a, b) => b.updated - a.updated)
  const out: PastSession[] = []
  for (let i = 0; i < found.length && out.length < limit; i += BATCH) {
    const titles = await Promise.all(found.slice(i, i + BATCH).map((f) => head(f.path).then(titleOf, () => '')))
    titles.forEach((title, k) => {
      const f = found[i + k]!
      if (title && out.length < limit) out.push({ id: f.id, title, updated: f.updated })
    })
  }
  return out
}
