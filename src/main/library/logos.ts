import { closeSync, copyFileSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { SkillPlace } from '../../shared/library'

const TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg' }
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg' }
const MAX_BYTES = 200_000
const SAFE = /^[a-z0-9][a-z0-9-]*$/

/** A plugin's icon is used only when it is a real file (not a link to somewhere else), small, and starts like a PNG. */
function isPng(path: string): boolean {
  try {
    const st = lstatSync(path)
    if (!st.isFile() || st.size > MAX_BYTES) return false
    const fd = openSync(path, 'r')
    try {
      const head = Buffer.alloc(8)
      readSync(fd, head, 0, 8, 0)
      return head.equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    } finally {
      closeSync(fd)
    }
  } catch {
    return false
  }
}

type Fetch = (url: string, init: { signal: AbortSignal }) => Promise<{ ok: boolean; headers: { get(name: string): string | null }; arrayBuffer(): Promise<ArrayBuffer | SharedArrayBuffer> }>

/** The icon of the plugin a skill sits in (`.claude-plugin/icon.png`, up to four folders above the skill). */
export function pluginIcon(skillDir: string): string | null {
  let d = skillDir
  for (let i = 0; i < 4; i++) {
    const icon = join(d, '.claude-plugin', 'icon.png')
    if (existsSync(icon)) return icon
    const up = dirname(d)
    if (up === d) break
    d = up
  }
  return null
}

/** The GitHub owner of a source such as `owner/repo`, `github.com/owner/repo` or a github.com link; null for anything else (a plugin name, a path). */
export function githubOwner(from: string | undefined): string | null {
  const m = from?.match(/^(?:(?:https:\/\/)?github\.com\/)?([A-Za-z0-9][A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]+?(?:\.git)?\/?$/)
  return m?.[1] ?? null
}

const dirOf = (root: string) => join(root, 'logos')
const kept = (root: string, id: string) => (['png', 'jpg'] as const).map((e) => join(dirOf(root), `${id}.${e}`)).find((p) => existsSync(p))

/** A kept logo as a data link the window can show; none when the skill has no logo. */
export function logoOf(root: string, id: string): string | undefined {
  const p = kept(root, id)
  if (!p) return undefined
  try {
    return `data:${MIME[p.endsWith('.jpg') ? 'jpg' : 'png']};base64,${readFileSync(p).toString('base64')}`
  } catch {
    return undefined
  }
}

/**
 * Keeps a logo for a skill: its plugin's own icon, else the picture of the GitHub owner it came from (fetched once;
 * a miss is remembered so it is not asked again until `force`). A skill with no source on GitHub gets none. True when the skill has a logo.
 */
export async function saveLogo(root: string, id: string, place: Pick<SkillPlace, 'kind' | 'real' | 'from'>, fetchFn: Fetch, force = false): Promise<boolean> {
  if (!SAFE.test(id)) return false
  const have = kept(root, id)
  if (have && !force) return true
  const none = join(dirOf(root), `${id}.none`)
  if (!force && existsSync(none)) return false
  mkdirSync(dirOf(root), { recursive: true })
  const put = (ext: string, write: (to: string) => void): boolean => {
    for (const e of ['png', 'jpg']) rmSync(join(dirOf(root), `${id}.${e}`), { force: true })
    write(join(dirOf(root), `${id}.${ext}`))
    rmSync(none, { force: true })
    return true
  }
  if (place.kind === 'plugin') {
    const icon = pluginIcon(place.real)
    if (icon && isPng(icon)) return put('png', (to) => copyFileSync(icon, to))
  }
  const owner = place.kind === 'plugin' ? null : githubOwner(place.from)
  if (!owner) return false
  try {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 8000)
    try {
      const res = await fetchFn(`https://github.com/${owner}.png?size=64`, { signal: ctl.signal })
      const ext = TYPES[(res.headers.get('content-type') ?? '').split(';')[0]!.trim()]
      const announced = Number(res.headers.get('content-length') ?? 0)
      const bytes = res.ok && ext && !(announced > MAX_BYTES) ? Buffer.from(await res.arrayBuffer()) : null
      if (bytes && bytes.length <= MAX_BYTES) return put(ext!, (to) => writeFileSync(to, bytes))
    } finally {
      clearTimeout(timer)
    }
  } catch {
    /* offline or slow: no logo */
  }
  writeFileSync(none, String(Date.now()))
  return false
}
