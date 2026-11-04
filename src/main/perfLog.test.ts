import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { BLOCKED_MS, LogFile, perfMode, summaryEntry, timed, timeSync } from './perfLog'

const dir = () => mkdtempSync(join(tmpdir(), 'aw-perflog-'))

describe('the perf log file', () => {
  it('keeps what is added in a buffer, and writes it in order only when told to, off the call that added it', async () => {
    const file = join(dir(), 'perf.log')
    const log = new LogFile(file, { capBytes: 10_000, flushMs: 60_000 })
    log.add('one')
    log.add('two')
    expect(existsSync(file)).toBe(false) // nothing on disk during the call
    await log.flush()
    log.add('three')
    await log.flush()
    expect(readFileSync(file, 'utf8')).toBe('one\ntwo\nthree\n')
  })

  it('writes by itself a little after something was added, without anyone asking', async () => {
    vi.useFakeTimers()
    const file = join(dir(), 'perf.log')
    const log = new LogFile(file, { capBytes: 10_000, flushMs: 500 })
    log.add('later')
    await vi.advanceTimersByTimeAsync(600)
    vi.useRealTimers()
    await log.flush()
    expect(readFileSync(file, 'utf8')).toBe('later\n')
  })

  it('moves to perf.log.1 at the size cap and starts a new file, keeping only one old file', async () => {
    const file = join(dir(), 'perf.log')
    const log = new LogFile(file, { capBytes: 60, flushMs: 60_000 })
    const line = (n: number) => `${String(n).padStart(2, '0')}${'x'.repeat(18)}` // 19 bytes with its newline
    for (let n = 0; n < 4; n++) log.add(line(n)) // 76 bytes: over the cap
    await log.flush()
    for (let n = 4; n < 8; n++) log.add(line(n))
    await log.flush()
    for (let n = 8; n < 12; n++) log.add(line(n))
    await log.flush()
    const now = readFileSync(file, 'utf8').trim().split('\n')
    const old = readFileSync(`${file}.1`, 'utf8').trim().split('\n')
    expect(now.at(-1)).toBe(line(11)) // the newest is in the live file
    expect(old.at(-1)!.slice(0, 2)).toBe('07') // the file before it is the one kept
    expect(existsSync(`${file}.2`)).toBe(false)
    expect(statSync(file).size).toBeLessThanOrEqual(60 + 19 * 4) // never more than the cap and one flush over
  })

  it('never lets a log that cannot be written break the app', async () => {
    const base = dir()
    writeFileSync(join(base, 'file'), 'x')
    const log = new LogFile(join(base, 'file', 'perf.log'), { capBytes: 100, flushMs: 60_000 }) // a folder that is a file
    log.add('lost')
    await expect(log.flush()).resolves.toBeUndefined()
    expect(() => log.flushSync()).not.toThrow()
  })

  it('writes what is left when the app quits', () => {
    const file = join(dir(), 'perf.log')
    const log = new LogFile(file, { capBytes: 10_000, flushMs: 60_000 })
    log.add('last words')
    log.flushSync()
    expect(readFileSync(file, 'utf8')).toBe('last words\n')
  })
})

describe('timing what holds the process', () => {
  it('returns what the call returned, and says how long it held the process', () => {
    let at = 1000
    const clock = () => at
    const seen: number[] = []
    const out = timeSync(() => ((at += 130), 'result'), (ms) => seen.push(ms), clock)
    expect(out).toBe('result')
    expect(seen).toEqual([130])
  })

  it('says so when the call throws, and lets the error through', () => {
    let at = 0
    const seen: number[] = []
    expect(() => timeSync(() => ((at += 40), void (() => { throw new Error('no') })()), (ms) => seen.push(ms), () => at)).toThrow('no')
    expect(seen).toEqual([40])
  })

  it('counts only the part before an async call returns its promise, not the wait for it', async () => {
    const seen: number[] = []
    const slow = () => new Promise<string>((r) => setTimeout(() => r('late'), 80))
    const out = timeSync(slow, (ms) => seen.push(ms))
    expect(seen[0]).toBeLessThan(40) // the promise came back at once
    await expect(out).resolves.toBe('late')
  })

  it('passes a listener its own arguments and writes down only its name and how long it held the process', () => {
    const seen: unknown[] = []
    let at = 0
    const secret = { token: 'sk-SECRET-1234', path: '/Users/someone/private/file', text: 'a private message' }
    const listener = vi.fn((_e: unknown, a: typeof secret) => ((at += 250), a.text.length))
    const wrapped = timed('chat:send', listener, (name, ms) => seen.push({ name, ms }), () => at)
    expect(wrapped('event', secret)).toBe(secret.text.length)
    expect(listener).toHaveBeenCalledWith('event', secret)
    expect(seen).toEqual([{ name: 'chat:send', ms: 250 }])
    expect(JSON.stringify(seen)).not.toMatch(/SECRET|private|someone/)
  })

  it('counts a hundred milliseconds as blocking', () => {
    expect(BLOCKED_MS).toBe(100)
  })
})

describe('the minute summary and the switch', () => {
  it('reports the loop delay in whole milliseconds, with how many stalls and blocked calls there were', () => {
    const h = { percentile: (p: number) => (p === 50 ? 6.4e6 : p === 99 ? 17.6e6 : 0), max: 378.2e6 }
    expect(summaryEntry(h, { stalls: 2, blocked: 5 })).toEqual({ kind: 'summary', loopMedianMs: 6, loopP99Ms: 18, loopMaxMs: 378, stalls: 2, blocked: 5 })
  })

  it('is on unless AW_PERF=0, and says more with AW_PERF=1', () => {
    expect(perfMode({})).toBe('on')
    expect(perfMode({ AW_PERF: '0' })).toBe('off')
    expect(perfMode({ AW_PERF: '1' })).toBe('verbose')
    expect(perfMode({ AW_PERF: 'yes' })).toBe('on')
  })
})
