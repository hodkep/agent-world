import { describe, expect, it } from 'vitest'
import type { Summary, Tally } from '../../shared/library'
import { reachedFor } from './libraryStats'

// reminded, related, read of those, said no
type Row = [number, number, number, number?]
const tally = ([reminded, related, read, no]: Row): Tally => ({ delivered: 0, triggered: reminded, answered: read, used: read, declined: no ?? 0, related, relatedAnswered: read })
const stats = (items: Record<string, Row>, reasons: Record<string, string[]> = {}): Summary => ({
  items: Object.fromEntries(Object.entries(items).map(([id, r]) => [id, { id, ...tally(r), reasons: reasons[id] ?? [], byProvider: { claude: tally(r) } }])),
  agents: {},
  top: []
})

describe('reachedFor', () => {
  it('measures a rule on the prompts that looked related, not on every reminder: a rule reminded 200 times and related 40 is judged on 40', () => {
    const r = reachedFor(stats({ review: [200, 40, 30, 5] }), 'both', () => 'reviewing a change')
    expect(r.rows[0]).toMatchObject({ id: 'review', reminded: 200, related: 40, read: 30, declined: 5, silent: 5, health: 'good' })
    expect(r.rows[0]!.text).toBe('Looked related 40 times, read 30 (75%). Working.')
  })
  it('says "make it narrower" only when most said no: the agents judged it and it did not fit', () => {
    const r = reachedFor(stats({ a: [241, 29, 2, 26] }), 'both', () => 'a when').rows[0]!
    expect(r).toMatchObject({ health: 'bad', kind: 'broad' })
    expect(r.text).toContain('Looked related 29 times: read 2, said no 26.')
    expect(r.text).toContain('Make it narrower.')
    expect(r.advice).toContain('narrower')
  })
  it('says "ignored when it applies: make it firm or a step" when related prompts got neither a read nor a word', () => {
    const r = reachedFor(stats({ tdd: [175, 61, 16, 10] }), 'both', () => 'new behaviour').rows[0]!
    expect(r).toMatchObject({ health: 'bad', kind: 'ignored', silent: 35 })
    expect(r.text).toContain('passed over 35 without a word')
    expect(r.text).toContain('make it firm or a step')
    expect(r.text).not.toContain('too broad')
  })
  it('is fair for a rule read on part of what looked related, and working when most were read', () => {
    const r = reachedFor(stats({ mid: [50, 10, 5, 2], good: [50, 10, 9, 1] }), 'both', () => 'x')
    expect(r.rows.map((x) => [x.id, x.health])).toEqual([['mid', 'mid'], ['good', 'good']])
    expect(r.rows[0]!.text).toBe('Looked related 10 times: read 5 (50%), said no 2. Fine for a gentle rule.')
  })
  it('is too few to judge with fewer than three related prompts, and says how many there were; an old entry with none says so', () => {
    const r = reachedFor(stats({ prds: [16, 2, 1, 0], old: [30, 0, 0, 0] }), 'both', () => 'x')
    expect(r.rows.find((x) => x.id === 'prds')).toMatchObject({ health: 'few' })
    expect(r.rows.find((x) => x.id === 'prds')!.text).toBe('Reminded 16 times; only 2 looked related. Too few to judge yet.')
    expect(r.rows.find((x) => x.id === 'old')).toMatchObject({ health: 'few' })
    expect(r.rows.find((x) => x.id === 'old')!.text).toBe('Reminded 30 times, none yet on a prompt that looked related. Too few to judge yet.')
  })
  it('puts what needs attention first, the ones that are working next, and the ones too few to judge last', () => {
    const r = reachedFor(stats({ few: [5, 1, 0], good: [50, 10, 9], bad: [50, 10, 1, 8], mid: [50, 10, 5] }), 'both', () => 'x')
    expect(r.rows.map((x) => x.id)).toEqual(['bad', 'mid', 'good', 'few'])
  })
  it('leaves out an item never reminded, counts a program by itself, and sums to one line', () => {
    const s = stats({ x: [0, 0, 0], y: [10, 8, 6, 1], z: [20, 10, 5, 3] })
    expect(reachedFor(s, 'both', () => '').rows.map((r) => r.id).sort()).toEqual(['y', 'z'])
    expect(reachedFor(s, 'agy', () => '').rows).toEqual([])
    expect(reachedFor(s, 'both', () => '')).toMatchObject({ reminded: 30, related: 18, read: 11, declined: 4, share: 61 })
  })
  it('groups what agents said when they passed it over, said the same way once', () => {
    const s = stats({ merge: [40, 10, 2, 6] }, { merge: ['trivial, both sides only appended', 'No conflict markers left', 'trivial, both sides only appended', 'trivial, both sides only appended', 'trivial, both sides only appended', 'no conflict markers left'] })
    const row = reachedFor(s, 'both', () => 'git stopped a merge').rows[0]!
    expect(row.reasons).toEqual([{ text: 'trivial, both sides only appended', n: 4 }, { text: 'no conflict markers left', n: 2 }])
  })
  it('still says most said no when the reminders were logged before related prompts were noted: what the agents decided does not depend on it', () => {
    const row = reachedFor(stats({ merge: [10, 0, 0, 6] }), 'both', () => 'x').rows[0]!
    expect(row).toMatchObject({ kind: 'broad', health: 'bad' })
    expect(row.text).toContain('Reminded 10 times: read 0, said no 6.')
    expect(row.text).toContain('Make it narrower.')
  })
  it('says the item has no "when" when the verdict is to narrow one that does not exist', () => {
    const row = reachedFor(stats({ a: [100, 20, 1, 15] }), 'both', () => '').rows[0]!
    expect(row.text).toContain('It has no "when"')
  })
})
