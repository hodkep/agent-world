import { describe, expect, it } from 'vitest'
import type { Todo } from './todos'
import { MAX_WIDGETS, checkWidgets, metersFor, todosUpdatedBy } from './widgets'

const w = (o: Record<string, unknown> = {}) => ({ id: 'spend', slot: 'above-composer', height: 40, html: '<b>hi</b>', meters: ['usage'], ...o })

describe('a widget an agent writes', () => {
  it('is kept as written, with defaults for what it leaves out', () => {
    expect(checkWidgets([w()]).widgets).toEqual([{ id: 'spend', slot: 'above-composer', height: 40, html: '<b>hi</b>', meters: ['usage'] }])
    expect(checkWidgets([{ id: 'a', slot: 'chat-top', html: 'x' }]).widgets).toEqual([{ id: 'a', slot: 'chat-top', height: 40, html: 'x', meters: [] }])
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
