import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { delimiter, join } from 'node:path'

/** Runs `npx -y <args>`; `onLine` gets the output as it comes. */
export type Run = (args: string[], onLine?: (line: string) => void) => Promise<{ code: number; out: string }>

const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g
const clean = (s: string) => s.replace(ANSI, '').replace(/\r/g, '\n')
/** Spinner frames and npm's own notices about itself are not what the CLI said. */
const quiet = (l: string) => !l.replace(/^[│◇●└┌├■]\s*/, '').trim() || /^[◒◐◓◑]/.test(l) || /^npm (notice|warn)/i.test(l)
const bare = (l: string) => l.replace(/^[│◇●└┌├■]\s*/, '').trim()
/** What the CLI said when it failed: its error line and the one after it, else its last lines. */
const said = (out: string) => {
  const lines = clean(out).split('\n').filter((l) => !quiet(l))
  const at = lines.findIndex((l) => l.startsWith('■'))
  return (at >= 0 ? lines.slice(at, at + 2) : lines.slice(-3)).map(bare).join(': ').trim()
}

/** A GitHub repository (`owner/repo`) or a github.com link: nothing that could be read as an option or a path. */
export function validPackage(p: string): boolean {
  return /^(?:https:\/\/github\.com\/)?[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]*\/?$/.test(p)
}
const validName = (n: string) => /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(n)

/** The skills a repository holds, from the CLI's `-l` listing: a name line, then its description. */
export function parseList(out: string): { name: string; description: string }[] {
  const lines = clean(out).split('\n')
  const start = lines.findIndex((l) => l.includes('Available Skills'))
  if (start < 0) return []
  const skills: { name: string; description: string }[] = []
  for (const l of lines.slice(start + 1)) {
    if (l.startsWith('└')) break
    const m = l.match(/^│( {4}| {6})(\S.*)$/)
    if (!m) continue
    if (m[1]!.length === 4) skills.push({ name: m[2]!.trim(), description: '' })
    else if (skills.length) skills[skills.length - 1]!.description = m[2]!.trim()
  }
  return skills
}

export async function listSkills(pkg: string, run: Run): Promise<{ name: string; description: string }[]> {
  if (!validPackage(pkg)) throw new Error('Give a GitHub repository such as owner/repo, or its github.com link.')
  const r = await run(['skills', 'add', pkg, '-l'])
  if (r.code !== 0) throw new Error(said(r.out) || 'The skills CLI failed.')
  return parseList(r.out)
}

/** Installs the named skills into the skills CLI's own store (`~/.agents/skills`), for every agent that reads it: no agent is chosen, so nothing is linked into one program's folder by name. */
export async function installSkills(pkg: string, names: string[], run: Run, onLine: (line: string) => void): Promise<{ name: string; path: string }[]> {
  if (!validPackage(pkg)) throw new Error('Give a GitHub repository such as owner/repo, or its github.com link.')
  if (!names.length || !names.every(validName)) throw new Error('A skill name is a plain name: letters, digits, dots, dashes.')
  const r = await run(['skills', 'add', pkg, '-g', '-y', '--json', '-s', ...names], onLine)
  if (r.code !== 0) throw new Error(said(r.out) || 'The skills CLI failed.')
  const at = clean(r.out).lastIndexOf('\n[')
  try {
    const rows = JSON.parse(clean(r.out).slice(at + 1)) as { name?: string; status?: string; path?: string }[]
    return rows.filter((x) => x.name && x.path && x.status !== 'failed').map((x) => ({ name: x.name!, path: x.path! }))
  } catch {
    throw new Error('The skills CLI finished but did not say what it installed.')
  }
}

/** The folders a Node install usually puts `npx` in: a program started from the Dock does not get the PATH of a terminal. */
function npxDirs(home: string): string[] {
  const dirs = ['/opt/homebrew/bin', '/usr/local/bin', join(home, '.volta', 'bin'), join(home, '.local', 'share', 'fnm', 'aliases', 'default', 'bin')]
  try {
    const base = join(home, '.nvm', 'versions', 'node')
    for (const v of readdirSync(base).sort().reverse()) dirs.push(join(base, v, 'bin'))
  } catch {
    /* no nvm */
  }
  return dirs
}

/** The real runner: `npx -y …` with HOME set to the person's home, or an error that says to install Node. */
export function npxRunner(home: string, env: NodeJS.ProcessEnv = process.env): Run {
  return (args, onLine) =>
    new Promise((resolve, reject) => {
      const path = [...(env.PATH ?? '').split(delimiter), ...npxDirs(home)].filter(Boolean)
      if (!path.some((d) => existsSync(join(d, 'npx')))) return reject(new Error('npx was not found. Install Node.js, or run `npx skills add <repository> -g` in a terminal.'))
      const p = spawn('npx', ['-y', ...args], { env: { ...env, HOME: home, PATH: path.join(delimiter), NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'] })
      let out = ''
      let tail = ''
      const take = (b: Buffer) => {
        const s = b.toString()
        out += s
        tail += s
        const parts = clean(tail).split('\n')
        tail = parts.pop() ?? ''
        for (const l of parts) if (!quiet(l)) onLine?.(l)
      }
      p.stdout.on('data', take)
      p.stderr.on('data', take)
      p.on('error', reject)
      p.on('close', (code) => resolve({ code: code ?? 1, out }))
    })
}
