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
