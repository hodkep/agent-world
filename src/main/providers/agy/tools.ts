import type { ManageAction } from '../../../shared/types'
import type { ToolPlugin, ToolServer, ToolsManager } from '../ports'

const NAME = /^[A-Za-z0-9][\w.@:-]*$/

/** An address as its site only: keys are put in the query, in the path, or before the host. */
function siteOf(address: string) {
  try {
    return new URL(address).origin
  } catch {
    return '(address hidden)'
  }
}

/**
 * `agy mcp list` prints a table whose last column is the whole command line, and that is where keys get passed (--api-key=…, a header).
 * Only the program, or the address without its query, is shown; the rest stays hidden.
 */
export function parseAgyMcp(out: string): ToolServer[] {
  return out.split('\n').flatMap((line): ToolServer[] => {
    const m = /^(\S+)\s+(stdio|http)\s+(enabled|disabled)\s+(\S.*)$/.exec(line.trim())
    if (!m) return []
    const [, name, kind, state, rest] = m
    const first = rest!.split(/\s+/)[0]!
    const target = kind === 'http' ? siteOf(first) : /[=:]/.test(first) ? '(command hidden)' : rest!.trim() === first ? first : `${first} (arguments hidden)`
    return [{ name: name!, target, health: state === 'enabled' ? 'ok' : 'attention', status: state! }]
  })
}

/** `agy plugin list` says "No imported plugins." or lists one a line (id, version, state); the format is not documented, so this reads it loosely. */
export function parseAgyPlugins(out: string): ToolPlugin[] {
  return out.split('\n').flatMap((line): ToolPlugin[] => {
    const t = line.trim()
    if (!t || /^no\b/i.test(t)) return []
    const [id, version = ''] = t.split(/\s+/)
    return [{ id: id!, version: /^\d/.test(version) ? version : '', scope: 'agy', enabled: !/\bdisabled\b/i.test(t) }]
  })
}

export const agyTools: ToolsManager = {
  list: { servers: ['mcp', 'list'], plugins: ['plugin', 'list'] },
  parse: (servers, plugins) => ({ mcp: parseAgyMcp(servers), plugins: parseAgyPlugins(plugins) }),
  manage(a: ManageAction) {
    const name = 'name' in a ? a.name : 'id' in a ? a.id : ''
    if (!NAME.test(name)) throw new Error(`"${name}" is not a valid name.`)
    switch (a.kind) {
      case 'mcp-add-http':
        if (!/^https?:\/\/\S+$/.test(a.url)) throw new Error('The address must start with http:// or https://.')
        return ['mcp', 'add', '--type', 'http', a.name, a.url]
      case 'mcp-add-stdio':
        if (!a.command.trim()) throw new Error('Enter the command that starts the server.')
        return ['mcp', 'add', a.name, '--', a.command.trim(), ...a.args]
      case 'mcp-remove':
        return ['mcp', 'remove', a.name]
      default:
        return ['plugin', a.kind.slice('plugin-'.length), a.id]
    }
  }
}
