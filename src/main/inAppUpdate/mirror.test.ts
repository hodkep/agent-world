import { describe, expect, it } from 'vitest'
import { TUNE, createStall, mirrorOf, mirrorUrl, parseTune } from './mirror'

const R2 = 'https://pub-761b6780fbbc4b30b60a22f902c0e743.r2.dev'

describe('the mirror an app build names', () => {
  it('is an https origin with nothing after it, and its address of a file is <base>/v<version>/<name>', () => {
    const m = mirrorOf(R2)!
    expect(m.base).toBe(R2)
    expect(mirrorUrl(m, 'v0.7.4', 'Agent-World-0.7.4-arm64.zip')).toBe(`${R2}/v0.7.4/Agent-World-0.7.4-arm64.zip`)
    expect(mirrorOf(`${R2}/`)!.base).toBe(R2)
  })

  it('is none when the build names none, or names something that is not a plain https origin', () => {
    for (const bad of [undefined, null, '', 42, 'not a url', 'http://pub.r2.dev', `${R2}/some/path`, `${R2}?x=1`, `https://user:pw@pub.r2.dev`, 'https://pub.r2.dev:8443', 'ftp://pub.r2.dev']) expect(mirrorOf(bad)).toBeNull()
  })

  it('allows its own exact host and nothing else: not a sibling, a subdomain, plain http, another port or a user', () => {
    const m = mirrorOf(R2)!
    expect(m.allow(`${R2}/v1/x.zip`)).toBe(true)
    for (const no of ['https://github.com/a/b', 'https://other.r2.dev/x', `https://evil.${R2.slice(8)}/x`, R2.replace('https', 'http') + '/x', `${R2}:8443/x`, `https://u@${R2.slice(8)}/x`, 'nonsense']) expect(m.allow(no)).toBe(false)
  })

  it('lets a test run use a plain http origin of its own, and still only that one', () => {
    const m = mirrorOf('http://127.0.0.1:9100', { testing: true })!
    expect(m.allow('http://127.0.0.1:9100/v1/x.zip')).toBe(true)
    expect(m.allow('http://127.0.0.1:9101/v1/x.zip')).toBe(false)
    expect(mirrorOf('http://127.0.0.1:9100')).toBeNull()
  })
})

describe('whether a download has stalled', () => {
  const t = { headersMs: 8000, graceMs: 5000, windowMs: 15000, minBps: 150 * 1024 }
  const MB = 1024 * 1024
  it('judges nothing in the first five seconds, then the speed over each fifteen: under 150 KB/s is a stall', () => {
    const slow = createStall(t, 0)
    expect(slow(4000, 0)).toBe(false)
    expect(slow(6000, 10_000)).toBe(false) // the window opens here
    expect(slow(20_000, 10_000 + 100 * 1024)).toBe(false) // not over yet
    expect(slow(21_000, 10_000 + 100 * 1024)).toBe(true) // 100 KB in 15 s
  })

  it('goes on when the speed holds, window after window, and trips when a later window is slow', () => {
    const s = createStall(t, 0)
    s(5000, 0)
    expect(s(20_000, 4 * MB)).toBe(false)
    expect(s(35_000, 8 * MB)).toBe(false)
    expect(s(50_000, 8 * MB)).toBe(true)
  })

  it('has the numbers agreed: 8 s to the first byte, 5 s grace, 15 s window, 150 KB/s', () => {
    expect(TUNE).toEqual(t)
  })
})

describe('the numbers a test run may shorten', () => {
  it('reads "headers,grace,window[,bytesPerSecond]" and falls back to the real ones', () => {
    expect(parseTune('300,100,400')).toEqual({ headersMs: 300, graceMs: 100, windowMs: 400, minBps: TUNE.minBps })
    expect(parseTune('300,100,400,5000').minBps).toBe(5000)
    expect(parseTune(undefined)).toEqual(TUNE)
    expect(parseTune('x,y')).toEqual(TUNE)
  })
})
