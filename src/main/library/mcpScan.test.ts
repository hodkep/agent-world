import { describe, expect, it } from 'vitest'
import { scanMcp } from './mcpScan'

const files: Record<string, string> = {
  '/h/.claude.json': JSON.stringify({
    mcpServers: { supabase: { type: 'stdio', command: 'npx', args: ['-y', 'x'], env: { SUPABASE_ACCESS_TOKEN: 'sb_secret_123' } }, higgsfield: { type: 'http', url: 'https://mcp.higgsfield.ai/mcp?key=k', disabled: true } },
    projects: { '/w/fcfs': { mcpServers: { github: { command: 'npx', args: ['gh'], env: { GITHUB_TOKEN: 'ghp_secret' } } } }, '/w/none': {} }
  }),
  '/w/csr/.mcp.json': JSON.stringify({ mcpServers: { penpot: { type: 'http', url: 'http://localhost:4401', headers: { Authorization: 'Bearer secret' } } } }),
  '/g/cli.json': JSON.stringify({ mcpServers: { 'agent-world': { command: '/app/node', args: ['bridge'] }, 'agent-world-2': { command: '/app/node' }, stitch: { command: 'npx', args: ['stitch'], disabled: true } } }),
  '/g/ide.json': JSON.stringify({ mcpServers: { stripe: { command: 'npx', args: ['stripe'] }, supabase: { serverUrl: 'https://mcp.supabase.com/mcp' } } })
}
const read = (f: string) => files[f] ?? null
const scan = () => scanMcp({ read, claudeFiles: ['/h/.claude.json'], projects: ['/w/csr', '/w/fcfs'], agyCli: '/g/cli.json', agyIde: '/g/ide.json' })

describe('the MCP servers on this computer', () => {
  it('finds each program\'s own lists: Claude\'s everywhere and per project, a project\'s .mcp.json, and agy\'s two', () => {
    const s = scan()
    const at = (where: string) => s.filter((x) => x.where === where).map((x) => x.name).sort()
    expect(at('global')).toEqual(['higgsfield', 'supabase'])
    expect(s.filter((x) => x.where === 'project').map((x) => `${x.project}:${x.name}`).sort()).toEqual(['/w/csr:penpot', '/w/fcfs:github'])
    expect(at('agy-cli')).toEqual(['stitch'])
    expect(at('agy-ide')).toEqual(['stripe', 'supabase'])
  })

  it('lists the office\'s own server once, whatever the lists hold under its name', () => {
    const s = scan()
    expect(s.filter((x) => x.where === 'office').map((x) => x.name)).toEqual(['agent-world'])
    expect(s.some((x) => /^agent-world/.test(x.name) && x.where !== 'office')).toBe(false)
  })

  it('says each one in a line, with the names of its variables and headers and never what they hold', () => {
    const s = scan()
    const supa = s.find((x) => x.name === 'supabase' && x.where === 'global')!
    expect(supa).toMatchObject({ transport: 'stdio', fact: 'npx -y x', env: ['SUPABASE_ACCESS_TOKEN'] })
    expect(s.find((x) => x.name === 'penpot')).toMatchObject({ transport: 'http', fact: 'localhost:4401', env: ['Authorization'] })
    expect(s.find((x) => x.name === 'higgsfield')).toMatchObject({ fact: 'mcp.higgsfield.ai', disabled: true })
    const text = JSON.stringify(s)
    for (const secret of ['sb_secret_123', 'ghp_secret', 'Bearer secret', 'key=k']) expect(text).not.toContain(secret)
  })

  it('marks the servers only Claude Code\'s files list as switchable, and the office\'s and both of agy\'s lists as read only', () => {
    const s = scan()
    expect(s.filter((x) => x.where === 'agy-ide' || x.where === 'agy-cli' || x.where === 'office').every((x) => x.readOnly)).toBe(true)
    expect(s.filter((x) => x.where === 'global' || x.where === 'project').every((x) => !x.readOnly)).toBe(true)
  })

  it('carries on past a file that is missing, damaged, or the wrong shape', () => {
    const bad = scanMcp({ read: (f) => (f === '/a' ? '{not json' : f === '/b' ? '[1,2]' : f === '/c' ? JSON.stringify({ mcpServers: 'x' }) : f === '/d' ? JSON.stringify({ mcpServers: { ok: { command: 'c' }, nope: 5 } }) : null), claudeFiles: ['/a', '/b', '/c', '/missing'], projects: [], agyCli: '/d', agyIde: '/none' })
    expect(bad.filter((x) => x.where !== 'office').map((x) => x.name)).toEqual(['ok'])
  })
})
