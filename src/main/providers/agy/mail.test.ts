import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BRIDGE_SOURCE } from './bridge'
import { createAgyMail, entryFor } from './mail'

let dir: string
let config: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aw-agymail-'))
  config = join(dir, 'mcp_config.json')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const make = (calls: string[][] = []) => createAgyMail({ home: dir, config, node: '/app/electron', run: async (_bin, args) => void calls.push(args) })

describe('connecting agy to the office message box', () => {
  it('is missing until agy has an agent-world entry that starts our bridge', () => {
    expect(make().status()).toBe('missing')
    writeFileSync(config, JSON.stringify({ mcpServers: { other: { command: 'x', args: [] } } }))
    expect(make().status()).toBe('missing')
    writeFileSync(config, JSON.stringify({ mcpServers: { 'agent-world': { command: '/app/electron', args: [join(dir, 'bin', 'aw-mcp-bridge.cjs')] } } }))
    expect(make().status()).toBe('connected')
  })
  it('is missing, not connected, when the entry is switched off or points at something else', () => {
    writeFileSync(config, JSON.stringify({ mcpServers: { 'agent-world': { command: 'x', args: ['/elsewhere.js'] } } }))
    expect(make().status()).toBe('missing')
    writeFileSync(config, JSON.stringify({ mcpServers: { 'agent-world': { command: 'x', args: [join(dir, 'bin', 'aw-mcp-bridge.cjs')], disabled: true } } }))
    expect(make().status()).toBe('missing')
  })
  it('says exactly what it will change before anything is changed', () => {
    const plan = make().plan()
    expect(plan.files).toEqual([join(dir, 'bin', 'aw-mcp-bridge.cjs')])
    expect(plan.commands).toEqual([`agy mcp add --env ELECTRON_RUN_AS_NODE=1 agent-world -- /app/electron ${join(dir, 'bin', 'aw-mcp-bridge.cjs')}`])
    expect(existsSync(join(dir, 'bin'))).toBe(false)
  })
  it('writes the bridge into its own folder and has agy add the one entry, through agy\'s own command', async () => {
    const calls: string[][] = []
    await make(calls).connect('agy')
    expect(readFileSync(join(dir, 'bin', 'aw-mcp-bridge.cjs'), 'utf8')).toBe(BRIDGE_SOURCE)
    expect(calls).toEqual([['mcp', 'add', '--env', 'ELECTRON_RUN_AS_NODE=1', 'agent-world', '--', '/app/electron', join(dir, 'bin', 'aw-mcp-bridge.cjs')]])
  })
  it('takes the entry out again through agy, leaving the bridge file for a later reconnect', async () => {
    const calls: string[][] = []
    mkdirSync(join(dir, 'bin'))
    await make(calls).disconnect('agy')
    expect(calls).toEqual([['mcp', 'remove', 'agent-world']])
  })
})

describe('one entry per build', () => {
  it('names the entry after the data folder, so a second build never replaces the first one', () => {
    expect(entryFor('/Users/me/.agent-world')).toBe('agent-world')
    expect(entryFor('/Users/me/.agent-world-2')).toBe('agent-world-2')
    expect(entryFor('/tmp/aw-test-1234')).toBe('agent-world')
  })
})

describe('entries left behind by a build that is gone', () => {
  const entry = (command: string, extra: object = {}) => ({ command, args: ['/x/aw-mcp-bridge.cjs'], ...extra })
  it('finds Agent World entries whose program is not there any more, and nothing else', () => {
    const alive = join(dir, 'alive')
    writeFileSync(alive, '')
    writeFileSync(config, JSON.stringify({ mcpServers: { 'agent-world-2': entry('/Applications/Agent World 2.app/Contents/MacOS/Agent World 2'), 'agent-world-3': entry(alive), StitchMCP: entry('/no/such/thing'), 'agent-world-old': entry('/gone', { disabled: true }) } }))
    expect(make().stale()).toEqual([{ name: 'agent-world-2', program: '/Applications/Agent World 2.app/Contents/MacOS/Agent World 2' }])
  })
  it('says there is none without a list, or with a damaged one', () => {
    expect(make().stale()).toEqual([])
    writeFileSync(config, '{oops')
    expect(make().stale()).toEqual([])
  })
  it('takes one out through agy, only if it is one of those, so nothing else can be removed this way', async () => {
    writeFileSync(config, JSON.stringify({ mcpServers: { 'agent-world-2': entry('/gone/app'), StitchMCP: entry('/no/such/thing') } }))
    const calls: string[][] = []
    const mail = make(calls)
    await mail.removeStale('agy', 'agent-world-2')
    expect(calls).toEqual([['mcp', 'remove', 'agent-world-2']])
    await expect(mail.removeStale('agy', 'StitchMCP')).rejects.toThrow('not one left behind')
    expect(calls).toHaveLength(1)
  })
})
