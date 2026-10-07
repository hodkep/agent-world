import { readdir, readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import type { PaletteCommand } from '../../../shared/commands'

export function describe(text: string) {
  const front = /^---\n([\s\S]*?)\n---/.exec(text)?.[1]
  const fromFront = front && /^description:\s*(.+)$/m.exec(front)?.[1]
  if (fromFront) return fromFront.trim().replace(/^["']|["']$/g, '')
  const body = front ? text.slice(text.indexOf('---', 3) + 3) : text
  return body.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('#')) ?? ''
}

/** One skill folder (it holds a SKILL.md), as a palette entry; null when it is not one. */
async function skillAt(dir: string, source: PaletteCommand['source'], prefix: string): Promise<PaletteCommand | null> {
  const text = await readFile(join(dir, 'SKILL.md'), 'utf8').catch(() => null)
  if (text === null) return null
  const name = /^name:\s*(.+)$/m.exec(/^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? '')?.[1]?.trim() ?? dir.split(sep).pop()!
  return { name: prefix + name, description: describe(text), source, args: true }
}

/** The skill folders at or below `dir`: `dir` itself if it is one, else every folder under it that is, a few levels deep (plugins group theirs). */
export async function skillDirs(dir: string, depth = 4): Promise<string[]> {
  if (await readFile(join(dir, 'SKILL.md'), 'utf8').then(() => true, () => false)) return [dir]
  if (depth === 0) return []
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const found = await Promise.all(entries.filter((e) => e.isDirectory() && e.name !== 'node_modules' && !e.name.startsWith('.')).map((e) => skillDirs(join(dir, e.name), depth - 1)))
  return found.flat()
}

/** `depth` is how many folders below `dir` to look: your own and a project's skills sit directly in it, a plugin's may be grouped. */
export async function skills(dir: string, source: PaletteCommand['source'], prefix = '', depth = 1): Promise<PaletteCommand[]> {
  const found = await Promise.all((await skillDirs(dir, depth)).map((d) => skillAt(d, source, prefix)))
  return found.filter((c): c is PaletteCommand => !!c)
}

export async function commands(dir: string, source: PaletteCommand['source'], prefix = ''): Promise<PaletteCommand[]> {
  const files = (await readdir(dir, { recursive: true }).catch(() => [])).filter((f) => f.endsWith('.md'))
  return Promise.all(
    files.map(async (f) => ({
      // Commands in subfolders are namespaced the way Claude names them: db/migrate.md is /db:migrate.
      name: prefix + relative(dir, join(dir, f)).slice(0, -3).split(sep).join(':'),
      description: describe(await readFile(join(dir, f), 'utf8').catch(() => '')),
      source,
      args: true
    }))
  )
}

