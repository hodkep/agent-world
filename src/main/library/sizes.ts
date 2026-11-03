import { lstat, readdir } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * What a folder takes on disk: the sizes of its files, each file once (a hard link counts one time), links not followed.
 * Skill folders can hold gigabytes (media, a Python environment), so this is read in the background, a few entries at a time.
 */
export async function measure(dir: string): Promise<number> {
  const seen = new Set<string>()
  let total = 0
  const walk = async (d: string): Promise<void> => {
    const entries = await readdir(d, { withFileTypes: true }).catch(() => [])
    for (let i = 0; i < entries.length; i += 64) {
      await Promise.all(
        entries.slice(i, i + 64).map(async (e) => {
          const p = join(d, e.name)
          if (e.isSymbolicLink()) return
          if (e.isDirectory()) return walk(p)
          const st = await lstat(p).catch(() => null)
          if (!st?.isFile()) return
          const key = `${st.dev}:${st.ino}`
          if (st.nlink > 1) {
            if (seen.has(key)) return
            seen.add(key)
          }
          total += st.size
        })
      )
    }
  }
  const root = await lstat(dir).catch(() => null)
  if (root?.isDirectory()) await walk(dir)
  return total
}
