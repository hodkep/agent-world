import { describe, expect, it } from 'vitest'
import type { Item } from './store'
import { INLINE_MAX, CORE_BUDGET, compile, merge, type Rule } from './playbook'

const item = (id: string, over: Partial<Item> = {}): Item => ({ id, kind: 'skill', name: id, description: `${id} does a thing.`, body: 'b', source: 'new', files: [], dir: '', tokens: { description: 5, body: 1 }, ...over })
const items = (...xs: Item[]) => new Map(xs.map((i) => [i.id, i]))
const rule = (id: string, over: Partial<Rule> = {}): Rule => ({ id, mode: 'on-demand', when: 'when it applies', strength: 'soft', ...over })

describe('which rules apply to an agent', () => {
  it('lets a more specific playbook override a broader one, rule by rule, and keeps the rest', () => {
    const merged = merge([rule('a', { mode: 'always' }), rule('b')], [rule('a', { mode: 'off' }), rule('c')])
    expect(merged.map((r) => [r.id, r.mode])).toEqual([['a', 'off'], ['b', 'on-demand'], ['c', 'on-demand']])
  })
})

describe('what an agent is told when it starts', () => {
  it('puts a short always-on item in the text itself, and tells the agent to read a long one first', () => {
    const short = item('terse', { kind: 'instruction', body: 'Talk short.', tokens: { description: 5, body: 3 } })
    const long = item('commit-style', { kind: 'skill', body: 'x'.repeat(4000), tokens: { description: 8, body: 1000 } })
    const c = compile([rule('terse', { mode: 'always' }), rule('commit-style', { mode: 'always' })], items(short, long), { canFetch: true })
    expect(c.core).toContain('Talk short.')
    expect(c.core).toContain("library_get('commit-style')")
    expect(c.core).not.toContain('xxxx')
  })
  it('lists on-demand items by when they apply, and says how to fetch them, only when the agent can fetch', () => {
    const tdd = item('tdd')
    const withFetch = compile([rule('tdd', { when: 'changing code that has tests' })], items(tdd), { canFetch: true })
    expect(withFetch.core).toContain('library_index')
    expect(withFetch.core).toContain('changing code that has tests: tdd')
    const without = compile([rule('tdd')], items(tdd), { canFetch: false })
    expect(without.core).not.toContain('library_index')
    expect(without.core).not.toContain('tdd')
  })
  it('puts every always-on item in the text when the agent cannot fetch, however long', () => {
    const long = item('big', { kind: 'instruction', body: 'y'.repeat(2000), tokens: { description: 5, body: 500 } })
    expect(compile([rule('big', { mode: 'always' })], items(long), { canFetch: false }).core).toContain('yyyy')
  })
  it('leaves out items that are off, are missing from the library, or belong to a workflow step', () => {
    const a = item('a')
    const c = compile([rule('a', { mode: 'off' }), rule('gone'), rule('a2', { mode: 'step' })], items(a, item('a2')), { canFetch: true })
    expect(c.core).toBe('')
    expect(c.indexIds).toEqual(['a2'])
  })
  it('measures the text against the budget and says which skills can be loaded natively', () => {
    const many = Array.from({ length: 40 }, (_, n) => item(`s${n}`, { description: 'x'.repeat(80) }))
    const c = compile(many.map((i) => rule(i.id, { when: 'x'.repeat(40) })), items(...many), { canFetch: true })
    expect(c.coreTokens).toBeGreaterThan(CORE_BUDGET)
    expect(c.overBudget).toBe(true)
    expect(c.skills).toHaveLength(40)
    expect(INLINE_MAX).toBeLessThan(CORE_BUDGET + 1)
  })
  it('adds a reminder line for medium and hard rules only', () => {
    const c = compile([rule('a', { mode: 'always', strength: 'medium', when: '' }), rule('b', { strength: 'hard', when: 'before a commit' }), rule('c', { strength: 'soft' })], items(item('a'), item('b'), item('c')), { canFetch: true })
    expect(c.reminder).toBe('Reminder: a (always); b (before a commit).')
    expect(compile([rule('c')], items(item('c')), { canFetch: true }).reminder).toBe('')
  })
})
