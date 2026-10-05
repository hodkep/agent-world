/** The line typed into the agent's terminal. Names are checked and arguments cleaned: this reaches a TUI. */
export function commandLine(name: string, args: string) {
  if (!/^[\w.-]+(?::[\w.-]+)*$/.test(name)) throw new Error(`Not a command name: ${name}`)
  const clean = args.replace(/\x1b\[20[01]~/g, '').replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim()
  return clean ? `/${name} ${clean}` : `/${name}`
}
