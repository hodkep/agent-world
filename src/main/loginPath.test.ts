import { describe, expect, it } from 'vitest'
import { cachedLoginPath } from './appPath'

const make = (o: { sync?: () => string | undefined; async?: () => Promise<string | undefined>; ttlMs?: number } = {}) => {
  let clock = 0
  let syncReads = 0
  let asyncReads = 0
  const read = cachedLoginPath({
    readSync: () => (syncReads++, (o.sync ?? (() => '/a'))()),
    readAsync: () => (asyncReads++, (o.async ?? (async () => '/b'))()),
    now: () => clock,
    ttlMs: o.ttlMs ?? 1000
  })
  return { read, at: (t: number) => (clock = t), counts: () => ({ syncReads, asyncReads }) }
}
const settle = () => new Promise<void>((r) => setTimeout(r, 0))

describe('the login shell path, which starting a shell takes seconds to read', () => {
  it('reads it once and then answers from memory, so a call never waits for a shell again', () => {
    const m = make()
    expect(m.read()).toBe('/a')
    expect(m.read()).toBe('/a')
    expect(m.read()).toBe('/a')
    expect(m.counts()).toEqual({ syncReads: 1, asyncReads: 0 })
  })

  it('refreshes in the background once it is old: the stale value is returned at once, the new one next time', async () => {
    const m = make()
    m.read()
    m.at(5000)
    expect(m.read()).toBe('/a') // not held up
    expect(m.counts().asyncReads).toBe(1)
    m.read()
    expect(m.counts().asyncReads).toBe(1) // one refresh at a time
    await settle()
    expect(m.read()).toBe('/b')
  })

  it('keeps the old value when the refresh finds nothing or fails', async () => {
    const m = make({ async: async () => undefined })
    m.read()
    m.at(5000)
    m.read()
    await settle()
    expect(m.read()).toBe('/a')
    const f = make({ async: () => Promise.reject(new Error('shell failed')) })
    f.read()
    f.at(5000)
    f.read()
    await settle()
    expect(f.read()).toBe('/a')
  })
})
