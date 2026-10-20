import { execFile } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
    // A script that has nothing to read may exit before the payload is written; that is not an error here (it was an EPIPE on Linux).
    p.stdin!.on('error', () => {})
    p.stdin!.end(JSON.stringify(input))
  })

describe("agy's plugin hooks", () => {
  it('ask the office before each of agy\'s editing tools, and only those, so an edit can be held back', () => {
    const hooks = JSON.parse(readFileSync(join(dir, 'hooks.json'), 'utf8'))['aw-library']
    expect(hooks.PreToolUse.map((h: { matcher: string }) => h.matcher).sort()).toEqual(['multi_replace_file_content', 'replace_file_content', 'write_to_file'])
    for (const h of hooks.PreToolUse) expect(h.hooks).toEqual([{ type: 'command', command: './hook.sh pre-tool' }])
  })
  it('carry a newer version than the plugin that had no such hook, so connecting again replaces it', () => {
    expect(JSON.parse(readFileSync(join(dir, 'plugin.json'), 'utf8')).version).toBe('0.1.3')
  })
})

describe("what the plugin's script answers before an edit", () => {
  // agy reads `{}` for a tool check as a denial (its answer needs a decision), so "nothing to say" must be no output at all: agy then decides as it always did.
  it('prints nothing when the office has nothing to hold back, however that came about: not started by the office, an office that is not there, or an answer with no decision', async () => {
    expect(await run('pre-tool', { toolCall: { name: 'write_to_file' } }, {})).toBe('')
    expect(await run('pre-tool', {}, { AW_MCP_URL: 'http://127.0.0.1:9/mcp', AW_AGENT_TOKEN: 'tok' })).toBe('')
    expect(await run('pre-tool', {}, { AW_MCP_URL: 'https://example.com/mcp', AW_AGENT_TOKEN: 'tok' })).toBe('')
    mcp = await startMcpServer({ ...base, agentForToken: () => 'a1', hook: () => ({}) })
    expect(await run('pre-tool', {}, { AW_MCP_URL: mcp.url, AW_AGENT_TOKEN: 'tok' })).toBe('')
  })
  it('prints the denial, with its reason, when the office holds the edit back', async () => {
    mcp = await startMcpServer({ ...base, agentForToken: () => 'a1', hook: () => ({ decision: 'deny', reason: 'Not yet: your plan is waiting for the person to approve it.' }) })
    expect(JSON.parse(await run('pre-tool', {}, { AW_MCP_URL: mcp.url, AW_AGENT_TOKEN: 'tok' }))).toEqual({ decision: 'deny', reason: 'Not yet: your plan is waiting for the person to approve it.' })
  })
  it('still prints {} for the events where agy wants an object', async () => {
    expect(await run('pre-inv', {}, {})).toBe('{}')
    expect(await run('post-tool', {}, { AW_MCP_URL: 'http://127.0.0.1:9/mcp', AW_AGENT_TOKEN: 'tok' })).toBe('{}')
  })
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

describe('the agent\'s token', () => {
  // A stand-in curl that records what it was started with, so the test can see what another user's `ps` would show.
  const spy = () => {
    const bin = mkdtempSync(join(tmpdir(), 'aw-spycurl-'))
    const seen = join(bin, 'argv.txt')
    writeFileSync(join(bin, 'curl'), `#!/bin/sh\nprintf '%s\\n' "$@" > ${seen}\ncat > ${seen}.stdin\necho '{}'\n`)
    chmodSync(join(bin, 'curl'), 0o755)
    return { bin, argv: () => { try { return readFileSync(seen, 'utf8') } catch { return '' } }, stdin: () => { try { return readFileSync(seen + '.stdin', 'utf8') } catch { return '' } } }
  }
  const runWith = (path: string, env: Record<string, string>) =>
    new Promise<string>((resolve) => {
      const p = execFile('sh', [join(dir, 'hook.sh'), 'pre-inv'], { env: { PATH: `${path}:${process.env.PATH}`, ...env }, timeout: 10_000 }, (_e, out) => resolve(out.trim()))
      p.stdin!.on('error', () => {})
      p.stdin!.end('{"a":1}')
    })
  it('never appears on the command line of the program that sends it (other users can read that with ps)', async () => {
    const s = spy()
    try {
      await runWith(s.bin, { AW_MCP_URL: 'http://127.0.0.1:5555/mcp', AW_AGENT_TOKEN: 'sekret-token-123' })
      expect(s.argv()).not.toContain('sekret-token-123')
      expect(s.stdin()).toContain('sekret-token-123')
    } finally {
      rmSync(s.bin, { recursive: true, force: true })
    }
  })
  it('is sent only to this computer: any other address in the environment gets {} and no call', async () => {
    const s = spy()
    try {
      expect(await runWith(s.bin, { AW_MCP_URL: 'https://example.com/mcp', AW_AGENT_TOKEN: 'sekret-token-123' })).toBe('{}')
      expect(s.argv()).toBe('')
    } finally {
      rmSync(s.bin, { recursive: true, force: true })
    }
  })
})
