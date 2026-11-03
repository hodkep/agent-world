import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { UseLog, skillUsage, summarize, type Use } from './uses'

const u = (over: Partial<Use>): Use => ({ t: 1, agent: 'a1', name: 'Ann', provider: 'claude', workspace: 'w', id: 'tdd', how: 'fetched', ...over })

describe('what the library log says', () => {
  it('counts a trigger as answered when the agent read the item in that turn or any later turn of the same launch, not before it: it reads when it gets to the work', () => {
    const s = summarize([
      u({ how: 'triggered', turn: 4 }), u({ how: 'fetched', turn: 6 }),
      u({ how: 'triggered', turn: 10 }), u({ how: 'fetched', turn: 14 }),
      u({ how: 'triggered', turn: 20 }), u({ how: 'fetched', turn: 19 })
    ])
    expect(s.items.tdd).toMatchObject({ triggered: 3, answered: 2 })
  })

  it('counts a trigger as answered only when the same agent used the item in the same turn', () => {
    const s = summarize([
      u({ how: 'triggered', turn: 1 }), u({ how: 'fetched', turn: 1 }),
      u({ how: 'triggered', turn: 2 }),
      u({ how: 'triggered', turn: 3, agent: 'a2', name: 'Bo', provider: 'agy' }), u({ how: 'fetched', turn: 2, agent: 'a2', provider: 'agy' })
    ])
    expect(s.items.tdd).toMatchObject({ triggered: 3, answered: 1, used: 2 })
    expect(s.items.tdd!.byProvider.claude).toMatchObject({ triggered: 2, answered: 1, used: 1 })
    expect(s.agents.a1).toMatchObject({ triggered: 2, answered: 1 })
  })
  it('counts delivered, skill and read uses, and lists the most used first', () => {
    const s = summarize([u({ how: 'delivered', id: 'terse' }), u({ how: 'skill' }), u({ how: 'read' }), u({ how: 'fetched', id: 'pptx' })])
    expect(s.items.terse).toMatchObject({ delivered: 1, used: 0 })
    expect(s.items.tdd).toMatchObject({ used: 2 })
    expect(s.top.map((x) => x.id)).toEqual(['tdd', 'pptx'])
  })
})

describe('an item the agent decided not to use', () => {
  it('is counted as declined, with its reason, apart from a pointer nobody answered', () => {
    const s = summarize([
      u({ how: 'triggered', turn: 1 }), u({ how: 'skipped', turn: 1, reason: 'trivial, both sides only appended' }),
      u({ how: 'triggered', turn: 2 }),
      u({ how: 'triggered', turn: 3, provider: 'agy' }), u({ how: 'skipped', turn: 3, provider: 'agy', reason: 'a question, not the work' })
    ])
    expect(s.items.tdd).toMatchObject({ triggered: 3, answered: 0, declined: 2 })
    expect(s.items.tdd!.reasons).toEqual(['trivial, both sides only appended', 'a question, not the work'])
    expect(s.items.tdd!.byProvider.agy).toMatchObject({ declined: 1 })
    expect(s.top).toEqual([])
  })
})

describe('a reminder that came on a prompt that looked related', () => {
  it('is counted apart from the reminders that did not, and as answered when the item was read in that launch from then on', () => {
    const s = summarize([
      u({ how: 'triggered', turn: 1, related: true }), u({ how: 'fetched', turn: 9 }),
      u({ how: 'triggered', turn: 7, related: true }),
      u({ how: 'triggered', turn: 13, related: false }),
      u({ how: 'triggered', turn: 19, related: true, provider: 'agy', agent: 'a2' })
    ])
    expect(s.items.tdd).toMatchObject({ triggered: 4, related: 3, relatedAnswered: 2 })
    expect(s.items.tdd!.byProvider.claude).toMatchObject({ triggered: 3, related: 2, relatedAnswered: 2 })
    expect(s.items.tdd!.byProvider.agy).toMatchObject({ triggered: 1, related: 1, relatedAnswered: 0 })
  })
  it('is not guessed for an entry logged before the check existed: it is a reminder and nothing more', () => {
    const s = summarize([u({ how: 'triggered', turn: 1 }), u({ how: 'fetched', turn: 2 })])
    expect(s.items.tdd).toMatchObject({ triggered: 1, answered: 1, related: 0, relatedAnswered: 0 })
  })
})

describe('turns of different launches', () => {
  it('do not answer each other: turn 1 of one launch is not turn 1 of the next', () => {
    const s = summarize([u({ how: 'triggered', turn: 1, launch: 100 }), u({ how: 'fetched', turn: 1, launch: 200 })])
    expect(s.items.tdd).toMatchObject({ triggered: 1, answered: 0, used: 1 })
  })
})

describe('the log file', () => {
  let dir = ''
  afterEach(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))
  it('appends lines, reads them back, and skips a half-written last line', async () => {
    dir = mkdtempSync(join(tmpdir(), 'uses-'))
    const log = new UseLog(join(dir, 'sub', 'uses.jsonl'))
    expect(log.all()).toEqual([])
    log.add({ agent: 'a', name: 'A', provider: 'claude', workspace: 'w', id: 'x', how: 'fetched' })
    log.add({ agent: 'a', name: 'A', provider: 'claude', workspace: 'w', id: 'y', how: 'skill' })
    const { appendFileSync } = await import('node:fs')
    appendFileSync(join(dir, 'sub', 'uses.jsonl'), '{"t":')
    expect(log.all().map((x) => x.id)).toEqual(['x', 'y'])
  })
})

describe('how often each skill was used', () => {
  const DAY = 86_400_000
  const now = 100 * DAY
  const use = (id: string, daysAgo: number, how: Use['how'], agent = 'a1', name = 'delta', account?: string): Use => ({ t: now - daysAgo * DAY, agent, name, provider: 'claude', workspace: 'w', id, how, account })
  it('counts the loads and reads of the last 30 days, says when the last one was, and who used it with which account', () => {
    const u = skillUsage([
      use('pdf', 1, 'skill', 'a1', 'delta', 'work'),
      use('pdf', 2, 'fetched', 'a2', 'charlie'),
      use('pdf', 3, 'read', 'a1', 'delta', 'work'),
      use('pdf', 4, 'triggered'),
      use('pdf', 40, 'skill', 'a3', 'os', 'rushikesh'),
      use('memo', 45, 'skill')
    ], now)
    expect(u.pdf).toMatchObject({ used: 3, last: now - DAY, agents: ['charlie', 'delta'], accounts: ['work'] })
    // Used only long ago: none in 30 days, but its last use is kept.
    expect(u.memo).toMatchObject({ used: 0, last: now - 45 * DAY, agents: [], accounts: [] })
    expect(u.graphify).toBeUndefined()
  })

  it('says how many uses each of the 30 days had, oldest first and today last, and which agents by id, so each can be drawn as its office figure', () => {
    const u = skillUsage([use('pdf', 0, 'skill', 'a1', 'delta'), use('pdf', 0.5, 'read', 'a1', 'delta'), use('pdf', 3, 'fetched', 'a2', 'charlie'), use('pdf', 29.5, 'skill', 'a2', 'charlie'), use('pdf', 31, 'skill', 'a3', 'os')], now)
    expect(u.pdf!.days).toHaveLength(30)
    expect(u.pdf!.days[29]).toBe(2)
    expect(u.pdf!.days[26]).toBe(1)
    expect(u.pdf!.days[0]).toBe(1)
    expect(u.pdf!.days.reduce((a, b) => a + b, 0)).toBe(u.pdf!.used)
    expect(u.pdf!.who).toEqual([{ id: 'a2', name: 'charlie' }, { id: 'a1', name: 'delta' }])
  })

  it('counts a skill once per turn of an agent, however many of its files it read then; uses with no turn count one each', () => {
    const at = (turn: number | undefined, how: Use['how'] = 'read'): Use => ({ ...use('pdf', 1, how), launch: 5, ...(turn !== undefined && { turn }) })
    const u = skillUsage([at(3, 'skill'), at(3), at(3), at(4), at(undefined), at(undefined)], now)
    expect(u.pdf!.used).toBe(4)
    expect(u.pdf!.days.reduce((a, b) => a + b, 0)).toBe(4)
  })
})
