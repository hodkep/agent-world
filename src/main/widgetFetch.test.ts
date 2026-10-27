import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MAX_BYTES, fetchPublic, type Transport } from './widgetFetch'

const reply = (o: Partial<Awaited<ReturnType<Transport>>> = {}): Awaited<ReturnType<Transport>> => ({ status: 200, headers: { 'content-type': 'application/json; charset=utf-8' }, body: '{"price":2496.9}', ...o })
const via = (replies: Record<string, ReturnType<typeof reply> | Error>, seen: string[] = []): Transport => async (url, h) => {
  seen.push(url.href)
  expect(h.headers['user-agent']).toMatch(/Mozilla/)
  expect(h.headers.cookie).toBeUndefined()
  expect(h.headers.authorization).toBeUndefined()
  const r = replies[url.href]
  if (r instanceof Error) throw r
  return r ?? reply({ status: 404, body: '' })
}

describe('loading a public address for a widget', () => {
  it('hands back the text of a successful answer, with the time it was loaded', async () => {
    const r = await fetchPublic('https://a.example.com/q', { transport: via({ 'https://a.example.com/q': reply() }), now: () => 42 })
    expect(r).toEqual({ ok: true, status: 200, text: '{"price":2496.9}', at: 42 })
  })
  it('says what went wrong, with no text, for a failing status, a refused connection or a slow one', async () => {
    expect(await fetchPublic('https://a.example.com/q', { transport: via({ 'https://a.example.com/q': reply({ status: 429, body: 'Too Many Requests' }) }), now: () => 1 })).toEqual({ ok: false, status: 429, text: '', at: 1, error: 'The site answered 429.' })
    const e = await fetchPublic('https://a.example.com/q', { transport: via({ 'https://a.example.com/q': new Error('ECONNREFUSED') }), now: () => 1 })
    expect(e).toMatchObject({ ok: false, status: 0, text: '' })
    expect(e.error).toMatch(/ECONNREFUSED/)
  })
  it('takes only text: a page, a picture or a program is refused, and the type is read only to decide that', async () => {
    for (const ctype of ['application/json', 'text/plain', 'text/csv', 'application/xml', 'application/rss+xml', 'application/ld+json', 'text/html']) {
      expect((await fetchPublic('https://a.example.com/q', { transport: via({ 'https://a.example.com/q': reply({ headers: { 'content-type': ctype } }) }) })).ok, ctype).toBe(true)
    }
    for (const ctype of ['image/png', 'application/octet-stream', 'application/zip', 'application/pdf', 'video/mp4', 'application/x-msdownload', '']) {
      const r = await fetchPublic('https://a.example.com/q', { transport: via({ 'https://a.example.com/q': reply({ headers: { 'content-type': ctype } }) }) })
      expect(r.ok, ctype).toBe(false)
      expect(r.text).toBe('')
    }
  })
  it('refuses an answer that is too big', async () => {
    const r = await fetchPublic('https://a.example.com/q', { transport: via({ 'https://a.example.com/q': reply({ body: '', tooBig: true }) }) })
    expect(r).toMatchObject({ ok: false, status: 200 })
    expect(r.error).toMatch(/too big/)
    expect(MAX_BYTES).toBe(1_000_000)
  })
  it('follows a redirect to another public https address, up to three, checking each one', async () => {
    const seen: string[] = []
    const t = via({ 'https://a.example.com/q': reply({ status: 302, headers: { location: 'https://b.example.org/moved' } }), 'https://b.example.org/moved': reply({ status: 301, headers: { location: '/final' } }), 'https://b.example.org/final': reply() }, seen)
    expect((await fetchPublic('https://a.example.com/q', { transport: t })).ok).toBe(true)
    expect(seen).toEqual(['https://a.example.com/q', 'https://b.example.org/moved', 'https://b.example.org/final'])
    const loop = via({ 'https://a.example.com/q': reply({ status: 302, headers: { location: '/q' } }) })
    expect((await fetchPublic('https://a.example.com/q', { transport: loop })).error).toMatch(/too many redirects/i)
  })
  it('refuses a redirect to http, to a number, to localhost, to another scheme or to an address with a login, and does not call it', async () => {
    for (const to of ['http://b.example.org/x', 'https://127.0.0.1/x', 'https://localhost/x', 'https://10.0.0.1/x', 'file:///etc/passwd', 'https://user:pw@b.example.org/x', 'https://b.example.org:8443/x', 'ftp://b.example.org/x']) {
      const seen: string[] = []
      const r = await fetchPublic('https://a.example.com/q', { transport: via({ 'https://a.example.com/q': reply({ status: 302, headers: { location: to } }) }, seen) })
      expect(r.ok, to).toBe(false)
      expect(seen, to).toEqual(['https://a.example.com/q'])
    }
  })
  it('refuses an address that is not allowed to begin with, without calling it', async () => {
    const seen: string[] = []
    for (const url of ['http://a.example.com/x', 'https://127.0.0.1/', 'https://a.example.com:8443/', 'nonsense']) expect((await fetchPublic(url, { transport: via({}, seen) })).ok, url).toBe(false)
    expect(seen).toEqual([])
  })
})

describe('a stand-in for the internet, for a test that must not use it', () => {
  let dir = ''
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))
  it('answers from a file when the app is started with one, and a missing address is a 404', async () => {
    dir = mkdtempSync(join(tmpdir(), 'aw-stub-'))
    const file = join(dir, 'feeds.json')
    writeFileSync(file, JSON.stringify({ 'https://a.example.com/q': { body: '{"n":1}' } }))
    process.env.AW_WIDGET_FETCH_STUB = file
    try {
      expect(await fetchPublic('https://a.example.com/q', { now: () => 5 })).toEqual({ ok: true, status: 200, text: '{"n":1}', at: 5 })
      expect((await fetchPublic('https://a.example.com/other')).status).toBe(404)
    } finally {
      delete process.env.AW_WIDGET_FETCH_STUB
    }
  })
})
