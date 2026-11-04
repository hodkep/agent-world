import { describe, expect, it, vi } from 'vitest'
import { sharedLibraryItems } from './libraryItems'

describe('the library items the window shares', () => {
  it('asks the main process once for everyone who asks within the time, and again when it is older or forced', async () => {
    let now = 1000
    const list = vi.fn(async () => ({ items: [{ id: 'tdd' }] as never[], usage: {} as never }))
    const get = sharedLibraryItems(list, () => now)
    const [a, b] = await Promise.all([get(), get()])
    expect(a).toBe(b)
    expect(list).toHaveBeenCalledTimes(1)
    now += 4000
    await get()
    expect(list).toHaveBeenCalledTimes(1)
    now += 7000
    await get()
    expect(list).toHaveBeenCalledTimes(2)
    await get(true)
    expect(list).toHaveBeenCalledTimes(3)
  })
  it('does not keep a failure: the next ask tries again', async () => {
    let n = 0
    const list = vi.fn(async () => {
      if (++n === 1) throw new Error('main busy')
      return { items: [] as never[], usage: {} as never }
    })
    const get = sharedLibraryItems(list, () => 1)
    await expect(get()).rejects.toThrow('main busy')
    await expect(get()).resolves.toBeDefined()
    expect(list).toHaveBeenCalledTimes(2)
  })
})
