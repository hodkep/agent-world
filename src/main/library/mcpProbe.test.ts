import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { probe, secretsOf } from './mcpProbe'

const fixture = join(__dirname, 'fixtures', 'mcpFixture.mjs')
const run = (env: Record<string, string> = {}, over: Record<string, unknown> = {}) => probe({ command: process.execPath, args: [fixture], env, ...over }, { timeoutMs: 15_000, baseEnv: process.env as Record<string, string> })

describe('connecting to a server to see what it says', () => {
  it('connects over stdio and lists the server\'s name, version and each tool with its description, parameters and hints', async () => {
    const r = await run()
    expect(r.status).toBe('connected')
    expect(r.server).toEqual({ name: 'fixture', version: '1.2.3' })
    const echo = r.tools.find((t) => t.name === 'echo')!
    expect(echo).toMatchObject({ description: 'Says back what it is told.', readOnly: true })
    expect(echo.params).toEqual([{ name: 'text', type: 'string', required: true }, { name: 'times', type: 'number', required: false }])
    expect(r.tools.find((t) => t.name === 'wipe')).toMatchObject({ destructive: true, params: [{ name: 'target', type: 'a | b', required: true }] })
    expect(r.ms).toBeGreaterThan(0)
  }, 30_000)

  it('cleans the server\'s own text: no control characters, and a very long description is cut', async () => {
    const r = await run()
    expect(r.tools.find((t) => t.name === 'wipe')!.description).toBe('Deletes everything. <b>bold</b>')
    const plain = r.tools.find((t) => t.name === 'plain')!.description
    expect(plain.length).toBeLessThanOrEqual(1001)
    expect(plain.endsWith('…')).toBe(true)
  }, 30_000)

  it('says Failed with what the server wrote when it stops, in a line', async () => {
    const r = await run({ FIXTURE_FAIL: '1' })
    expect(r.status).toBe('failed')
    expect(r.message).toContain('SUPABASE_ACCESS_TOKEN is not set')
    expect(r.tools).toEqual([])
  }, 30_000)

  it('says Failed when the command is not there', async () => {
    const r = await probe({ command: '/no/such/program-xyz' }, { timeoutMs: 5000, baseEnv: {} })
    expect(r.status).toBe('failed')
    expect(r.message).toBeTruthy()
  })

  it('says Timed out, and ends the server, when it does not answer in time', async () => {
    const t = Date.now()
    const r = await probe({ command: process.execPath, args: [fixture], env: { FIXTURE_HANG: '1' } }, { timeoutMs: 1500, baseEnv: process.env as Record<string, string> })
    expect(r.status).toBe('timeout')
    expect(Date.now() - t).toBeLessThan(8000)
  }, 30_000)

  it('says Failed for an address nobody answers at, and never follows an address that is not http', async () => {
    const r = await probe({ type: 'http', url: 'http://127.0.0.1:9/mcp' }, { timeoutMs: 5000, baseEnv: {} })
    expect(r.status).toBe('failed')
    expect((await probe({ url: 'file:///etc/passwd' }, { timeoutMs: 2000, baseEnv: {} })).status).toBe('failed')
  }, 30_000)

  it('does not put the values of its variables in anything it says, even when the server writes one itself', async () => {
    const r = await run({ FIXTURE_FAIL: '1', SECRET_VALUE: 'sb_secret_xyz' })
    expect(r.message).toContain('SUPABASE_ACCESS_TOKEN is not set')
    expect(JSON.stringify(r)).not.toContain('sb_secret_xyz')
  }, 30_000)
})

describe('what in an entry is a secret', () => {
  it('is the value of each variable and header, and the password and each query value of an address, when long enough to mean something', () => {
    expect(secretsOf({ env: { A: 'sb_secret_1', B: 'ab' }, headers: { H: 'Bearer abcdef' }, url: 'https://u:hunter22@h.example/p?key=abc123xyz&n=1' }).sort()).toEqual(['Bearer abcdef', 'abc123xyz', 'hunter22', 'sb_secret_1'].sort())
    expect(secretsOf({ command: 'npx' })).toEqual([])
  })
})
