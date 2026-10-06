import { describe, expect, it } from 'vitest'
import { MAX_VISITS, addVisit, ago, completion, forget, suggest, typed } from './addressHistory'

const v = (url: string, title = '', at = 1) => ({ url, title, at })

describe('addresses opened in the preview', () => {
  it('keeps each page once, newest first, up to a limit', () => {
    let list = addVisit([], v('http://localhost:5173/', 'Home', 1))
    list = addVisit(list, v('http://localhost:3000/app', 'App', 2))
    list = addVisit(list, v('http://localhost:5173/', 'Home again', 3))
    expect(list.map((x) => [x.url, x.title])).toEqual([['http://localhost:5173/', 'Home again'], ['http://localhost:3000/app', 'App']])
    let many = [] as ReturnType<typeof addVisit>
    for (let i = 0; i < MAX_VISITS + 10; i++) many = addVisit(many, v(`http://localhost:${3000 + i}/`, '', i))
    expect(many).toHaveLength(MAX_VISITS)
    expect(many[0]!.url).toBe(`http://localhost:${3000 + MAX_VISITS + 9}/`)
  })
  it('keeps a page\'s title when it is visited again before the title is known, and ignores the part after #', () => {
    const list = addVisit([v('http://localhost:5173/a', 'A', 1)], v('http://localhost:5173/a#top', '', 2))
    expect(list).toEqual([{ url: 'http://localhost:5173/a', title: 'A', at: 2 }])
  })
  it('forgets one address', () => {
    expect(forget([v('http://localhost:1/'), v('http://localhost:2/')], 'http://localhost:1/').map((x) => x.url)).toEqual(['http://localhost:2/'])
  })
  it('reads a short form as a local address and drops the scheme', () => {
    expect(typed('5173')).toBe('localhost:5173')
    expect(typed('5173/pricing')).toBe('localhost:5173/pricing')
    expect(typed(' http://localhost:3000/x ')).toBe('localhost:3000/x')
    expect(typed('pricing')).toBe('pricing')
  })
  it('narrows by any part of the address or title, with running servers first and no page twice', () => {
    const history = [v('http://localhost:5173/pricing', 'Pricing', 5), v('http://localhost:5173/', 'Home', 4), v('http://localhost:3000/app', 'Dashboard', 3)]
    const live = [{ url: 'http://localhost:5173', title: '' }]
    const all = suggest(history, live, '')
    expect(all.live.map((s) => s.url)).toEqual(['http://localhost:5173'])
    expect(all.recent.map((s) => s.url)).toEqual(['http://localhost:5173/pricing', 'http://localhost:3000/app'])
    expect(suggest(history, live, '5173').recent.map((s) => s.url)).toEqual(['http://localhost:5173/pricing'])
    expect(suggest(history, live, 'dash').recent.map((s) => s.url)).toEqual(['http://localhost:3000/app'])
    expect(suggest(history, live, 'dash').live).toEqual([])
  })
  it('offers the rest of the best match as grey text, only when it starts with what was typed', () => {
    expect(completion('517', 'http://localhost:5173/pricing')).toBe('3/pricing')
    expect(completion('localhost:51', 'http://localhost:5173/')).toBe('73/')
    expect(completion('pricing', 'http://localhost:5173/pricing')).toBe('')
    expect(completion('', 'http://localhost:5173/')).toBe('')
  })
  it('says how long ago', () => {
    const now = 10 * 86_400_000
    expect(ago(now - 30_000, now)).toBe('just now')
    expect(ago(now - 12 * 60_000, now)).toBe('12 min ago')
    expect(ago(now - 3 * 3_600_000, now)).toBe('3 h ago')
    expect(ago(now - 86_400_000, now)).toBe('yesterday')
    expect(ago(now - 4 * 86_400_000, now)).toBe('4 days ago')
  })
})
