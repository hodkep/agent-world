import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type InstallState, createInstaller } from './installer'

const zip = Buffer.from('a zip, more or less'.repeat(500))
const sha = createHash('sha512').update(zip).digest('base64')
const repo = { owner: 'hodkep', repo: 'agent-world' }
const BASE = 'https://github.com/hodkep/agent-world/releases/download/v0.1.2'
const yml = (over: { sha?: string; size?: number } = {}) => `version: 0.1.2\nfiles:\n  - url: Agent-World-0.1.2-arm64.zip\n    sha512: ${over.sha ?? sha}\n    size: ${over.size ?? zip.length}\n  - url: Agent-World-0.1.2-x64.zip\n    sha512: ${over.sha ?? sha}\n    size: ${over.size ?? zip.length}\npath: Agent-World-0.1.2-x64.zip\n`

const make = (o: { files?: Record<string, Response | Error>; place?: { parentWritable: boolean; readOnlyVolume: boolean } } = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'aw-inst-'))
  const states: InstallState[] = []
  const calls: string[] = []
  const launched: { script: string; args: string[] }[] = []
  const files: Record<string, Response | Error> = o.files ?? { [`${BASE}/latest-mac.yml`]: new Response(yml()), [`${BASE}/Agent-World-0.1.2-arm64.zip`]: new Response(zip, { status: 200 }) }
  const installer = createInstaller({
    current: '0.1.1',
    repo,
    arch: 'arm64',
    appPath: '/Applications/Agent World.app',
    pid: 4242,
    updatesDir: join(dir, 'updates'),
    fetch: async (url) => {
      calls.push(url)
      const r = files[url]
      if (!r) return new Response('not found', { status: 404 })
      if (r instanceof Error) throw r
      return r.clone()
    },
    place: () => o.place ?? { parentWritable: true, readOnlyVolume: false },
    launch: (script, args) => (calls.push('launch'), launched.push({ script, args })),
    quit: () => calls.push('quit'),
    onState: (s) => states.push(s)
  })
  return { installer, dir, states, calls, launched }
}

describe('the in-app update, from found to installed', () => {
  it('downloads the zip for this computer, checks it, and says it is ready', async () => {
    const m = make()
    await m.installer.download('v0.1.2')
    expect(m.states.map((s) => s.phase)).toEqual(expect.arrayContaining(['downloading', 'ready']))
    const last = m.installer.state()
    expect(last).toMatchObject({ phase: 'ready', version: '0.1.2' })
    expect(existsSync((last as { file: string }).file)).toBe(true)
    expect((last as { file: string }).file).toBe(join(m.dir, 'updates', '0.1.2', 'Agent-World-0.1.2-arm64.zip'))
    expect(m.calls).toEqual([`${BASE}/latest-mac.yml`, `${BASE}/Agent-World-0.1.2-arm64.zip`])
  })

  it('says why in a sentence when the release cannot be used, and downloads nothing', async () => {
    const m = make({ files: { [`${BASE}/latest-mac.yml`]: new Response(yml({ size: 700 * 1024 * 1024 })) } })
    await m.installer.download('v0.1.2')
    expect(m.installer.state()).toMatchObject({ phase: 'failed', kind: 'manifest' })
    expect(m.calls).toEqual([`${BASE}/latest-mac.yml`])
  })

  it('says GitHub could not be reached when the manifest cannot be fetched', async () => {
    const m = make({ files: { [`${BASE}/latest-mac.yml`]: new Error('ENOTFOUND') } })
    await m.installer.download('v0.1.2')
    expect(m.installer.state()).toMatchObject({ phase: 'failed', kind: 'network', reason: expect.stringMatching(/reach GitHub/i) })
  })

  it('passes a failed download on as it is: a checksum that does not match is a failure with nothing kept', async () => {
    const m = make({ files: { [`${BASE}/latest-mac.yml`]: new Response(yml({ sha: 'AAAA' })), [`${BASE}/Agent-World-0.1.2-arm64.zip`]: new Response(zip) } })
    await m.installer.download('v0.1.2')
    expect(m.installer.state()).toMatchObject({ phase: 'failed', kind: 'checksum' })
    expect(existsSync(join(m.dir, 'updates', '0.1.2', 'Agent-World-0.1.2-arm64.zip'))).toBe(false)
  })

  it('writes the helper, starts it with the arguments and quits, in that order', async () => {
    const m = make()
    await m.installer.download('v0.1.2')
    m.installer.install()
    expect(m.calls.slice(-2)).toEqual(['launch', 'quit'])
    const { script, args } = m.launched[0]!
    expect(script).toBe(join(m.dir, 'updates', 'install.sh'))
    expect(statSync(script).mode & 0o777).toBe(0o700)
    expect(readFileSync(script, 'utf8').startsWith('#!/bin/sh')).toBe(true)
    expect(args).toEqual(['4242', join(m.dir, 'updates', '0.1.2', 'Agent-World-0.1.2-arm64.zip'), '/Applications/Agent World.app', '0.1.2', 'dev.agentworld.app', join(m.dir, 'updates', 'update.log'), join(m.dir, 'updates', 'update.result')])
    expect(m.installer.state()).toMatchObject({ phase: 'installing' })
  })

  it('does not install before there is a downloaded, checked file', () => {
    const m = make()
    m.installer.install()
    expect(m.launched).toEqual([])
    expect(m.calls).not.toContain('quit')
  })

  it('does not try where the app cannot replace itself: it keeps the file and says why', async () => {
    const m = make({ place: { parentWritable: false, readOnlyVolume: false } })
    await m.installer.download('v0.1.2')
    m.installer.install()
    expect(m.launched).toEqual([])
    expect(m.calls).not.toContain('quit')
    expect(m.installer.state()).toMatchObject({ phase: 'failed', kind: 'blocked', reason: expect.stringMatching(/cannot change the folder/i), file: join(m.dir, 'updates', '0.1.2', 'Agent-World-0.1.2-arm64.zip') })
  })

  it('reports once, after the restart, why the last install did not happen', () => {
    const m = make()
    expect(m.installer.lastFailure()).toBeNull()
    mkdirSync2(join(m.dir, 'updates'))
    writeFileSync(join(m.dir, 'updates', 'update.result'), 'failed: its signature does not verify\n')
    expect(m.installer.lastFailure()).toBe('its signature does not verify')
    expect(m.installer.lastFailure()).toBeNull()
    writeFileSync(join(m.dir, 'updates', 'update.result'), 'ok 0.1.2\n')
    expect(m.installer.lastFailure()).toBeNull()
  })

  it('does not start a second download while one runs, and can be cancelled', async () => {
    const slow = new ReadableStream<Uint8Array>({ async pull(c) { c.enqueue(new Uint8Array(1000)); await new Promise((r) => setTimeout(r, 5)) } })
    const m = make({ files: { [`${BASE}/latest-mac.yml`]: new Response(yml({ size: 50_000_000 })), [`${BASE}/Agent-World-0.1.2-arm64.zip`]: new Response(slow) } })
    const first = m.installer.download('v0.1.2')
    const second = m.installer.download('v0.1.2')
    await new Promise((r) => setTimeout(r, 60))
    m.installer.cancel()
    await Promise.all([first, second])
    expect(m.calls.filter((c) => c.endsWith('latest-mac.yml'))).toHaveLength(1)
    expect(m.installer.state()).toMatchObject({ phase: 'failed', kind: 'cancelled' })
  })
})

import { mkdirSync } from 'node:fs'
const mkdirSync2 = (p: string) => mkdirSync(p, { recursive: true })
