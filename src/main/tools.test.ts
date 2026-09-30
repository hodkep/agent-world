import { describe, expect, it } from 'vitest'
import { manageArgs, parseMcpList, parsePlugins } from './tools'

describe('claude mcp list', () => {
  it('reads name, target and health from each line', () => {
    const out = [
      'Checking MCP server health…',
      '',
      'claude.ai Slack: https://mcp.slack.com/mcp - ✔ Connected',
      'claude.ai Notion: https://mcp.notion.com/mcp - ! Needs authentication',
      'db: npx -y @acme/db-mcp --url x - ✗ Failed to connect'
    ].join('\n')
    expect(parseMcpList(out)).toEqual([
      { name: 'claude.ai Slack', target: 'https://mcp.slack.com/mcp', health: 'ok', status: 'Connected' },
      { name: 'claude.ai Notion', target: 'https://mcp.notion.com/mcp', health: 'attention', status: 'Needs authentication' },
      { name: 'db', target: 'npx -y @acme/db-mcp --url x', health: 'failed', status: 'Failed to connect' }
    ])
  })

  it('handles the ✘ mark, plugin-style names with colons and reasons after the status', () => {
    expect(parseMcpList('plugin:eng:github: https://api.example/mcp/ (HTTP) - ✘ Failed to connect — no dynamic client registration')).toEqual([
      { name: 'plugin:eng:github', target: 'https://api.example/mcp/ (HTTP)', health: 'failed', status: 'Failed to connect — no dynamic client registration' }
    ])
  })

  it('returns nothing for the empty-state message', () => {
    expect(parseMcpList('No MCP servers configured. Use `claude mcp add` to add a server.')).toEqual([])
  })
})

describe('claude plugin list --json', () => {
  it('keeps id, version, scope and whether it is enabled', () => {
    const json = JSON.stringify([{ id: 'a@m', version: '1.0', scope: 'user', enabled: true, installPath: '/x' }, { id: 'b@m', version: '2', scope: 'project', enabled: false }])
    expect(parsePlugins(json)).toEqual([
      { id: 'a@m', version: '1.0', scope: 'user', enabled: true },
      { id: 'b@m', version: '2', scope: 'project', enabled: false }
    ])
  })

  it('tolerates junk output', () => {
    expect(parsePlugins('not json')).toEqual([])
  })
})

describe('manageArgs', () => {
  it('adds an http server at project-local scope', () => {
    expect(manageArgs({ kind: 'mcp-add-http', name: 'docs', url: 'https://docs.example/mcp' })).toEqual(['mcp', 'add', '--scope', 'local', '--transport', 'http', 'docs', 'https://docs.example/mcp'])
  })
  it('adds a stdio server, keeping its arguments after --', () => {
    expect(manageArgs({ kind: 'mcp-add-stdio', name: 'db', command: 'npx', args: ['-y', 'fake-db'] })).toEqual(['mcp', 'add', '--scope', 'local', 'db', '--', 'npx', '-y', 'fake-db'])
  })
  it('removes a server and toggles or removes a plugin', () => {
    expect(manageArgs({ kind: 'mcp-remove', name: 'docs' })).toEqual(['mcp', 'remove', 'docs'])
    expect(manageArgs({ kind: 'plugin-disable', id: 'a@m' })).toEqual(['plugin', 'disable', 'a@m'])
    expect(manageArgs({ kind: 'plugin-enable', id: 'a@m' })).toEqual(['plugin', 'enable', 'a@m'])
    expect(manageArgs({ kind: 'plugin-uninstall', id: 'a@m' })).toEqual(['plugin', 'uninstall', 'a@m'])
  })
  it('refuses names that could be read as options, and non-http urls', () => {
    expect(() => manageArgs({ kind: 'mcp-remove', name: '--scope' })).toThrow()
    expect(() => manageArgs({ kind: 'plugin-enable', id: '-x' })).toThrow()
    expect(() => manageArgs({ kind: 'mcp-add-http', name: 'x', url: 'file:///etc/passwd' })).toThrow()
    expect(() => manageArgs({ kind: 'mcp-add-stdio', name: 'x', command: '', args: [] })).toThrow()
  })
})
