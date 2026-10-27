import { readFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

import type { PaletteCommand } from '../../../shared/commands'
import { commands, describe, skills } from '../shared/skills'

// The built-ins worth a click; menus Claude opens itself (/rewind, /resume) are included because the
// terminal is right there to answer them.
const BUILT_INS: PaletteCommand[] = [
  { name: 'compact', description: 'Summarize the conversation to free up context', source: 'built-in', args: true },
  { name: 'clear', description: 'Start a fresh conversation in the same terminal', source: 'built-in', args: false },
  { name: 'context', description: 'Show what is using the context window', source: 'built-in', args: false },
  { name: 'btw', description: 'Ask a side question without interrupting the current task', source: 'built-in', args: true },
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
  const fromSkills = await Promise.all((skillPlaces.length ? skillPlaces : [join(root, 'skills')]).map((d) => skills(d, 'plugin skill', prefix, 4)))
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
export const claudeCommands = { list: (cwd: string, home: string) => listCommands(cwd, home) }

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

