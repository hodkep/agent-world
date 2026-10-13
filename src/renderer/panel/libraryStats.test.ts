import { describe, expect, it } from 'vitest'
import type { Summary } from '../../shared/library'
import { reachedFor } from './libraryStats'

const t = (triggered: number, answered: number) => ({ delivered: 0, triggered, answered, used: answered, declined: 0 })
const stats = (items: Record<string, [number, number, number?, number?]>): Summary => ({
  items: Object.fromEntries(Object.entries(items).map(([id, [trig, ans, ct, at]]) => [id, { id, ...t(trig, ans), reasons: [], byProvider: { claude: t(ct ?? trig, ct === undefined ? ans : Math.min(ans, ct)), ...(at !== undefined ? { agy: t(at, 0) } : {}) } }])),
  agents: {},
  top: []
})

describe('reachedFor', () => {
  it('puts items that were pointed at and not read first, then fair, then working, then too few to judge', () => {
    const r = reachedFor(stats({ good: [10, 9], bad: [10, 1], mid: [10, 5], few: [2, 0] }), 'both', () => 'a when')
    expect(r.rows.map((x) => [x.id, x.health])).toEqual([['bad', 'bad'], ['mid', 'mid'], ['good', 'good'], ['few', 'few']])
  })
  it('says what to look at: the when, or that there is none', () => {
    const s = stats({ a: [10, 1], b: [10, 1] })
    const r = reachedFor(s, 'both', (id) => (id === 'a' ? 'building a feature' : ''))
    expect(r.rows.find((x) => x.id === 'a')!.text).toContain('may be too broad')
    expect(r.rows.find((x) => x.id === 'b')!.text).toContain('no "when"')
  })
  it('leaves out an item that was never pointed at, and counts a program by itself', () => {
    const s = stats({ x: [0, 0], y: [10, 8, 6] })
    expect(reachedFor(s, 'both', () => '').rows.map((r) => r.id)).toEqual(['y'])
    expect(reachedFor(s, 'claude', () => '').rows[0]).toMatchObject({ pointed: 6, read: 6 })
  })
  it('sums to one line: how often pointed, how often read, and the share', () => {
    expect(reachedFor(stats({ a: [10, 5], b: [10, 7] }), 'both', () => '')).toMatchObject({ pointed: 20, read: 12, share: 60 })
  })
  it('tells apart an item agents said no to from one nobody answered, and groups what they said', () => {
    const s = stats({ merge: [10, 2] })
    s.items.merge!.declined = 6
    s.items.merge!.byProvider.claude!.declined = 6
    s.items.merge!.reasons = ['trivial, both sides only appended', 'No conflict markers left', 'trivial, both sides only appended', 'trivial, both sides only appended', 'trivial, both sides only appended', 'no conflict markers left']
    const row = reachedFor(s, 'both', () => 'git stopped a merge').rows[0]!
    expect(row).toMatchObject({ pointed: 10, read: 2, declined: 6, silent: 2 })
    expect(row.text).toContain('6 said no')
    expect(row.text).toContain('2 passed over without a word')
    expect(row.reasons).toEqual([{ text: 'trivial, both sides only appended', n: 4 }, { text: 'no conflict markers left', n: 2 }])
    expect(row.advice).toContain('narrower')
  })
  it('says nothing new for an item nobody said no to', () => {
    const row = reachedFor(stats({ a: [10, 9] }), 'both', () => 'x').rows[0]!
    expect(row).toMatchObject({ declined: 0, silent: 1, reasons: [], advice: '' })
    expect(row.text).not.toContain('said no')
    // ...but it still says how many were passed over without a word
    expect(row.text).toContain('1 passed over without a word')
  })
})
