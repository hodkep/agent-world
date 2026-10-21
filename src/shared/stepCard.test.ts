import { describe, expect, it } from 'vitest'
import type { MergeCheck } from './mergeCheck'
import { stepCardOf } from './stepCard'

const check = (o: Partial<MergeCheck> = {}): MergeCheck => ({ run: { id: 'r1', title: 'Add a toggle' }, plan: 'approved', planned: null, commits: 2, flagged: 0, audit: { state: 'not-run' }, asideAudit: false, checks: [], blocking: [], notes: [], ...o })
const done = (findings: { kind: 'out-of-scope' | 'goal-unmet' | 'guess-wrong'; text: string; file?: string; files?: string[]; seen?: boolean }[], t = 0): MergeCheck['audit'] => ({ state: 'done', t, findings: findings.map((f) => ({ seen: false, ...f })), files: 3, lines: 40, truncated: false })
const ask = (o: { merge?: MergeCheck | null; held?: boolean; working?: boolean; unrelated?: { branch: string; base: string } | null; now?: number } = {}) => stepCardOf({ merge: check(), held: false, working: false, unrelated: null, now: 100_000, ...o })

describe('the card of the step that waits for the person', () => {
  it('is nothing with no gate, while the agent works, or when nothing is waiting', () => {
    expect(ask({ merge: null })).toBeNull()
    expect(ask({ merge: check({ audit: done([{ kind: 'out-of-scope', text: 'a' }]) }), working: true })).toBeNull()
    expect(ask({ merge: check() })).toBeNull()
    expect(ask({ merge: check({ audit: done([]) }) })).toBeNull()
    expect(ask({ merge: check({ audit: done([{ kind: 'out-of-scope', text: 'a', seen: true }]) }) })).toBeNull()
  })

  it('is the audit with what is left to look at, and the two answers: all seen, or set aside', () => {
    const card = ask({ merge: check({ audit: done([{ kind: 'out-of-scope', file: 'src/theme.ts', text: 'Adds a project key.' }, { kind: 'guess-wrong', text: 'Saved in localStorage.' }, { kind: 'goal-unmet', text: 'Seen already.', seen: true }]) }) })
    expect(card).toMatchObject({ kind: 'audit', tag: 'AUDIT', title: '2 things to look at', more: 0, actions: { seenAll: true, again: false, aside: true, undo: false } })
    expect(card!.lines).toEqual([
      { text: 'Adds a project key.', where: 'out of scope · src/theme.ts', index: 0, kind: 'out-of-scope', files: ['src/theme.ts'] },
      { text: 'Saved in localStorage.', where: 'guess may be wrong', index: 1, kind: 'guess-wrong', files: [] }
    ])
  })

  it('shows a finding that covers several files as one row with how many, keeps its place in the audit once earlier ones were seen, and offers Add to plan for out-of-scope work only', () => {
    const files = Array.from({ length: 8 }, (_, i) => `src/code/f${i}.ts`)
    const card = ask({ merge: check({ audit: done([{ kind: 'goal-unmet', text: 'Seen.', seen: true }, { kind: 'out-of-scope', files, text: 'The fold feature.' }, { kind: 'goal-unmet', text: 'No test.' }]) }) })!
    expect(card.lines).toEqual([
      { text: 'The fold feature.', where: 'out of scope · 8 files', index: 1, kind: 'out-of-scope', files },
      { text: 'No test.', where: 'goal not met', index: 2, kind: 'goal-unmet', files: [] }
    ])
  })

  it('shows the first four findings and says how many more', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ kind: 'out-of-scope' as const, file: `f${i}.ts`, text: `finding ${i}` }))
    const card = ask({ merge: check({ audit: done(many) }) })!
    expect(card.title).toBe('7 things to look at')
    expect(card.lines).toHaveLength(4)
    expect(card.more).toBe(3)
  })

  it('is a failed audit with the reason, to run again or set aside', () => {
    expect(ask({ merge: check({ audit: { state: 'failed', reason: 'Credit balance is too low' } }) })).toMatchObject({ kind: 'failed', tag: 'AUDIT', title: 'The audit failed', lines: [{ text: 'Credit balance is too low' }], actions: { again: true, aside: true, seenAll: false } })
  })

  it('is what holds the merge while git holds it, with the unseen findings answered all at once, and one word to set aside', () => {
    const card = ask({ held: true, merge: check({ plan: 'waiting', blocking: ['The plan is still waiting for your approval.', '1 audit finding has not been seen.'], audit: done([{ kind: 'out-of-scope', text: 'Adds a project key.' }]) }) })!
    expect(card).toMatchObject({ kind: 'hold', tag: 'LAND HELD', title: '2 things hold the merge', actions: { seenAll: true, aside: true, again: false } })
    expect(card.lines.map((l) => l.text)).toEqual(['The plan is still waiting for your approval.', '1 audit finding has not been seen.', 'Adds a project key.'])
  })

  it('lists the unseen findings under what holds the push, each with its place in the audit, so they can be answered one by one from the held card', () => {
    const files = ['src/code/a.ts', 'src/code/b.ts', 'src/code/c.ts']
    const card = ask({ held: true, merge: check({ land: 'pr', blocking: ['2 audit findings have not been seen.'], audit: done([{ kind: 'out-of-scope', files, text: 'The fold feature.' }, { kind: 'goal-unmet', text: 'No test for a 5-digit line count.' }]) }) })!
    expect(card.lines).toEqual([
      { text: '2 audit findings have not been seen.' },
      { text: 'The fold feature.', where: 'out of scope · 3 files', index: 0, kind: 'out-of-scope', files },
      { text: 'No test for a 5-digit line count.', where: 'goal not met', index: 1, kind: 'goal-unmet', files: [] }
    ])
    expect(card.more).toBe(0)
  })

  it('is a card while the audit runs, saying how many commits it reviews and how long it has taken, with the one word to set it aside, and nothing before it starts', () => {
    const card = ask({ merge: check({ commits: 3, audit: { state: 'running', since: 78_000 } }) })!
    expect(card).toMatchObject({ kind: 'running', tag: 'AUDIT', title: 'Reviewing 3 commits against your plan', since: 78_000, actions: { aside: true, seenAll: false, again: false, undo: false } })
    expect(ask({ merge: check({ commits: 1, audit: { state: 'running', since: 99_000 } }) })!.title).toBe('Reviewing 1 commit against your plan')
    expect(ask({ merge: check({ audit: { state: 'not-run' } }) })).toBeNull()
    expect(ask({ merge: check({ audit: { state: 'running', since: 1 } }), working: true })).toBeNull()
    expect(ask({ merge: check({ audit: { state: 'running', since: 1 }, asideAudit: true }) })).toMatchObject({ kind: 'aside' })
  })

  it('is one quiet line for a few seconds after an audit that found nothing, then nothing, and never for one that found something or is old', () => {
    const clean = (t: number) => check({ commits: 3, audit: done([], t) })
    expect(ask({ merge: clean(97_000) })).toMatchObject({ kind: 'clean', tag: 'AUDIT', title: 'Found nothing in 3 commits', lines: [], actions: { aside: false } })
    expect(ask({ merge: clean(93_900) })).toBeNull()
    expect(ask({ merge: check({ audit: done([{ kind: 'out-of-scope', text: 'a', seen: true }], 99_000) }) })).toBeNull()
    expect(ask({ merge: check({ audit: done([{ kind: 'out-of-scope', text: 'a' }], 99_000) }) })).toMatchObject({ kind: 'audit' })
  })

  it('offers to run the audit when git holds the merge for a review that has not run for this branch', () => {
    const card = ask({ held: true, merge: check({ blocking: ['The plan is still waiting for your approval.'], audit: { state: 'not-run' } }) })!
    expect(card).toMatchObject({ kind: 'hold', actions: { again: true, seenAll: false, aside: true }, againLabel: 'Run the audit' })
    expect(ask({ merge: check({ audit: { state: 'failed', reason: 'x' } }) })).toMatchObject({ againLabel: 'Run the audit again' })
  })

  it('is one quiet line when the branch shares no history with its base, with or without a gate, and nothing else matters then', () => {
    const line = { kind: 'unrelated', tag: 'NOT LANDABLE', title: "This branch does not come from main's history: reset it onto main before landing", actions: { seenAll: false, again: false, aside: false, undo: false } }
    expect(ask({ merge: null, unrelated: { branch: 'aw/ada', base: 'main' } })).toMatchObject(line)
    expect(ask({ held: true, merge: check({ blocking: ['x'], audit: done([{ kind: 'out-of-scope', text: 'a' }]) }), unrelated: { branch: 'aw/ada', base: 'main' } })).toMatchObject(line)
    expect(ask({ merge: null, unrelated: { branch: 'aw/ada', base: 'main' }, working: true })).toBeNull()
  })

  it('says the push is held, not the merge, for a run that ends in a pull request', () => {
    const one = ask({ held: true, merge: check({ land: 'pr', blocking: ['1 audit finding has not been seen.'], audit: done([{ kind: 'out-of-scope', text: 'x' }]) }) })!
    expect(one).toMatchObject({ kind: 'hold', tag: 'PUSH HELD', title: '1 thing holds the push' })
    expect(ask({ held: true, merge: check({ land: 'pr', blocking: ['a', 'b'] }) })).toMatchObject({ tag: 'PUSH HELD', title: '2 things hold the push' })
  })

  it('is nothing for a hold that has nothing left holding it', () => {
    expect(ask({ held: true, merge: check({ blocking: [] }) })).toBeNull()
    expect(ask({ held: true, merge: check({ blocking: ['2 audit findings have not been seen.'] }) })).toMatchObject({ title: '1 thing holds the merge' })
  })

  it('is one quiet line after the audit was set aside, with how much was not looked at and a way back', () => {
    expect(ask({ merge: check({ asideAudit: true, audit: done([{ kind: 'out-of-scope', text: 'a' }, { kind: 'out-of-scope', text: 'b' }]) }) })).toMatchObject({ kind: 'aside', tag: 'SET ASIDE', title: 'You set the audit aside · 2 things not looked at', actions: { undo: true, aside: false, seenAll: false } })
    expect(ask({ merge: check({ asideAudit: true }) })).toMatchObject({ kind: 'aside', title: 'You set the audit aside' })
  })
})
