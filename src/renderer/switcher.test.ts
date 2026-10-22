import { describe, expect, it } from 'vitest'
import { agentOrder, spaceOrder, stepped } from './switcher'

describe('the order the switcher steps through', () => {
  it('lists agents as the dropdown does, from the times read when it opened: groups first, then the latest first', () => {
    const agents = [
      { id: 'ada', activeAt: 1, group: 'docs' },
      { id: 'bo', activeAt: 1 },
      { id: 'cy', activeAt: 1 },
      { id: 'di', activeAt: 1, group: 'docs' }
    ]
    expect(agentOrder(agents, { ada: 5, bo: 2, cy: 9, di: 7 })).toEqual(['cy', 'bo', 'di', 'ada'])
  })

  it('falls back to the time the agent was loaded with when the read has none for it', () => {
    expect(agentOrder([{ id: 'ada', activeAt: 3 }, { id: 'bo', activeAt: 8 }], {})).toEqual(['bo', 'ada'])
  })

  it('lists projects as the dropdown does, leaving out folders that are gone', () => {
    const items = [
      { path: '/a', exists: true },
      { path: '/b', exists: false },
      { path: '/c', exists: true }
    ]
    expect(spaceOrder(items, { '/a': 1, '/b': 99, '/c': 5 })).toEqual(['/c', '/a'])
  })
})

describe('stepping from where you are', () => {
  const ids = ['a', 'b', 'c']

  it('goes one along per press, wraps, and goes back for -1', () => {
    expect(stepped(ids, 'a', [1])).toBe('b')
    expect(stepped(ids, 'a', [1, 1])).toBe('c')
    expect(stepped(ids, 'a', [1, 1, 1])).toBe('a')
    expect(stepped(ids, 'a', [-1])).toBe('c')
    expect(stepped(ids, 'b', [1, -1])).toBe('b')
  })

  it('stays put with nothing pressed, and has nowhere to go with one item or none', () => {
    expect(stepped(ids, 'b', [])).toBe('b')
    expect(stepped(['a'], 'a', [1])).toBe('a')
    expect(stepped([], null, [1])).toBeNull()
  })

  it('starts from the first (or last, going back) when the current one is not in the list', () => {
    expect(stepped(ids, 'x', [1])).toBe('a')
    expect(stepped(ids, null, [-1])).toBe('c')
  })
})
