import { readFileSync } from 'node:fs'
import { request } from 'node:https'
import { type FeedResult, feedProblem } from '../shared/widgets'
import { guardedLookup } from './netGuard'

export const MAX_BYTES = 1_000_000
const TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 3
const TEXT = /^(text\/|application\/(json|xml|[a-z0-9.+-]+\+(json|xml)|x-ndjson))/i

export type Transport = (url: URL, h: { headers: Record<string, string>; timeoutMs: number; maxBytes: number }) => Promise<{ status: number; headers: Record<string, string | undefined>; body: string; tooBig?: boolean }>

// The one way out: a plain GET with no cookies, no login and no header of the person's, to a public address, with the answer's size and the time it may take capped.
const net: Transport = (url, h) =>
  new Promise((resolve, reject) => {
    const req = request(
      { protocol: 'https:', host: url.hostname, port: 443, path: `${url.pathname}${url.search}`, method: 'GET', headers: h.headers, timeout: h.timeoutMs, lookup: guardedLookup(undefined, { allowLocal: process.env.AW_WIDGET_ALLOW_LOCAL === '1' }) as never },
      (res) => {
        const chunks: Buffer[] = []
        let size = 0
        res.on('data', (c: Buffer) => {
          size += c.length
          if (size > h.maxBytes) return (res.destroy(), resolve({ status: res.statusCode ?? 0, headers: res.headers as Record<string, string | undefined>, body: '', tooBig: true }))
          chunks.push(c)
        })
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers as Record<string, string | undefined>, body: Buffer.concat(chunks).toString('utf8') }))
        res.on('error', reject)
      }
    )
    req.on('timeout', () => req.destroy(new Error('The site took too long to answer.')))
    req.on('error', reject)
    req.end()
  })

/** A stand-in for the internet, used only when a test starts the app with a file of answers. */
function stubbed(url: string, now: () => number): FeedResult | null {
  const file = process.env.AW_WIDGET_FETCH_STUB
  if (!file) return null
  try {
    const hit = (JSON.parse(readFileSync(file, 'utf8')) as Record<string, { status?: number; body?: string }>)[url]
    const status = hit ? (hit.status ?? 200) : 404
    return status >= 200 && status < 300 ? { ok: true, status, text: hit?.body ?? '', at: now() } : { ok: false, status, text: '', at: now(), error: `The site answered ${status}.` }
  } catch {
    return { ok: false, status: 0, text: '', at: now(), error: 'No answers file.' }
  }
}

/** Loads one public https address for a widget, and hands back text or what went wrong. Where the name leads is checked when connecting (see netGuard); redirects are followed a few times, each checked like the first. */
export async function fetchPublic(url: string, o: { transport?: Transport; now?: () => number } = {}): Promise<FeedResult> {
  const now = o.now ?? Date.now
  const fail = (error: string, status = 0): FeedResult => ({ ok: false, status, text: '', at: now(), error })
  const bad = feedProblem(url)
  if (bad) return fail(bad)
  const stub = stubbed(url, now)
  if (stub) return stub
  const transport = o.transport ?? net
  let at = new URL(url)
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const r = await transport(at, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; AgentWorldWidget/1.0)', accept: 'application/json, text/plain;q=0.9, */*;q=0.5', 'accept-encoding': 'identity' }, timeoutMs: TIMEOUT_MS, maxBytes: MAX_BYTES })
      if ([301, 302, 303, 307, 308].includes(r.status) && r.headers.location) {
        const next = new URL(r.headers.location, at)
        const why = feedProblem(next.href)
        if (why) return fail(`The site sent us to an address that is not allowed (${why})`, r.status)
        at = next
        continue
      }
      if (r.tooBig) return fail(`The answer is too big (over ${MAX_BYTES} bytes).`, r.status)
      if (r.status < 200 || r.status >= 300) return fail(`The site answered ${r.status}.`, r.status)
      if (!TEXT.test(r.headers['content-type'] ?? '')) return fail(`The site sent ${r.headers['content-type'] || 'something with no type'}, not text.`, r.status)
      return { ok: true, status: r.status, text: r.body, at: now() }
    }
    return fail('Too many redirects.')
  } catch (e) {
    return fail((e as Error).message || 'The load failed.')
  }
}
