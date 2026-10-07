import { readFile } from 'node:fs/promises'
import { join, resolve, relative, isAbsolute } from 'node:path'
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

async function candidatesIn(dir: string, source: string, depth: number): Promise<Candidate[]> {
  const dirs = await skillDirs(dir, depth)
  return Promise.all(
    dirs.map(async (d) => {
      const text = await readFile(join(d, 'SKILL.md'), 'utf8').catch(() => '')
      const doc = parseDoc(text)
      return { source, name: doc.name || d.split(/[\\/]/).pop()!, description: doc.description || describeText(text), dir: d }
    })
  )
}

/** The skills of Claude plugins that are installed and switched on, by the folders each plugin's manifest names (or skills/). */
async function pluginCandidates(home: string): Promise<Candidate[]> {
  const json = async (file: string) => JSON.parse(await readFile(join(home, '.claude', file), 'utf8').catch(() => '{}'))
  const installed: Record<string, { installPath: string }[]> = (await json('plugins/installed_plugins.json')).plugins ?? {}
  const enabled: Record<string, boolean> = (await json('settings.json')).enabledPlugins ?? {}
  const out = await Promise.all(
    Object.entries(installed)
      .filter(([key, installs]) => enabled[key] === true && installs[0])
      .map(async ([key, installs]) => {
        const root = installs[0]!.installPath
        const manifest = JSON.parse(await readFile(join(root, '.claude-plugin', 'plugin.json'), 'utf8').catch(() => '{}')) as { skills?: unknown }
        const places = asList(manifest.skills).flatMap((p) => inside(root, p) ?? [])
        const found = await Promise.all((places.length ? places : [join(root, 'skills')]).map((p) => candidatesIn(p, `Claude plugin ${key.split('@')[0]}`, 4)))
        return found.flat()
      })
  )
  return out.flat()
}

/** Every skill folder this computer has in the usual places: yours, the project's, other programs', and enabled plugins'. */
export async function scanSources(o: { home: string; folder?: string }): Promise<Candidate[]> {
  const groups = await Promise.all([
    candidatesIn(join(o.home, '.claude', 'skills'), '~/.claude/skills', 1),
    candidatesIn(join(o.home, '.gemini', 'skills'), '~/.gemini/skills', 1),
    candidatesIn(join(o.home, '.gemini', 'antigravity', 'skills'), '~/.gemini/antigravity/skills', 1),
    candidatesIn(join(o.home, '.gemini', 'antigravity-cli', 'skills'), '~/.gemini/antigravity-cli/skills', 1),
    o.folder ? candidatesIn(join(o.folder, '.claude', 'skills'), "this project's .claude/skills", 1) : [],
    o.folder ? candidatesIn(join(o.folder, '.agents', 'skills'), "this project's .agents/skills", 1) : [],
    pluginCandidates(o.home)
  ])
  const seen = new Set<string>()
  return groups.flat().filter((c) => !seen.has(c.dir) && seen.add(c.dir))
}

/** Copies the chosen skills into the library. One whose name the library already has is skipped, and said so. */
export async function importCandidates(lib: Library, chosen: Candidate[]): Promise<{ added: string[]; skipped: { name: string; reason: string }[] }> {
  const added: string[] = []
  const skipped: { name: string; reason: string }[] = []
  for (const c of chosen) {
    const item = await lib.addSkillFolder(c.dir, c.source)
    if (item) added.push(item.id)
    else skipped.push({ name: c.name, reason: 'already in the library, or not a skill' })
  }
  return { added, skipped }
}
