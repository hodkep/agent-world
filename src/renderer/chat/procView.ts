const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'fish'])
const base = (p: string) => p.split('/').pop() || p

/** How long a command has been running: seconds under a minute, then minutes, hours and days, as much as is worth reading. */
export function ranFor(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
  if (s < 86400) return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`
}

/** A long path with its middle left out, so the folder it starts in and the file it ends in both show. */
const shorten = (path: string) => {
  if (path.length <= 48) return path
  const parts = path.split('/')
  return parts.length > 4 ? `/${parts[1]}/${parts[2]}/…/${parts.at(-1)}` : path
}

/** A command line as a title (the program) and what it was given, so a long line reads at a glance; the whole line stays in a tooltip. */
export function describeCommand(command: string): { name: string; rest: string } {
  const [first = '', ...args] = command.trim().split(/\s+/)
  const name = base(first)
  if (SHELLS.has(name) && args.length) {
    if (args[0] === '-c' && args.length > 1) return describeCommand(args.slice(1).join(' '))
    if (/^(\/|\.\/|~)/.test(args[0]!)) return { name: `${name} script`, rest: [shorten(args[0]!), ...args.slice(1)].join(' ') }
  }
  return { name, rest: args.join(' ') }
}
