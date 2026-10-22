import { describe, expect, it } from 'vitest'
import { singleFlight } from './singleFlight'

describe('singleFlight: one call shared by everyone who asks while it runs', () => {
  it('runs once for two asks that overlap, and both get its result', async () => {
    let calls = 0
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const f = singleFlight(async () => {
      calls++
      await gate
      return 'done'
    })
    const a = f()
    const b = f()
    expect(f.running()).toBe(true)
    release()
    expect(await Promise.all([a, b])).toEqual(['done', 'done'])
    expect(calls).toBe(1)
    expect(f.running()).toBe(false)
  })
  it('runs again for an ask that comes after it finished', async () => {
    let calls = 0
    const f = singleFlight(async () => ++calls)
    expect(await f()).toBe(1)
    expect(await f()).toBe(2)
  })
  it('does not stay stuck after a failure: the next ask runs again', async () => {
    let calls = 0
    const f = singleFlight(async () => {
      if (++calls === 1) throw new Error('offline')
      return 'ok'
    })
    await expect(f()).rejects.toThrow('offline')
    expect(f.running()).toBe(false)
    expect(await f()).toBe('ok')
  })
})
