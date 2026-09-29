import { readdir, readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

export interface PaletteCommand {
  name: string
  description: string
  source: 'built-in' | 'project skill' | 'project command' | 'your skill' | 'your command'
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
  { name: 'usage', description: 'Show plan usage and limits', source: 'built-in', args: false }
]

function describe(text: string) {
  const front = /^---\n([\s\S]*?)\n---/.exec(text)?.[1]
  const fromFront = front && /^description:\s*(.+)$/m.exec(front)?.[1]
  if (fromFront) return fromFront.trim().replace(/^["']|["']$/g, '')
  const body = front ? text.slice(text.indexOf('---', 3) + 3) : text
  return body.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('#')) ?? ''
}

async function skills(dir: string, source: PaletteCommand['source']): Promise<PaletteCommand[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const found = await Promise.all(
    entries
      .filter((e) => e.isDirectory())
      .map(async (e) => {
        const text = await readFile(join(dir, e.name, 'SKILL.md'), 'utf8').catch(() => null)
        if (text === null) return null
        const name = /^name:\s*(.+)$/m.exec(/^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? '')?.[1]?.trim() ?? e.name
        return { name, description: describe(text), source, args: true }
      })
  )
  return found.filter((c): c is PaletteCommand => !!c)
}

async function commands(dir: string, source: PaletteCommand['source']): Promise<PaletteCommand[]> {
  const files = (await readdir(dir, { recursive: true }).catch(() => [])).filter((f) => f.endsWith('.md'))
  return Promise.all(
    files.map(async (f) => ({
      // Commands in subfolders are namespaced the way Claude names them: db/migrate.md is /db:migrate.
      name: relative(dir, join(dir, f)).slice(0, -3).split(sep).join(':'),
      description: describe(await readFile(join(dir, f), 'utf8').catch(() => '')),
      source,
      args: true
    }))
  )
}

/** Everything the palette can offer for an agent working in `cwd`; project entries shadow the user's own. */
export async function listCommands(cwd: string, home: string): Promise<PaletteCommand[]> {
  const groups = await Promise.all([
    skills(join(cwd, '.claude', 'skills'), 'project skill'),
    commands(join(cwd, '.claude', 'commands'), 'project command'),
    skills(join(home, '.claude', 'skills'), 'your skill'),
    commands(join(home, '.claude', 'commands'), 'your command')
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
