import { createHash } from 'node:crypto'
import { createWriteStream, mkdirSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { type Asset, allowedHost } from './manifest'

export type DownloadResult = { ok: true; file: string } | { ok: false; kind: 'network' | 'checksum' | 'size' | 'host' | 'cancelled'; reason: string }

export type Fetch = (url: string, init: { redirect: 'manual'; signal?: AbortSignal }) => Promise<Response>

const MAX_HOPS = 5

type WithBody = Response & { body: ReadableStream<Uint8Array> }
type Opened = { ok: true; res: WithBody } | { ok: false; kind: 'network' | 'host'; reason: string }

/** Asks for an address and follows the redirects by hand, so that each one, like the first, has to be a host of GitHub's release downloads. */
async function open(first: string, get: Fetch, signal?: AbortSignal): Promise<Opened> {
  let url = first
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    if (!allowedHost(url)) return { ok: false, kind: 'host', reason: 'The download was sent somewhere that is not GitHub, so it was refused.' }
    const res = await get(url, { redirect: 'manual', signal })
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get('location')
      if (!next) return { ok: false, kind: 'network', reason: 'GitHub sent the download somewhere without saying where.' }
      url = new URL(next, url).toString()
      continue
    }
    if (res.status !== 200 || !res.body) return { ok: false, kind: 'network', reason: `GitHub did not give the file (${res.status}).` }
    return { ok: true, res: res as WithBody }
  }
  return { ok: false, kind: 'network', reason: 'The download was sent on too many times.' }
}

/** A small text file from GitHub's release downloads (the manifest), read whole, up to a megabyte. */
export async function fetchText(url: string, get: Fetch, signal?: AbortSignal): Promise<{ ok: true; text: string } | { ok: false; kind: 'network' | 'host'; reason: string }> {
  try {
    const opened = await open(url, get, signal)
    if (!opened.ok) return opened
    const text = await opened.res.text()
    return text.length > 1024 * 1024 ? { ok: false, kind: 'network', reason: 'The release information is far larger than it should be.' } : { ok: true, text }
  } catch (e) {
    return { ok: false, kind: 'network', reason: `Agent World could not reach GitHub: ${(e as Error).message.split('\n')[0]}` }
  }
}

/**
 * Downloads the asset into `dir` (an app-owned folder) and keeps it only if it is what the release published. Each address, the first and every
 * redirect after it, must be one of GitHub's release hosts; the body is counted as it arrives and stopped when it passes the published size; and the
 * size and the sha512 are checked before the file gets its name. On any failure nothing is left in the folder.
 */
export async function downloadAsset(o: { asset: Asset; dir: string; fetch: Fetch; onProgress: (received: number, total: number) => void; signal?: AbortSignal }): Promise<DownloadResult> {
  const { asset, dir, signal } = o
  mkdirSync(dir, { recursive: true })
  const final = join(dir, asset.name)
  const part = `${final}.part`
  const fail = (kind: Exclude<DownloadResult, { ok: true }>['kind'], reason: string): DownloadResult => (rmSync(part, { force: true }), rmSync(final, { force: true }), { ok: false, kind, reason })
  rmSync(final, { force: true })
  rmSync(part, { force: true })
  try {
    const opened = await open(asset.url, o.fetch, signal)
    if (!opened.ok) return fail(opened.kind, opened.reason)
    const res = opened.res
    const hash = createHash('sha512')
    const out = createWriteStream(part)
    const done = new Promise<void>((resolve, reject) => (out.on('finish', resolve), out.on('error', reject)))
    // A stream that is dropped on a failure may say so after we have gone: that is not news.
    done.catch(() => undefined)
    const reader = res.body.getReader()
    let got = 0
    try {
      for (;;) {
        if (signal?.aborted) throw Object.assign(new Error('cancelled'), { cancelled: true })
        const { done: end, value } = await reader.read()
        if (end) break
        got += value.length
        if (got > asset.size) {
          void reader.cancel().catch(() => undefined)
          out.destroy()
          return fail('size', 'The file is larger than the release says it is, so it was dropped.')
        }
        hash.update(value)
        if (!out.write(value)) await new Promise<void>((r) => out.once('drain', r))
        o.onProgress(got, asset.size)
      }
    } catch (e) {
      void reader.cancel().catch(() => undefined)
      out.destroy()
      if ((e as { cancelled?: boolean }).cancelled || signal?.aborted) return fail('cancelled', 'The download was stopped.')
      throw e
    }
    out.end()
    await done
    if (got !== asset.size) return fail('size', 'The file is shorter than the release says it is, so it was dropped.')
    if (hash.digest('base64') !== asset.sha512) return fail('checksum', 'The file does not match the checksum published with the release, so it was deleted.')
    renameSync(part, final)
    return { ok: true, file: final }
  } catch (e) {
    if (signal?.aborted) return fail('cancelled', 'The download was stopped.')
    return fail('network', `Agent World could not reach GitHub: ${(e as Error).message.split('\n')[0]}`)
  }
}
