import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

// Folders nobody edits by hand, and the macOS clutter file: a folder that is not a repository has no .gitignore to say so.
const SKIP = new Set(['.git', 'node_modules', 'dist', 'build', '.venv', 'venv', '__pycache__', '.next', '.cache', 'target'])
const LIMIT = 5000

export async function listFolderFiles(dir: string, o?: { limit?: number }): Promise<string[]>
export async function listFolderFiles(dir: string, o: { limit?: number; withCut: true }): Promise<{ files: string[]; cut: boolean }>
/**
 * The files of a folder that is not a git repository, as paths from the folder, sorted: git cannot list them, so the folder is read. Links are not followed (out of the
 * folder, or round in a circle), and it stops at `limit` files; `withCut` says whether it did. A folder that cannot be read is an empty list.
 */
export async function listFolderFiles(dir: string, o: { limit?: number; withCut?: boolean } = {}): Promise<string[] | { files: string[]; cut: boolean }> {
  const limit = o.limit ?? LIMIT
  const files: string[] = []
  const walk = async (rel: string): Promise<void> => {
    let entries
    try {
      entries = await readdir(join(dir, rel), { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (files.length > limit) return
      const path = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) {
        if (!SKIP.has(e.name)) await walk(path)
      } else if (e.isFile() && e.name !== '.DS_Store') files.push(path)
    }
  }
  await walk('')
  const cut = files.length > limit
  const out = files.slice(0, limit).sort((a, b) => a.localeCompare(b))
  return o.withCut ? { files: out, cut } : out
}
