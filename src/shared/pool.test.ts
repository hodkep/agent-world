import { describe, expect, it } from 'vitest'
import { inBatches } from './pool'

const later = () => {
  let done!: (v?: unknown) => void
  const p = new Promise((r) => (done = r))
  return { p, done }
}
const tick = () => new Promise((r) => setTimeout(r, 0))

describe('doing a list of jobs a few at a time', () => {
  it('never has more than the limit running, and starts the next as soon as one finishes', async () => {
    const gates = [0, 1, 2, 3, 4].map(later)
    let running = 0
    let peak = 0
    const started: number[] = []
    const all = inBatches([0, 1, 2, 3, 4], 2, async (i) => {
      started.push(i)
      peak = Math.max(peak, ++running)
      await gates[i]!.p
      running--
      return i
    })
    await tick()
    expect(started).toEqual([0, 1])
    gates[1]!.done()
    await tick()
    // Not in rounds: job 2 begins when 1 ends, while 0 is still going.
    expect(started).toEqual([0, 1, 2])
    gates.forEach((g) => g.done())
    await all
    expect(started).toEqual([0, 1, 2, 3, 4])
    expect(peak).toBe(2)
  })

  it('gives the results in the order of the list, whichever finished first', async () => {
    const out = await inBatches(['a', 'b', 'c'], 3, async (x, i) => {
      await new Promise((r) => setTimeout(r, (3 - i) * 5))
      return x.toUpperCase()
    })
    expect(out).toEqual(['A', 'B', 'C'])
  })

  it('does the whole list when the limit is more than the list, or the list is empty', async () => {
    expect(await inBatches([1, 2], 10, async (x) => x * 2)).toEqual([2, 4])
    expect(await inBatches([], 3, async () => 1)).toEqual([])
  })

  it('starts nothing more once asked to stop, leaves those results empty and lets the running ones finish', async () => {
    let stop = false
    const started: number[] = []
    const out = await inBatches([0, 1, 2, 3, 4], 2, async (i) => {
      started.push(i)
      if (i === 1) stop = true
      await tick()
      return i
    }, () => stop)
    expect(started).toEqual([0, 1])
    expect(out).toEqual([0, 1, undefined, undefined, undefined])
  })

  it('keeps going when one job fails, then fails with the first error', async () => {
    const done: number[] = []
    await expect(
      inBatches([0, 1, 2, 3], 2, async (i) => {
        if (i === 1) throw new Error('boom')
        done.push(i)
      })
    ).rejects.toThrow('boom')
    expect(done.sort()).toEqual([0, 2, 3])
  })
})
