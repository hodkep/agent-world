import { describe, expect, it } from 'vitest'
import { agyTools, parseAgyMcp, parseAgyPlugins } from './tools'

// A made-up list in the shape agy prints (the real one carries keys in the command column).
const LIST = [
  'NAME      TYPE   STATUS    COMMAND/URL',
  'stitch    stdio  disabled  npx -y mcp-remote https://stitch.example/mcp --header X-Goog-Api-Key: SECRETKEY123',
  'payments  stdio  enabled   npx -y @pay/mcp --tools=all --api-key=sk_test_SECRET456',
  'docs      http   enabled   https://docs.example/mcp?token=SECRET789',
  'private   http   enabled   https://user:PASSWORD1@host.example/mcp/PATHTOKEN2/v1',
  'envcmd    stdio  enabled   API_KEY=ENVSECRET3 node server.js',
  ''
].join('\n')

describe('what agy says is connected', () => {
  it('gives each server with its kind and whether it is on', () => {
    const r = parseAgyMcp(LIST)
    expect(r.map((s) => [s.name, s.health, s.status])).toEqual([['stitch', 'attention', 'disabled'], ['payments', 'ok', 'enabled'], ['docs', 'ok', 'enabled'], ['private', 'ok', 'enabled'], ['envcmd', 'ok', 'enabled']])
  })
  it('never shows what is after the program name, since that is where keys are passed', () => {
    const shown = JSON.stringify(parseAgyMcp(LIST))
    for (const secret of ['SECRETKEY123', 'sk_test_SECRET456', 'SECRET789', 'PASSWORD1', 'PATHTOKEN2', 'ENVSECRET3', '--api-key', 'X-Goog-Api-Key']) expect(shown).not.toContain(secret)
    expect(parseAgyMcp(LIST)[0]!.target).toBe('npx (arguments hidden)')
    // An address is shown as the site only: a token can sit in its query, its path or before the host.
    expect(parseAgyMcp(LIST)[2]!.target).toBe('https://docs.example')
    expect(parseAgyMcp(LIST)[3]!.target).toBe('https://host.example')
    expect(parseAgyMcp(LIST)[4]!.target).toBe('(command hidden)')
  })
  it('ignores the header and anything else that is not a server', () => {
    expect(parseAgyMcp('No MCP servers configured.\n')).toEqual([])
  })
})

describe('agy plugins', () => {
  it('is empty when none were imported', () => {
    expect(parseAgyPlugins('No imported plugins.\n')).toEqual([])
  })
  it('lists one per line, off when the line says it is disabled', () => {
    expect(parseAgyPlugins('design@market  1.2.0  enabled\nold@market  0.1.0  disabled\n')).toEqual([
      { id: 'design@market', version: '1.2.0', scope: 'agy', enabled: true },
      { id: 'old@market', version: '0.1.0', scope: 'agy', enabled: false }
    ])
  })
})

describe('changing what agy has connected', () => {
  it('uses agy\'s own commands, with flags before the name', () => {
    expect(agyTools.manage({ kind: 'mcp-add-http', name: 'docs', url: 'https://docs.example/mcp' })).toEqual(['mcp', 'add', '--type', 'http', 'docs', 'https://docs.example/mcp'])
    expect(agyTools.manage({ kind: 'mcp-add-stdio', name: 'fs', command: 'npx', args: ['-y', 'srv'] })).toEqual(['mcp', 'add', 'fs', '--', 'npx', '-y', 'srv'])
    expect(agyTools.manage({ kind: 'mcp-remove', name: 'fs' })).toEqual(['mcp', 'remove', 'fs'])
    expect(agyTools.manage({ kind: 'plugin-disable', id: 'design@market' })).toEqual(['plugin', 'disable', 'design@market'])
  })
  it('refuses a name that could be taken for an option, and an address that is not a web address', () => {
    expect(() => agyTools.manage({ kind: 'mcp-remove', name: '--all' })).toThrow(/not a valid name/)
    expect(() => agyTools.manage({ kind: 'mcp-add-http', name: 'x', url: 'file:///etc/passwd' })).toThrow(/http/)
  })
})
