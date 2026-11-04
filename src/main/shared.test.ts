import { describe, expect, it, vi } from 'vitest'
import { shared } from './shared'

describe('one answer shared by callers that ask for the same thing close together', () => {
  it('runs once for callers that ask while it is still running', async () => {
    let release!: (v: string) => void
    const make = vi.fn(() => new Promise<string>((r) => (release = r)))
    const get = shared<string>(2000)
    const a = get('x', make)
    const b = get('x', make)
    release('ps output')
    expect(await a).toBe('ps output')
    expect(await b).toBe('ps output')
    expect(make).toHaveBeenCalledTimes(1)
  })

  it('reuses the answer for the given time, then asks again', async () => {
    let t = 0
    const make = vi.fn(async () => `at ${t}`)
    const get = shared<string>(2000, () => t)
    expect(await get('x', make)).toBe('at 0')
    t = 1999
    expect(await get('x', make)).toBe('at 0')
    t = 2000
    expect(await get('x', make)).toBe('at 2000')
    expect(make).toHaveBeenCalledTimes(2)
  })

  it('keeps different keys apart', async () => {
    const get = shared<string>(2000)
    expect(await get('a', async () => 'A')).toBe('A')
    expect(await get('b', async () => 'B')).toBe('B')
  })

  it('does not keep a failure: the next caller asks again', async () => {
    const get = shared<string>(2000)
    await expect(get('x', async () => Promise.reject(new Error('git died')))).rejects.toThrow('git died')
    expect(await get('x', async () => 'ok')).toBe('ok')
  })

  it('after a change, the next caller asks again: within the time, and not joining one that started before the change', async () => {
    let state = 'before'
    let release!: () => void
    const get = shared<string>(5000)
    const slow = () => new Promise<string>((r) => ((release = () => r(state)), void 0))
    const old = get('x', slow)
    state = 'after' // the person acts while the first look is still running
    get.clear()
    expect(await get('x', async () => state)).toBe('after')
    release()
    expect(await old).toBe('after') // the old look is left to finish; it just is not shared any more
    state = 'later'
    expect(await get('x', async () => state)).toBe('after') // the fresh answer is kept for the time
    get.clear()
    expect(await get('x', async () => state)).toBe('later')
  })

  it('with no time given, only callers that ask while it runs share; one that asks after it ended asks again', async () => {
    let n = 0
    let release!: () => void
    const get = shared<number>(0)
    const slow = () => new Promise<number>((r) => (release = () => r(++n)))
    const a = get('x', slow)
    const b = get('x', slow)
    release()
    expect(await a).toBe(1)
    expect(await b).toBe(1)
    expect(await get('x', async () => ++n)).toBe(2)
  })
})
