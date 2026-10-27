import { describe, expect, it } from 'vitest'
import type { FeedResult, FeedSpec } from '../shared/widgets'
import { createWidgetFeeds } from './widgetFeeds'

const spec = (id: string, every = 60, url = `https://${id}.example.com/q`): FeedSpec => ({ id, url, every })

/** A clock that only moves when told, and a fetch that answers when told. */
function rig() {
  const timers: { at: number; fn: () => void; id: number }[] = []
  let now = 0
  let nextId = 1
  const calls: { url: string; resolve: (r: FeedResult) => void }[] = []
  const updates: { key: string; feed: string; r: FeedResult }[] = []
  const feeds = createWidgetFeeds({
    fetch: (url) => new Promise((resolve) => calls.push({ url, resolve })),
    schedule: (fn, ms) => {
      const id = nextId++
      timers.push({ at: now + ms, fn, id })
      return () => void timers.splice(0, timers.length, ...timers.filter((t) => t.id !== id))
    },
    now: () => now,
    onUpdate: (key, feed, r) => updates.push({ key, feed, r })
  })
  const ok = (text = '{}'): FeedResult => ({ ok: true, status: 200, text, at: now })
  const answer = async (i = 0, r = ok()) => (calls[i]!.resolve(r), await Promise.resolve(), await Promise.resolve())
  const advance = async (ms: number) => {
    now += ms
    for (const t of timers.filter((x) => x.at <= now).sort((a, b) => a.at - b.at)) (timers.splice(timers.indexOf(t), 1), t.fn())
    await Promise.resolve()
  }
  return { feeds, calls, updates, timers, answer, advance, ok, now: () => now }
}

describe('loading what widgets asked for', () => {
  it('loads each address at once, hands the result on, and again after its interval', async () => {
    const r = rig()
    r.feeds.sync([{ key: 'current:quotes', feeds: [spec('tcs', 30)] }])
    expect(r.calls.map((c) => c.url)).toEqual(['https://tcs.example.com/q'])
    await r.answer(0, r.ok('{"p":1}'))
    expect(r.updates).toEqual([{ key: 'current:quotes', feed: 'tcs', r: expect.objectContaining({ ok: true, text: '{"p":1}' }) }])
    expect(r.feeds.state()['current:quotes']!.tcs!.text).toBe('{"p":1}')
    await r.advance(29_000)
    expect(r.calls).toHaveLength(1)
    await r.advance(1_000)
    expect(r.calls).toHaveLength(2)
  })

  it('never loads more than two at a time; the rest wait their turn', async () => {
    const r = rig()
    r.feeds.sync([{ key: 'current:w', feeds: ['a', 'b', 'c', 'd'].map((x) => spec(x)) }])
    expect(r.calls).toHaveLength(2)
    await r.answer(0)
    expect(r.calls).toHaveLength(3)
    await r.answer(1)
    expect(r.calls).toHaveLength(4)
  })

  it('stops loading what is no longer wanted, and drops its result, even one still on its way', async () => {
    const r = rig()
    r.feeds.sync([{ key: 'draft:w', feeds: [spec('a')] }])
    r.feeds.sync([])
    await r.answer(0)
    expect(r.updates).toEqual([])
    expect(r.feeds.state()).toEqual({})
    await r.advance(10 * 60_000)
    expect(r.calls).toHaveLength(1)
  })

  it('keeps a feed that is unchanged running and restarts one whose address or rate changed', async () => {
    const r = rig()
    r.feeds.sync([{ key: 'current:w', feeds: [spec('a')] }])
    await r.answer(0)
    r.feeds.sync([{ key: 'current:w', feeds: [spec('a')] }])
    expect(r.calls).toHaveLength(1)
    r.feeds.sync([{ key: 'current:w', feeds: [spec('a', 60, 'https://other.example.com/q')] }])
    expect(r.calls.map((c) => c.url)).toEqual(['https://a.example.com/q', 'https://other.example.com/q'])
    expect(r.feeds.state()['current:w']?.a).toBeUndefined()
  })

  it('waits longer after a failure, doubling up to ten minutes, and goes back to its own rate when it works again', async () => {
    const r = rig()
    r.feeds.sync([{ key: 'current:w', feeds: [spec('a', 30)] }])
    const fail = { ok: false, status: 429, text: '', at: 0, error: 'The site answered 429.' }
    await r.answer(0, fail)
    await r.advance(30_000)
    expect(r.calls).toHaveLength(1) // 60 s after the first failure, not 30
    await r.advance(30_000)
    expect(r.calls).toHaveLength(2)
    await r.answer(1, fail)
    await r.advance(119_000)
    expect(r.calls).toHaveLength(2)
    await r.advance(1_000)
    expect(r.calls).toHaveLength(3)
    await r.answer(2, r.ok())
    await r.advance(30_000)
    expect(r.calls).toHaveLength(4)
  })

  it('stop() ends everything', async () => {
    const r = rig()
    r.feeds.sync([{ key: 'current:w', feeds: [spec('a')] }])
    await r.answer(0)
    r.feeds.stop()
    await r.advance(60 * 60_000)
    expect(r.calls).toHaveLength(1)
  })
})
