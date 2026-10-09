import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { UseLog, summarize, type Use } from './uses'

const u = (over: Partial<Use>): Use => ({ t: 1, agent: 'a1', name: 'Ann', provider: 'claude', workspace: 'w', id: 'tdd', how: 'fetched', ...over })

describe('what the library log says', () => {
  it('counts a trigger as answered when the agent read the item in that turn or the next few, not before it', () => {
    const s = summarize([
      u({ how: 'triggered', turn: 4 }), u({ how: 'fetched', turn: 6 }),
      u({ how: 'triggered', turn: 10 }), u({ how: 'fetched', turn: 14 }),
      u({ how: 'triggered', turn: 20 }), u({ how: 'fetched', turn: 19 })
    ])
    expect(s.items.tdd).toMatchObject({ triggered: 3, answered: 1 })
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

describe('turns of different launches', () => {
  it('do not answer each other: turn 1 of one launch is not turn 1 of the next', () => {
    const s = summarize([u({ how: 'triggered', turn: 1, launch: 100 }), u({ how: 'fetched', turn: 1, launch: 200 })])
    expect(s.items.tdd).toMatchObject({ triggered: 1, answered: 0, used: 1 })
  })
})

describe('the log file', () => {
  let dir = ''
  afterEach(() => rmSync(dir, { recursive: true, force: true }))
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
