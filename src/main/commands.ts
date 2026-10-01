import { readdir, readFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

export interface PaletteCommand {
  name: string
  description: string
  source: 'built-in' | 'project skill' | 'project command' | 'your skill' | 'your command' | 'plugin skill' | 'plugin command'
  /** Takes free-text arguments after the name. */
  args: boolean
}

// The built-ins worth a click; menus Claude opens itself (/rewind, /resume) are included because the
// terminal is right there to answer them.
const BUILT_INS: PaletteCommand[] = [
  { name: 'compact', description: 'Summarize the conversation to free up context', source: 'built-in', args: true },
  { name: 'clear', description: 'Start a fresh conversation in the same terminal', source: 'built-in', args: false },
  { name: 'context', description: 'Show what is using the context window', source: 'built-in', args: false },
  { name: 'rewind', description: 'Go back to an earlier point (code and conversation)', source: 'built-in', args: false },
  { name: 'review', description: 'Review the changes on this branch', source: 'built-in', args: true },
  { name: 'security-review', description: 'Security review of the pending changes', source: 'built-in', args: false },
  { name: 'init', description: 'Write a CLAUDE.md describing this codebase', source: 'built-in', args: false },
  { name: 'usage', description: 'Show plan usage and limits', source: 'built-in', args: false },
  { name: 'help', description: 'Show help and the available commands', source: 'built-in', args: false },
  { name: 'model', description: 'Choose the model for this session', source: 'built-in', args: true },
  { name: 'mcp', description: 'Manage MCP servers and sign in to them', source: 'built-in', args: false },
  { name: 'agents', description: 'Manage Claude\'s own subagents', source: 'built-in', args: false },
  { name: 'memory', description: 'Edit the CLAUDE.md memory files', source: 'built-in', args: false },
  { name: 'permissions', description: 'See and change what Claude may do without asking', source: 'built-in', args: false },
  { name: 'hooks', description: 'See the configured hooks', source: 'built-in', args: false },
  { name: 'config', description: 'Open Claude\'s settings', source: 'built-in', args: false },
  { name: 'cost', description: 'Show what this session has cost', source: 'built-in', args: false },
  { name: 'status', description: 'Show version, model, account and connectivity', source: 'built-in', args: false },
  { name: 'doctor', description: 'Check the Claude installation', source: 'built-in', args: false },
  { name: 'add-dir', description: 'Let Claude work in another folder too', source: 'built-in', args: true },
  { name: 'resume', description: 'Pick an earlier conversation to continue', source: 'built-in', args: false },
  { name: 'export', description: 'Export this conversation as text', source: 'built-in', args: true },
  { name: 'pr-comments', description: 'Show the comments on a pull request', source: 'built-in', args: true }
]

function describe(text: string) {
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
async function skillDirs(dir: string, depth = 4): Promise<string[]> {
  if (await readFile(join(dir, 'SKILL.md'), 'utf8').then(() => true, () => false)) return [dir]
  if (depth === 0) return []
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const found = await Promise.all(entries.filter((e) => e.isDirectory() && e.name !== 'node_modules' && !e.name.startsWith('.')).map((e) => skillDirs(join(dir, e.name), depth - 1)))
  return found.flat()
}

async function skills(dir: string, source: PaletteCommand['source'], prefix = ''): Promise<PaletteCommand[]> {
  const found = await Promise.all((await skillDirs(dir)).map((d) => skillAt(d, source, prefix)))
  return found.filter((c): c is PaletteCommand => !!c)
}

async function commands(dir: string, source: PaletteCommand['source'], prefix = ''): Promise<PaletteCommand[]> {
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

const asList = (v: unknown): string[] => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

/** A path the plugin's manifest names, kept inside the plugin's own folder. */
const inside = (root: string, p: string) => {
  const full = resolve(root, p)
  const rel = relative(root, full)
  return rel.startsWith('..') || isAbsolute(rel) ? null : full
}

/**
 * Where a plugin keeps its skills and commands: the folders its manifest (.claude-plugin/plugin.json) names, or skills/
 * and commands/ when it names none. Skills may sit in groups (skills/engineering/tdd), so each place is searched below.
 */
async function pluginEntries(root: string, name: string): Promise<PaletteCommand[]> {
  const manifest = JSON.parse(await readFile(join(root, '.claude-plugin', 'plugin.json'), 'utf8').catch(() => '{}')) as { skills?: unknown; commands?: unknown }
  const prefix = `${name}:`
  const skillPlaces = asList(manifest.skills).flatMap((p) => inside(root, p) ?? [])
  const commandPlaces = asList(manifest.commands).flatMap((p) => inside(root, p) ?? [])
  const fromSkills = await Promise.all((skillPlaces.length ? skillPlaces : [join(root, 'skills')]).map((d) => skills(d, 'plugin skill', prefix)))
  const fromCommands = await Promise.all(
    (commandPlaces.length ? commandPlaces : [join(root, 'commands')]).map(async (p) => {
      // A manifest may name a single command file as well as a folder of them.
      if (p.endsWith('.md')) {
        const text = await readFile(p, 'utf8').catch(() => null)
        return text === null ? [] : [{ name: prefix + (p.split(sep).pop() ?? '').slice(0, -3), description: describe(text), source: 'plugin command' as const, args: true }]
      }
      return commands(p, 'plugin command', prefix)
    })
  )
  return [...fromSkills.flat(), ...fromCommands.flat()]
}

/** Enabled plugins only (as in settings.json), named plugin:skill the way Claude lists them. */
async function plugins(home: string): Promise<PaletteCommand[]> {
  const json = async (file: string) => JSON.parse(await readFile(join(home, '.claude', file), 'utf8').catch(() => '{}'))
  const installed: Record<string, { installPath: string }[]> = (await json('plugins/installed_plugins.json')).plugins ?? {}
  const enabled: Record<string, boolean> = (await json('settings.json')).enabledPlugins ?? {}
  const found = await Promise.all(
    Object.entries(installed)
      .filter(([key, installs]) => enabled[key] === true && installs[0])
      .map(([key, installs]) => pluginEntries(installs[0]!.installPath, key.split('@')[0]!))
  )
  return found.flat()
}

/** Everything the palette can offer for an agent working in `cwd`; project entries shadow the user's own. */
export async function listCommands(cwd: string, home: string): Promise<PaletteCommand[]> {
  const groups = await Promise.all([
    skills(join(cwd, '.claude', 'skills'), 'project skill'),
    commands(join(cwd, '.claude', 'commands'), 'project command'),
    skills(join(home, '.claude', 'skills'), 'your skill'),
    commands(join(home, '.claude', 'commands'), 'your command'),
    plugins(home)
  ])
  const seen = new Set<string>()
  return [BUILT_INS, ...groups].flat().filter((c) => !seen.has(c.name) && seen.add(c.name))
}

/** The line typed into the agent's terminal. Names are checked and arguments cleaned: this reaches a TUI. */
export function commandLine(name: string, args: string) {
  if (!/^[\w.-]+(?::[\w.-]+)*$/.test(name)) throw new Error(`Not a command name: ${name}`)
  const clean = args.replace(/\x1b\[20[01]~/g, '').replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim()
  return clean ? `/${name} ${clean}` : `/${name}`
}
