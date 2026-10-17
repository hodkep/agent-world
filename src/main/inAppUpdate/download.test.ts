import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { downloadAsset } from './download'
import type { Asset } from './manifest'

const bytes = Buffer.from('pretend this is a zip'.repeat(1000))
const sha = (b: Buffer) => createHash('sha512').update(b).digest('base64')
const asset = (over: Partial<Asset> = {}): Asset => ({ version: '0.1.2', name: 'Agent-World-0.1.2-arm64.zip', url: 'https://github.com/hodkep/agent-world/releases/download/v0.1.2/Agent-World-0.1.2-arm64.zip', sha512: sha(bytes), size: bytes.length, ...over })
const dir = () => mkdtempSync(join(tmpdir(), 'aw-dl-'))

/** A body that arrives in a few pieces, as a download does. */
const body = (b: Buffer, pieces = 4) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      const n = Math.ceil(b.length / pieces)
      for (let i = 0; i < b.length; i += n) c.enqueue(new Uint8Array(b.subarray(i, i + n)))
      c.close()
    }
  })

type Step = Response | Error
const fetcher = (steps: Record<string, Step>) => {
  const seen: string[] = []
  const fn = async (url: string) => {
    seen.push(url)
    const s = steps[url]
    if (!s) throw new Error(`unexpected ${url}`)
    if (s instanceof Error) throw s
    return s
  }
  return { fn, seen }
}
const CDN = 'https://release-assets.githubusercontent.com/github-production-release-asset/1/2?sp=r'
const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to } })
const ok = (b: Buffer = bytes) => new Response(body(b), { status: 200, headers: { 'content-length': String(b.length) } })

describe('downloading the update', () => {
  it('follows the redirect to GitHub\'s file host, reports progress, and keeps the file once its size and sha512 match', async () => {
    const d = dir()
    const f = fetcher({ [asset().url]: redirect(CDN), [CDN]: ok() })
    const seen: number[] = []
    const r = await downloadAsset({ asset: asset(), dir: d, fetch: f.fn, onProgress: (got, total) => seen.push(got / total) })
    expect(r).toEqual({ ok: true, file: join(d, 'Agent-World-0.1.2-arm64.zip') })
    expect(readFileSync(join(d, 'Agent-World-0.1.2-arm64.zip')).equals(bytes)).toBe(true)
    expect(seen.at(-1)).toBe(1)
    expect(seen).toEqual([...seen].sort((a, b) => a - b))
    expect(readdirSync(d)).toEqual(['Agent-World-0.1.2-arm64.zip'])
  })

  it('deletes the file when the checksum is not the published one, and says so', async () => {
    const d = dir()
    const f = fetcher({ [asset().url]: ok() })
    const r = await downloadAsset({ asset: asset({ sha512: sha(Buffer.from('something else')) }), dir: d, fetch: f.fn, onProgress: () => undefined })
    expect(r).toMatchObject({ ok: false, kind: 'checksum' })
    expect(readdirSync(d)).toEqual([])
  })

  it('deletes the file when it is shorter than the published size', async () => {
    const d = dir()
    const f = fetcher({ [asset().url]: ok(bytes.subarray(0, 5000)) })
    expect(await downloadAsset({ asset: asset(), dir: d, fetch: f.fn, onProgress: () => undefined })).toMatchObject({ ok: false, kind: 'size' })
    expect(readdirSync(d)).toEqual([])
  })

  it('stops as soon as more arrives than the published size, instead of taking all of it', async () => {
    const d = dir()
    let pulled = 0
    const endless = new ReadableStream<Uint8Array>({ pull(c) { pulled += 1; c.enqueue(new Uint8Array(1024 * 1024)) } })
    const f = fetcher({ [asset().url]: new Response(endless, { status: 200 }) })
    const r = await downloadAsset({ asset: asset({ size: 2 * 1024 * 1024 }), dir: d, fetch: f.fn, onProgress: () => undefined })
    expect(r).toMatchObject({ ok: false, kind: 'size' })
    expect(pulled).toBeLessThan(10)
    expect(readdirSync(d)).toEqual([])
  })

  it('refuses a redirect to a host that is not GitHub\'s, without asking it for anything', async () => {
    const d = dir()
    const f = fetcher({ [asset().url]: redirect('https://evil.example/Agent-World-0.1.2-arm64.zip') })
    const r = await downloadAsset({ asset: asset(), dir: d, fetch: f.fn, onProgress: () => undefined })
    expect(r).toMatchObject({ ok: false, kind: 'host' })
    expect(f.seen).toEqual([asset().url])
  })

  it('gives up on a redirect that goes round in circles', async () => {
    const d = dir()
    const a = asset().url
    const f = fetcher({ [a]: redirect(CDN), [CDN]: redirect(a) })
    expect(await downloadAsset({ asset: asset(), dir: d, fetch: f.fn, onProgress: () => undefined })).toMatchObject({ ok: false, kind: 'network' })
    expect(f.seen.length).toBeLessThanOrEqual(7)
  })

  it('says GitHub could not be reached when the network fails, and what it answered when it answers with an error', async () => {
    const d = dir()
    expect(await downloadAsset({ asset: asset(), dir: d, fetch: fetcher({ [asset().url]: new Error('getaddrinfo ENOTFOUND github.com') }).fn, onProgress: () => undefined })).toMatchObject({ ok: false, kind: 'network', reason: expect.stringMatching(/reach GitHub/i) })
    expect(await downloadAsset({ asset: asset(), dir: d, fetch: fetcher({ [asset().url]: new Response('nope', { status: 404 }) }).fn, onProgress: () => undefined })).toMatchObject({ ok: false, kind: 'network', reason: expect.stringMatching(/404/) })
  })

  it('stops and deletes what it had when it is cancelled', async () => {
    const d = dir()
    const ctl = new AbortController()
    const slow = new ReadableStream<Uint8Array>({ async pull(c) { c.enqueue(new Uint8Array(1000)); await new Promise((r) => setTimeout(r, 5)) } })
    const f = fetcher({ [asset().url]: new Response(slow, { status: 200 }) })
    const run = downloadAsset({ asset: asset({ size: 10_000_000 }), dir: d, fetch: f.fn, onProgress: (got) => got > 3000 && ctl.abort(), signal: ctl.signal })
    expect(await run).toMatchObject({ ok: false, kind: 'cancelled' })
    expect(readdirSync(d)).toEqual([])
    expect(existsSync(join(d, 'Agent-World-0.1.2-arm64.zip'))).toBe(false)
  })

  it('replaces a file left by an earlier try, so a bad one is never reused', async () => {
    const d = dir()
    await downloadAsset({ asset: asset({ sha512: sha(Buffer.from('x')) }), dir: d, fetch: fetcher({ [asset().url]: ok() }).fn, onProgress: () => undefined })
    const r = await downloadAsset({ asset: asset(), dir: d, fetch: fetcher({ [asset().url]: ok() }).fn, onProgress: () => undefined })
    expect(r).toMatchObject({ ok: true })
  })
})
