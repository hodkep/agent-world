import { describe, expect, it } from 'vitest'
import type { MergeCheck } from '../../shared/mergeCheck'
import { mergeRows } from './mergeRows'

const base: MergeCheck = { run: { id: 'r1', title: 'Add a toggle' }, plan: 'approved', planned: { goal: 'Add a toggle.', outOfScope: [] }, commits: 2, flagged: 0, audit: { state: 'done', findings: [], files: 3, lines: 40, truncated: false }, blocking: [], notes: [] }

describe('the rows the Finish checklist gets from the merge check', () => {
  it('passed checks are ticks: the plan approved and an audit that found nothing', () => {
    expect(mergeRows(base)).toEqual([
      { ok: true, text: 'Plan approved' },
      { ok: true, text: 'Audit found nothing' }
    ])
  })

  it('what holds Land back is a cross, in the words the server gave, and unseen findings replace the audit tick', () => {
    const held: MergeCheck = { ...base, plan: 'waiting', audit: { state: 'done', findings: [{ kind: 'out-of-scope', text: 'x', seen: false }, { kind: 'guess-wrong', text: 'y', seen: true }], files: 1, lines: 5, truncated: false }, blocking: ['The plan is still waiting for your approval.', '1 audit finding has not been seen.'] }
    expect(mergeRows(held)).toEqual([
      { ok: false, text: 'The plan is still waiting for your approval.' },
      { ok: false, text: '1 audit finding has not been seen.' }
    ])
  })

  it('seen findings are a tick that says how many; a running, failed or switched-off audit and every note are plain rows that never hold Land', () => {
    const seen: MergeCheck = { ...base, plan: 'released', audit: { state: 'done', findings: [{ kind: 'out-of-scope', text: 'x', seen: true }], files: 1, lines: 5, truncated: false }, notes: ['1 commit was made outside the task.'] }
    expect(mergeRows(seen)).toEqual([
      { ok: true, text: 'Plan hold lifted without approval' },
      { ok: true, text: 'Audit: 1 finding, all seen' },
      { ok: null, text: '1 commit was made outside the task.' }
    ])
    expect(mergeRows({ ...base, audit: { state: 'not-run' } })).toEqual([{ ok: true, text: 'Plan approved' }])
    expect(mergeRows({ ...base, audit: { state: 'running' } }).at(-1)).toEqual({ ok: null, text: 'Auditing the branch against the plan…' })
    expect(mergeRows({ ...base, audit: { state: 'failed', reason: 'claude timed out' } }).at(-1)).toEqual({ ok: null, text: 'Audit failed: claude timed out. Land is not held for this.' })
    expect(mergeRows({ ...base, audit: { state: 'off', reason: 'economy' } }).at(-1)).toEqual({ ok: null, text: 'Audit is off at the economy dial.' })
    expect(mergeRows({ ...base, audit: { state: 'off', reason: 'provider' } }).at(-1)).toEqual({ ok: null, text: 'Audit is not available for this program.' })
    expect(mergeRows({ ...base, plan: 'not-needed', audit: { state: 'off', reason: 'no-plan' } })).toEqual([])
  })
})
