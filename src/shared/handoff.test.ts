import { describe, expect, it } from 'vitest'
import { handoffText, parseHandoff } from './handoff'

const base = { from: 'ada', branch: 'aw/ada', base: 'main', worktree: '/w/ada' }

describe('the message that hands work to another agent', () => {
  it('says who hands over what, how to read it, and what is wanted, for a review', () => {
    const t = handoffText({ ...base, kind: 'review' })
    expect(t.split('\n')[0]).toBe('Hand-off (review) from ada: branch aw/ada, based on main.')
    expect(t).toContain('Read it with: git diff main...aw/ada')
    expect(t).toMatch(/Do not edit, commit or run anything that changes files/)
  })
  it('for a continuation, tells a fresh agent its branch already holds the commits, and an existing one to bring them in', () => {
    expect(handoffText({ ...base, kind: 'continue', fresh: true })).toMatch(/Your branch starts from aw\/ada/)
    const t = handoffText({ ...base, kind: 'continue', fresh: false })
    expect(t).toContain('git merge aw/ada')
    expect(t).toContain('git log main..aw/ada')
  })
  it('for a question, points at the files it is about and asks for a short answer', () => {
    const t = handoffText({ ...base, kind: 'answer' })
    expect(t).toContain('git diff main...aw/ada --stat')
    expect(t).toMatch(/Answer briefly/)
  })
  it('carries the sender\'s note on one line', () => {
    expect(handoffText({ ...base, kind: 'review', note: ' the auth\nchange is the risky part ' })).toContain('Note from ada: the auth change is the risky part')
    expect(handoffText({ ...base, kind: 'review', note: '   ' })).not.toContain('Note from')
  })
  it('keeps only characters a branch or path can safely hold, since the receiver may be told to run them', () => {
    const t = handoffText({ ...base, branch: 'aw/x`; rm -rf /`', worktree: "/w/a b'c", kind: 'review' })
    expect(t).not.toContain('`')
    expect(t).not.toContain(';')
    expect(t).toContain('aw/x___rm_-rf_/_')
  })
})

describe('reading a hand-off back out of the text a receiver was given', () => {
  it('gives the kind, who, the branch, how to read it and the note', () => {
    const t = handoffText({ ...base, kind: 'continue', fresh: false, note: 'start with the tests' })
    expect(parseHandoff(t)).toMatchObject({ kind: 'continue', from: 'ada', branch: 'aw/ada', base: 'main', read: 'git log main..aw/ada', note: 'start with the tests' })
  })
  it('is null for anything that is not a hand-off', () => {
    expect(parseHandoff('please look at this')).toBeNull()
    expect(parseHandoff('see Hand-off (review) from ada: branch a, based on b.')).toBeNull()
  })
})
