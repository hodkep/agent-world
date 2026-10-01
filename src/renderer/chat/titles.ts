const s = (v: unknown) => (typeof v === 'string' ? v : '')

export interface CommandTitle {
  /** The whole headline, e.g. "Wrote e2e/app.e2e.ts". */
  text: string
  /** True when the agent's own words (or the bare command) follow a plain "Ran". */
  ran: boolean
}

const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t)
const unquote = (t: string) => t.replace(/^(['"])(.*)\1$/, '$2')

/** Words of a simple command, honouring quotes. */
function words(cmd: string): string[] {
  return (cmd.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map(unquote)
}

/** Drops the flags (and the values of the few that take one) so what is left is what the command acts on. */
function operands(args: string[], takesValue: string[] = []): string[] {
  const out: string[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (takesValue.includes(a)) i++
    else if (!a.startsWith('-') || a === '-') out.push(a)
  }
  return out
}

/** One simple command, in plain words, or null when nothing sensible can be said. */
function summarizeOne(cmd: string): string | null {
  const w = words(cmd)
  if (w.length === 0) return null
  const [bin = '', ...args] = w
  const name = bin.split('/').pop()!
  const rest = operands(args)
  const redirect = /(?:^|\s)>>?\s*("[^"]+"|'[^']+'|[^\s;&|<>]+)/.exec(cmd)?.[1]
  if ((name === 'cat' || name === 'echo' || name === 'printf') && redirect) return `Wrote ${unquote(redirect)}`
  if (name === 'tee' && rest[0]) return `Wrote ${rest[0]}`
  if (name === 'cat' && rest.length) return `Read ${rest.length === 1 ? rest[0] : `${rest.length} files`}`
  if (name === 'sed' && args.includes('-n') && rest.length >= 2) {
    const range = /^(\d+)(?:,(\d+))?p$/.exec(rest[0]!)
    if (range) return `Read ${range[2] ? `lines ${range[1]}–${range[2]}` : `line ${range[1]}`} of ${rest[rest.length - 1]}`
  }
  if ((name === 'head' || name === 'tail') && rest.length) return `Read the ${name === 'head' ? 'start' : 'end'} of ${rest[rest.length - 1]}`
  if (name === 'grep' || name === 'rg' || name === 'egrep') {
    const [pattern, ...paths] = operands(args, ['-e', '-A', '-B', '-C', '-m', '--include', '--exclude', '-g', '--type'])
    if (pattern) return `Searched for “${clip(pattern, 40)}”${paths.length ? ` in ${paths.length === 1 ? paths[0] : `${paths.length} places`}` : ''}`
  }
  if (name === 'ls') return `Listed ${rest[0] ?? 'the folder'}`
  if (name === 'find') return `Found files${rest[0] ? ` under ${rest[0]}` : ''}`
  if (name === 'mkdir') return `Created ${rest[0] ?? 'a folder'}`
  if (name === 'rm') return `Deleted ${rest[0] ?? 'files'}`
  if (name === 'cp') return `Copied ${rest[0] ?? 'files'}`
  if (name === 'mv') return `Moved ${rest[0] ?? 'files'}`
  if (name === 'curl' || name === 'wget') return `Fetched ${rest[0] ?? 'a page'}`
  if (name === 'git') {
    const sub = args.find((a) => !a.startsWith('-'))
    const known: Record<string, string> = { status: 'Checked git status', diff: 'Looked at the changes', log: 'Read the git history', add: 'Staged changes', commit: 'Committed', push: 'Pushed', pull: 'Pulled', checkout: 'Switched branch', branch: 'Looked at branches', merge: 'Merged', stash: 'Stashed changes', show: 'Looked at a commit' }
    if (sub && known[sub]) return known[sub]!
  }
  const run = ['npm', 'pnpm', 'yarn', 'npx', 'bun'].includes(name)
  const sub = args.filter((a) => !a.startsWith('-')).join(' ')
  if (run || name === 'pytest' || name === 'vitest' || name === 'jest') {
    if (/\b(playwright|e2e)\b/.test(sub) || /playwright/.test(cmd)) return 'Ran the end-to-end tests'
    if (name === 'pytest' || /\b(test|tests|vitest|jest)\b/.test(sub) || name === 'vitest' || name === 'jest') return 'Ran the tests'
    if (/\b(build|dist|pack)\b/.test(sub) || /electron-(vite|builder)/.test(sub)) return 'Built the project'
    if (/\b(install|add|i)\b/.test(sub.split(' ')[0] ?? '')) return 'Installed packages'
    if (/\b(typecheck|tsc|lint)\b/.test(sub) || /^tsc\b/.test(sub)) return 'Checked types'
  }
  if (name === 'tsc') return 'Checked types'
  if ((name === 'python' || name === 'python3' || name === 'node') && rest[0] && !/^-/.test(rest[0])) return `Ran ${rest[0]}`
  return null
}

/** What a command card says on its first line: the agent's own description, else a plain-words summary, else the command. */
export function bashTitle(input: Record<string, unknown>): CommandTitle {
  const described = s(input.description).trim()
  if (described) return { text: described, ran: true }
  const raw = s(input.command).trim()
  // Skip a leading `cd somewhere &&`, then take the first command of a chain or pipe.
  // A heredoc's text is file content, not more commands.
  const noDocs = raw.replace(/(<<-?\s*['"]?(\w+)['"]?)[^\n]*\n[\s\S]*?(?:\n\s*\2\s*(?:\n|$)|$)/g, '$1\n')
  const body = noDocs.replace(/^\s*cd\s+\S+\s*(?:&&|;)\s*/, '')
  const parts = body.split(/\s*(?:&&|;|\n)\s*/).filter(Boolean)
  const firstOne = (parts[0] ?? '').split(/\s*\|\s*(?!\|)/)[0]!.replace(/<<-?\s*['"]?\w+['"]?[\s\S]*$/, '').trim()
  const summary = summarizeOne(firstOne)
  if (summary) {
    const more = parts.length - 1
    return { text: more > 0 ? `${summary} (+${more} more)` : summary, ran: false }
  }
  const flat = raw.replace(/\s+/g, ' ')
  return { text: flat ? clip(flat, 72) : 'a command', ran: true }
}
