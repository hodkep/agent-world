import { execFile } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { startMcpServer } from '../../mcpServer'
import { writeAgyPlugin } from './plugin'

let dir: string
let mcp: Awaited<ReturnType<typeof startMcpServer>> | undefined
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aw-agyplugin-'))
  writeAgyPlugin(dir)
})
afterEach(() => {
  mcp?.close()
  rmSync(dir, { recursive: true, force: true })
})

const base = { listAgents: () => [], send: () => 'queued' as const, remember: () => undefined, recall: () => [] }
/** Runs the plugin's script the way agy does: the payload on stdin, the office's address and the agent's token in the environment. */
const run = (event: string, input: object, env: Record<string, string>) =>
  new Promise<string>((resolve) => {
    const p = execFile('sh', [join(dir, 'hook.sh'), event], { env: { PATH: process.env.PATH, ...env }, timeout: 10_000 }, (_e, out) => resolve(out.trim()))
    p.stdin!.end(JSON.stringify(input))
  })

describe("agy's library plugin script", () => {
  it('carries the payload to the office with the agent\'s token and prints the office\'s answer', async () => {
    const seen: unknown[] = []
    mcp = await startMcpServer({ ...base, agentForToken: (t) => (t === 'tok' ? 'a1' : null), hook: (id, event, payload) => (seen.push([id, event, payload.conversationId]), { injectSteps: [{ ephemeralMessage: 'hi' }] }) })
    const out = await run('pre-inv', { conversationId: 'c1' }, { AW_MCP_URL: mcp.url, AW_AGENT_TOKEN: 'tok' })
    expect(JSON.parse(out)).toEqual({ injectSteps: [{ ephemeralMessage: 'hi' }] })
    expect(seen).toEqual([['a1', 'pre-inv', 'c1']])
  })
  it('keeps a reply of several lines valid JSON (a plain echo would turn its \\n into real newlines)', async () => {
    mcp = await startMcpServer({ ...base, agentForToken: () => 'a1', hook: () => ({ injectSteps: [{ ephemeralMessage: 'one\ntwo `three`' }] }) })
    const out = await run('pre-inv', {}, { AW_MCP_URL: mcp.url, AW_AGENT_TOKEN: 'tok' })
    expect(JSON.parse(out).injectSteps[0].ephemeralMessage).toBe('one\ntwo `three`')
  })
  it('prints {} and calls nothing for an agy the office did not start', async () => {
    const seen: unknown[] = []
    mcp = await startMcpServer({ ...base, agentForToken: () => 'a1', hook: () => (seen.push(1), {}) })
    expect(await run('pre-inv', {}, {})).toBe('{}')
    expect(seen).toEqual([])
  })
  it('prints {} when the office is gone, or does not know the token', async () => {
    expect(await run('pre-inv', {}, { AW_MCP_URL: 'http://127.0.0.1:9/mcp', AW_AGENT_TOKEN: 'tok' })).toBe('{}')
    mcp = await startMcpServer({ ...base, agentForToken: () => null })
    expect(await run('pre-inv', {}, { AW_MCP_URL: mcp.url, AW_AGENT_TOKEN: 'bad' })).toBe('{}')
  })
  it('lets the office\'s hook fail without breaking agy', async () => {
    mcp = await startMcpServer({ ...base, agentForToken: () => 'a1', hook: () => { throw new Error('boom') } })
    expect(await run('pre-inv', {}, { AW_MCP_URL: mcp.url, AW_AGENT_TOKEN: 'tok' })).toBe('{}')
  })
})
