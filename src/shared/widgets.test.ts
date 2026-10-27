import { describe, expect, it } from 'vitest'
import type { Todo } from './todos'
import { MAX_FEEDS, MAX_WIDGETS, checkWidgets, feedHost, metersFor, todosUpdatedBy } from './widgets'

const w = (o: Record<string, unknown> = {}) => ({ id: 'spend', slot: 'above-composer', height: 40, html: '<b>hi</b>', meters: ['usage'], ...o })

describe('a widget an agent writes', () => {
  it('is kept as written, with defaults for what it leaves out', () => {
    expect(checkWidgets([w()]).widgets).toEqual([{ id: 'spend', slot: 'above-composer', height: 40, html: '<b>hi</b>', meters: ['usage'], fetch: [] }])
    expect(checkWidgets([{ id: 'a', slot: 'chat-top', html: 'x' }]).widgets).toEqual([{ id: 'a', slot: 'chat-top', height: 40, html: 'x', meters: [], fetch: [] }])
  })
  it('is left out, with the reason, when its id, place, size, page or numbers are not allowed', () => {
    for (const bad of [{ id: 'Bad Id' }, { id: '' }, { id: 'x'.repeat(31) }, { slot: 'floating' }, { height: 5 }, { height: 999 }, { html: '' }, { html: 'x'.repeat(100_001) }, { meters: ['everything'] }, { meters: 'usage' }]) {
      const c = checkWidgets([w(bad)])
      expect(c.widgets, JSON.stringify(bad).slice(0, 40)).toEqual([])
      expect(c.problems.length).toBeGreaterThan(0)
    }
  })
  it('two with one id, or more than six, are not allowed', () => {
    expect(checkWidgets([w(), w()]).problems[0]).toMatch(/twice/)
    expect(checkWidgets(Array.from({ length: 8 }, (_, i) => w({ id: `w${i}` }))).widgets).toHaveLength(MAX_WIDGETS)
  })
  it('nothing, or something that is not a list, is no widgets', () => {
    expect(checkWidgets(undefined)).toEqual({ widgets: [], problems: [] })
    expect(checkWidgets('x').problems).toHaveLength(1)
  })
})

describe('the numbers a widget may be given', () => {
  const limits = { fiveHour: { pct: 38, resetsAt: 1_000 }, sevenDay: null }
  it('are the allowance left (not used), tokens, cost and todos, and only those it asked for', () => {
    const all = metersFor(['usage', 'tokens', 'cost', 'todos'], { limits, tokens: { input: 48_000, output: 12_000 }, costUsd: 0.43, todosUpdated: 3 })
    expect(all).toEqual({ usage: { fiveHour: { left: 62, resetsAt: 1_000 }, sevenDay: null }, tokens: { input: 48_000, output: 12_000 }, cost: 0.43, todos: 3 })
    expect(metersFor(['cost'], { limits, costUsd: 0.43 })).toEqual({ cost: 0.43 })
    expect(metersFor([], { limits, costUsd: 1 })).toEqual({})
  })
  it('say nothing for what is not known, rather than zero', () => {
    expect(metersFor(['tokens', 'todos'], { limits })).toEqual({ tokens: null, todos: null })
  })
})

const todo = (id: string, history: { at: number; by: { kind: 'human' | 'agent'; id?: string; name: string } }[]) => ({ id, history }) as unknown as Todo
describe('todos an agent updated', () => {
  const me = { kind: 'agent' as const, id: 'a1', name: 'ada' }
  const other = { kind: 'agent' as const, id: 'a2', name: 'bo' }
  it('counts each todo once, for any change it made since a time, not the person\'s or another agent\'s', () => {
    const board = [todo('1', [{ at: 10, by: me }, { at: 20, by: me }]), todo('2', [{ at: 5, by: me }]), todo('3', [{ at: 30, by: other }]), todo('4', [{ at: 40, by: { kind: 'human', name: 'p' } }]), todo('5', [{ at: 50, by: me }])]
    expect(todosUpdatedBy(board, 'a1', 8)).toBe(2)
    expect(todosUpdatedBy(board, 'a1', 0)).toBe(3)
    expect(todosUpdatedBy(board, 'a2', 0)).toBe(1)
    expect(todosUpdatedBy([], 'a1', 0)).toBe(0)
  })
})

describe('data a widget loads from the internet', () => {
  const feed = (o: Record<string, unknown> = {}) => ({ id: 'quote', url: 'https://query1.finance.yahoo.com/v8/finance/chart/TCS.NS?range=1d', every: 60, ...o })
  const wf = (fetch: unknown, o: Record<string, unknown> = {}) => w({ meters: [], fetch, ...o })

  it('is kept as declared: any public https address, no list of allowed domains, with a default rate', () => {
    expect(checkWidgets([wf([feed()])]).widgets[0]!.fetch).toEqual([feed()])
    expect(checkWidgets([wf([{ id: 'a', url: 'https://anything.example.org/x.json' }])]).widgets[0]!.fetch).toEqual([{ id: 'a', url: 'https://anything.example.org/x.json', every: 60 }])
  })
  it('refuses an address that is not https, has a login in it, names a port, a number or localhost, or is too long', () => {
    for (const url of ['http://a.example.com/x', 'ftp://a.example.com/x', 'file:///etc/passwd', 'javascript:alert(1)', 'https://user:pw@a.example.com/x', 'https://a.example.com:8443/x', 'https://127.0.0.1/x', 'https://10.0.0.1/x', 'https://[::1]/x', 'https://localhost/x', 'https://printer.local/x', 'https://intranet/x', 'https://a.example.com/' + 'x'.repeat(500), 'not a url', '']) {
      const c = checkWidgets([wf([feed({ url })])])
      expect(c.widgets, url.slice(0, 40)).toEqual([])
      expect(c.problems.length, url.slice(0, 40)).toBeGreaterThan(0)
    }
  })
  it('refuses a rate under 15 seconds or over an hour, a bad or repeated id, and more than four', () => {
    for (const bad of [{ every: 5 }, { every: 99_999 }, { every: 1.5 }, { id: 'Bad Id' }]) expect(checkWidgets([wf([feed(bad)])]).widgets, JSON.stringify(bad)).toEqual([])
    expect(checkWidgets([wf([feed(), feed()])]).problems[0]).toMatch(/twice/)
    expect(checkWidgets([wf(Array.from({ length: 5 }, (_, i) => feed({ id: `f${i}` })))]).widgets).toEqual([])
  })
  it('a widget gets the app\'s numbers or loads data, never both: the numbers could otherwise leave in an address', () => {
    const c = checkWidgets([w({ meters: ['usage'], fetch: [feed()] })])
    expect(c.widgets).toEqual([])
    expect(c.problems[0]).toMatch(/never both/)
  })
  it('is capped over all the widgets together', () => {
    const many = Array.from({ length: 4 }, (_, i) => wf(Array.from({ length: 3 }, (_, j) => feed({ id: `f${j}`, url: `https://a${i}.example.com/${j}` })), { id: `w${i}` }))
    const c = checkWidgets(many)
    expect(c.widgets.flatMap((x) => x.fetch)).toHaveLength(6) // two whole widgets fit; the third would make nine
    expect(c.widgets.flatMap((x) => x.fetch).length).toBeLessThanOrEqual(MAX_FEEDS)
    expect(c.problems.join(' ')).toMatch(/at most/)
  })
  it('names the host, for the bar that asks the person to load it', () => {
    expect(feedHost('https://Query1.Finance.Yahoo.com/v8/x?y=1')).toBe('query1.finance.yahoo.com')
    expect(feedHost('nonsense')).toBe('?')
  })
  it('the bottom of the window is a place for a widget', () => {
    expect(checkWidgets([wf([feed()], { slot: 'window-bottom' })]).widgets).toHaveLength(1)
  })
})
