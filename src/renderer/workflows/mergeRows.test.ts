import { describe, expect, it } from 'vitest'
import type { MergeCheck } from '../../shared/mergeCheck'
import { mergeRows } from './mergeRows'

const base: MergeCheck = { run: { id: 'r1', title: 'Add a toggle' }, plan: 'approved', planned: { goal: 'Add a toggle.', outOfScope: [] }, commits: 2, flagged: 0, audit: { state: 'done', findings: [], files: 3, lines: 40, truncated: false }, checks: [], blocking: [], notes: [] }

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

  it('a step the person has not approved is a cross in the server\'s words, after the plan and audit rows, and a workflow with no audit step says so', () => {
    const held: MergeCheck = { ...base, plan: 'waiting', audit: { state: 'done', findings: [{ kind: 'out-of-scope', text: 'x', seen: false }], files: 1, lines: 5, truncated: false }, blocking: ['The plan is still waiting for your approval.', '1 audit finding has not been seen.', '"Your review" has not been approved.'] }
    expect(mergeRows(held)).toEqual([
      { ok: false, text: 'The plan is still waiting for your approval.' },
      { ok: false, text: '1 audit finding has not been seen.' },
      { ok: false, text: '"Your review" has not been approved.' }
    ])
    expect(mergeRows({ ...base, audit: { state: 'off', reason: 'workflow' }, blocking: ['"Your review" has not been approved.'] })).toEqual([
      { ok: true, text: 'Plan approved' },
      { ok: null, text: 'This workflow has no audit step.' },
      { ok: false, text: '"Your review" has not been approved.' }
    ])
  })

  it('a check that passed is a tick with how long it took, a skipped one a plain line, one that holds landing a cross in the server\'s words, and one that only reports is a plain line', () => {
    const checks = [
      { id: 'a', name: 'Tests pass', run: 'npm test', state: 'passed' as const, ms: 12_400 },
      { id: 'b', name: 'Type check', run: 'tsc', state: 'skipped' as const },
      { id: 'c', name: 'Lint', run: 'npm run lint', state: 'failed' as const, tries: 3, ms: 900 },
      { id: 'd', name: 'Slow suite', run: 'make slow', state: 'running' as const, tries: 1, ms: 5000 }
    ]
    expect(mergeRows({ ...base, checks, blocking: ['"Lint" failed after 3 tries.'] })).toEqual([
      { ok: true, text: 'Plan approved' },
      { ok: true, text: 'Audit found nothing' },
      { ok: true, text: 'Tests pass: npm test passed (12 s)' },
      { ok: null, text: 'Type check: skipped' },
      { ok: null, text: 'Slow suite: has not passed yet (it only reports, so it does not hold landing)' },
      { ok: false, text: '"Lint" failed after 3 tries.' }
    ])
  })
})
