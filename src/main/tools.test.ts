import { describe, expect, it } from 'vitest'
import { parseMcpList, parsePlugins } from './tools'

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
