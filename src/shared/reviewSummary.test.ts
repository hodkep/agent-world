import { describe, expect, it } from 'vitest'
import type { WorkflowDiff } from './builder'
import { askRows, reviewSummary } from './reviewSummary'
import type { PreviewRow } from './workflowPreview'

const same: WorkflowDiff = { isNew: false, same: true, added: [], removed: [], changed: [], reordered: false, unchanged: ['A', 'B'], commands: [] as unknown as WorkflowDiff['commands'] }
const rows: PreviewRow[] = [
  { id: 'plan', kind: 'plan', label: 'Plan', stops: true, says: 'you approve the plan before any edit' },
  { id: 'build', kind: 'work', label: 'Build', stops: false, says: 'no stop' }
]
const view = (over: object = {}) => ({ diff: same, stale: false, skills: {}, commands: [], ...over })

describe('what the review drawer counts', () => {
  it('counts nothing for a draft that matches the saved one', () => {
    expect(reviewSummary(view(), rows)).toEqual({ changes: 0, stops: 1, notes: 0, marks: {} })
  })
  it('counts each difference once and marks the steps that are new or changed', () => {
    const diff: WorkflowDiff = { ...same, same: false, name: { from: 'a', to: 'b' }, added: [{ id: 'smoke', name: 'Smoke test', kind: 'work', after: 'Tag' }], changed: [{ id: 'poster', name: 'Poster', fields: ['optional'] }] as WorkflowDiff['changed'], removed: [{ id: 'old', name: 'Old', kind: 'work' }], reordered: true }
    expect(reviewSummary(view({ diff }), rows)).toMatchObject({ changes: 5, marks: { smoke: 'new', poster: 'changed' } })
  })
  it('a new workflow has no changes to count: it is new as a whole', () => {
    expect(reviewSummary(view({ diff: { ...same, same: false, isNew: true, added: [{ id: 'x', name: 'X', kind: 'work' }] } }), rows)).toMatchObject({ changes: 0, marks: {} })
  })
  it('counts notes: a stale draft, skills not enabled, and commands', () => {
    expect(reviewSummary(view({ stale: true, skills: { tdd: 'granted', ponytail: 'ready' }, commands: [{ text: 'npm test' }] }), rows).notes).toBe(3)
    expect(reviewSummary(view({ skills: { tdd: 'ready', x: 'gone' } }), rows).notes).toBe(0)
  })
})

describe('where the draft asks the person', () => {
  it('lists only the steps that stop, with what happens there', () => {
    expect(askRows(rows)).toEqual([{ id: 'plan', label: 'Plan', says: 'you approve the plan before any edit' }])
    expect(askRows([rows[1]!])).toEqual([])
  })
})
