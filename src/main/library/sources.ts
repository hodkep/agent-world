import { readFile, readdir, realpath } from 'node:fs/promises'
import { basename, join, resolve, relative, isAbsolute, sep } from 'node:path'
import { describe as describeText, skillDirs } from '../providers/shared/skills'
import { parseDoc } from './doc'
import type { Library } from './store'

import type { LibraryCandidate } from '../../shared/library'
export type Candidate = LibraryCandidate

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : typeof v === 'string' ? [v] : [])
const inside = (root: string, p: string) => {
  const full = resolve(root, p)
  const rel = relative(root, full)
  return rel.startsWith('..') || isAbsolute(rel) ? null : full
}

type Extra = Pick<Candidate, 'kind'> & Partial<Pick<Candidate, 'project' | 'from' | 'license' | 'accounts'>>

async function candidatesIn(dir: string, source: string, depth: number, extra: Extra, from?: (real: string) => string | undefined): Promise<Candidate[]> {
  const dirs = await skillDirs(dir, depth)
  return Promise.all(
    dirs.map(async (d) => {
      const text = await readFile(join(d, 'SKILL.md'), 'utf8').catch(() => '')
      const doc = parseDoc(text)
      const real = await realpath(d).catch(() => d)
      const found = from?.(real)
      return { source, name: doc.name || d.split(/[\\/]/).pop()!, description: doc.description || describeText(text), dir: d, real, ...extra, ...(found && !extra.from && { from: found }) }
    })
  )
}

const json = async (file: string) => JSON.parse(await readFile(file, 'utf8').catch(() => '{}'))

/** Where the skills CLI got each skill it installed (its lock file), as a place the person can recognise. */
async function lockSources(home: string): Promise<(real: string) => string | undefined> {
  const lock = (await json(join(home, '.agents', '.skill-lock.json'))).skills as Record<string, { source?: string; sourceType?: string }> | undefined
  // Compared as real paths, since a skill found through a link is known by its real folder.
  const root = (await realpath(join(home, '.agents', 'skills')).catch(() => join(home, '.agents', 'skills'))) + sep
  return (real) => {
    if (!lock || !real.startsWith(root)) return undefined
    const l = lock[real.slice(root.length).split(sep)[0]!]
    return l?.source ? (l.sourceType === 'github' ? `github.com/${l.source}` : l.source) : undefined
  }
}

/** The skills of the Claude plugins of one account folder that are installed and switched on, by the folders each plugin's manifest names (or skills/). */
async function pluginCandidates(configDir: string, account?: string): Promise<Candidate[]> {
  const installed: Record<string, { installPath: string; version?: string }[]> = (await json(join(configDir, 'plugins', 'installed_plugins.json'))).plugins ?? {}
  const enabled: Record<string, boolean> = (await json(join(configDir, 'settings.json'))).enabledPlugins ?? {}
  const out = await Promise.all(
    Object.entries(installed)
      .filter(([key, installs]) => enabled[key] === true && installs[0])
      .map(async ([key, installs]) => {
        const root = installs[0]!.installPath
        const manifest = (await json(join(root, '.claude-plugin', 'plugin.json'))) as { skills?: unknown; version?: string; license?: string }
        const places = asList(manifest.skills).flatMap((p) => inside(root, p) ?? [])
        const name = key.split('@')[0]!
        const version = installs[0]!.version ?? manifest.version
        const found = await Promise.all((places.length ? places : [join(root, 'skills')]).map((p) => candidatesIn(p, `Claude plugin ${name}`, 4, { kind: 'plugin', from: `${name}${version ? ` ${version}` : ''}`, ...(manifest.license && { license: manifest.license }), ...(account && { accounts: [account] }) })))
        return found.flat()
      })
  )
  return out.flat()
}

/** Plugins Claude puts in an account by itself (the claude.ai plugin directory), in folders named by id: the name, version and licence are in each plugin's own manifest. */
async function syncedCandidates(configDir: string, account: string): Promise<Candidate[]> {
  const base = join(configDir, 'plugins', 'synced')
  const buckets = (await readdir(base, { withFileTypes: true }).catch(() => [])).filter((e) => e.isDirectory() && !e.name.startsWith('.'))
  const out = await Promise.all(
    buckets.map(async (b) => {
      const plugins = (await readdir(join(base, b.name), { withFileTypes: true }).catch(() => [])).filter((e) => e.isDirectory())
      return Promise.all(
        plugins.map(async (p) => {
          const root = join(base, b.name, p.name)
          const m = (await json(join(root, '.claude-plugin', 'plugin.json'))) as { name?: string; version?: string; license?: string }
          if (!m.name) return []
          return candidatesIn(join(root, 'skills'), `Claude plugin ${m.name}`, 4, { kind: 'plugin', from: `${m.name}${m.version ? ` ${m.version}` : ''}`, ...(m.license && { license: m.license }), accounts: [account] })
        })
      )
    })
  )
  return out.flat(2)
}

export interface ScanOptions {
  home: string
  /** The open project: its skills are named as "this project's". */
  folder?: string
  /** Every project the app knows. */
  folders?: string[]
  /** Every Claude account the app has: its own folder holds its plugins. */
  accounts?: { name: string; dir: string }[]
}

/** Every skill folder this computer has in the usual places: yours, every project's, other programs', and the plugins of every account. A folder reached by two paths is one skill. */
export async function scanSources(o: ScanOptions): Promise<Candidate[]> {
  const from = await lockSources(o.home)
  const projects = [...new Set([...(o.folder ? [o.folder] : []), ...(o.folders ?? [])])]
  const accounts = o.accounts ?? []
  const groups = await Promise.all([
    candidatesIn(join(o.home, '.claude', 'skills'), '~/.claude/skills', 1, { kind: 'global' }, from),
    candidatesIn(join(o.home, '.agents', 'skills'), '~/.agents/skills', 1, { kind: 'global' }, from),
    candidatesIn(join(o.home, '.gemini', 'skills'), '~/.gemini/skills', 1, { kind: 'global' }),
    candidatesIn(join(o.home, '.gemini', 'antigravity', 'skills'), '~/.gemini/antigravity/skills', 1, { kind: 'global' }),
    candidatesIn(join(o.home, '.gemini', 'antigravity-cli', 'skills'), '~/.gemini/antigravity-cli/skills', 1, { kind: 'global' }),
    ...projects.flatMap((p) => {
      const label = (sub: string) => (p === o.folder ? `this project's ${sub}` : `${basename(p)}'s ${sub}`)
      return [candidatesIn(join(p, '.claude', 'skills'), label('.claude/skills'), 1, { kind: 'project', project: p }), candidatesIn(join(p, '.agents', 'skills'), label('.agents/skills'), 1, { kind: 'project', project: p })]
    }),
    pluginCandidates(join(o.home, '.claude')),
    ...accounts.flatMap((a) => [pluginCandidates(a.dir, a.name), syncedCandidates(a.dir, a.name)])
  ])
  const seen = new Set<string>()
  const plugins = new Map<string, Candidate>()
  const out: Candidate[] = []
  for (const c of groups.flat()) {
    if (c.kind === 'plugin') {
      // One plugin skill, however many accounts have it: they are listed on it.
      const key = `${c.from}/${c.name}`
      const have = plugins.get(key)
      if (have) have.accounts = [...new Set([...(have.accounts ?? []), ...(c.accounts ?? [])])]
      else (plugins.set(key, c), out.push(c))
    } else if (!seen.has(c.real)) (seen.add(c.real), out.push(c))
  }
  return out
}

/** Copies the chosen skills into the library. One whose name the library already has is skipped, and said so. */
export async function importCandidates(lib: Library, chosen: Candidate[]): Promise<{ added: string[]; skipped: { name: string; reason: string }[] }> {
  const added: string[] = []
  const skipped: { name: string; reason: string }[] = []
  for (const c of chosen) {
    const item = await lib.addSkillFolder(c.dir, c.source, { kind: c.kind, ...(c.project && { project: c.project }), ...(c.from && { from: c.from }), ...(c.license && { license: c.license }), ...(c.accounts && { accounts: c.accounts }) })
    if (item) added.push(item.id)
    else skipped.push({ name: c.name, reason: 'already in the library, or not a skill' })
  }
  return { added, skipped }
}
