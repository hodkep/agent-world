const s = (v: unknown) => (typeof v === 'string' ? v : '')

/** The agent's own description of a command when it gave one; otherwise the start of the command itself. */
export function bashTitle(input: Record<string, unknown>): string {
  const first = s(input.command).replace(/\s+/g, ' ').trim()
  return s(input.description) || (first.length > 72 ? `${first.slice(0, 71).trimEnd()}…` : first) || 'a command'
}
