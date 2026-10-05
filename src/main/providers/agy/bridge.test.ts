import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { BRIDGE_SOURCE } from './bridge'

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach((f) => f()))

async function office(reply: (body: { id?: number; method: string }, auth: string | undefined) => { status: number; json?: unknown }) {
  const seen: { auth?: string; body: { id?: number; method: string } }[] = []
  const srv = createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      const body = JSON.parse(raw)
      seen.push({ auth: req.headers.authorization, body })
      const r = reply(body, req.headers.authorization)
      res.writeHead(r.status, { 'content-type': 'application/json' }).end(r.json === undefined ? '' : JSON.stringify(r.json))
    })
  })
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r))
  cleanups.push(() => srv.close())
  return { url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}/mcp`, seen }
}

function run(url: string, token: string) {
  const dir = mkdtempSync(join(tmpdir(), 'aw-bridge-'))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  const file = join(dir, 'bridge.cjs')
  writeFileSync(file, BRIDGE_SOURCE)
  const p = spawn(process.execPath, [file], { env: { ...process.env, AW_MCP_URL: url, AW_AGENT_TOKEN: token } })
  cleanups.push(() => p.kill())
  const lines: string[] = []
  let buf = ''
  p.stdout.on('data', (d) => {
    buf += d
    const parts = buf.split('\n')
    buf = parts.pop()!
    lines.push(...parts.filter(Boolean))
  })
  return { send: (m: object) => p.stdin.write(JSON.stringify(m) + '\n'), lines, p }
}
const until = async (f: () => boolean) => {
  for (let i = 0; i < 100 && !f(); i++) await new Promise((r) => setTimeout(r, 30))
}

describe('the bridge agy starts as an MCP server', () => {
  it('passes each message to the office with the agent\'s token and gives back what it answers', async () => {
    const o = await office((b) => ({ status: 200, json: { jsonrpc: '2.0', id: b.id, result: { ok: true } } }))
    const b = run(o.url, 'tok-1')
    b.send({ jsonrpc: '2.0', id: 7, method: 'tools/list' })
    await until(() => b.lines.length > 0)
    expect(JSON.parse(b.lines[0]!)).toEqual({ jsonrpc: '2.0', id: 7, result: { ok: true } })
    expect(o.seen[0]).toMatchObject({ auth: 'Bearer tok-1', body: { method: 'tools/list' } })
  })
  it('says nothing back to a notification, which the office accepts without a body', async () => {
    const o = await office(() => ({ status: 202 }))
    const b = run(o.url, 'tok-1')
    b.send({ jsonrpc: '2.0', method: 'notifications/initialized' })
    b.send({ jsonrpc: '2.0', id: 1, method: 'ping' })
    await until(() => o.seen.length === 2)
    await new Promise((r) => setTimeout(r, 100))
    expect(b.lines).toEqual([])
  })
  it('answers a request with an error when the office refuses the token or is not there', async () => {
    const o = await office(() => ({ status: 401 }))
    const b = run(o.url, 'wrong')
    b.send({ jsonrpc: '2.0', id: 3, method: 'tools/list' })
    await until(() => b.lines.length > 0)
    expect(JSON.parse(b.lines[0]!)).toMatchObject({ id: 3, error: { message: expect.stringMatching(/401/) } })
    const gone = run('http://127.0.0.1:9/mcp', 'x')
    gone.send({ jsonrpc: '2.0', id: 4, method: 'tools/list' })
    await until(() => gone.lines.length > 0)
    expect(JSON.parse(gone.lines[0]!)).toMatchObject({ id: 4, error: { message: expect.stringMatching(/not running|reach/i) } })
  })
  it('exits at once, with a message, when it was not started by the app', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aw-bridge-'))
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
    const file = join(dir, 'bridge.cjs')
    writeFileSync(file, BRIDGE_SOURCE)
    const p = spawn(process.execPath, [file], { env: { ...process.env, AW_MCP_URL: '', AW_AGENT_TOKEN: '' } })
    const code = await new Promise((r) => p.on('exit', r))
    expect(code).toBe(1)
  })
})
