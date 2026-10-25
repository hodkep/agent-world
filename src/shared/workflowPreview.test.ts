import { describe, expect, it } from 'vitest'
import type { Workflow } from './workflow'
import { STANDARD } from './workflow'
import { previewOf, stopsLine } from './workflowPreview'

const on = { planGate: true, mergeGate: true }
const off = { planGate: false, mergeGate: false }
const wf = (steps: Workflow['steps']): Workflow => ({ version: 1, id: 'x', name: 'X', steps })

describe('what a workflow will ask of the person, step by step', () => {
  it('says for the built-in Standard: the plan is approved before any edit, the audit is looked at, and the push is held until both are met', () => {
    const rows = previewOf(STANDARD, on)
    expect(rows.map((r) => `${r.label}: ${r.says}`)).toEqual([
      'Plan: you approve the plan before any edit',
      'Build: no stop',
      'Audit: you look at the findings',
      'Pull request: the push is held until the plan is approved and the findings are seen'
    ])
    expect(rows.map((r) => r.stops)).toEqual([true, false, true, true])
  })

  it('follows the Settings switches for a step that names no gate, and a step\'s own gate wins over them', () => {
    const steps: Workflow['steps'] = [{ id: 'plan', kind: 'plan' }, { id: 'pr', kind: 'pr' }]
    expect(previewOf(wf(steps), off).map((r) => r.stops)).toEqual([false, false])
    expect(previewOf(wf(steps), off)[0]!.says).toBe('the agent writes a plan; nothing waits for you')
    expect(previewOf(wf(steps), off)[1]!.says).toBe('nothing is held: the run ends when the branch is pushed')
    expect(previewOf(wf([{ id: 'plan', kind: 'plan', gate: 'approve' }, { id: 'pr', kind: 'pr', gate: 'approve' }]), off).map((r) => r.stops)).toEqual([true, true])
    expect(previewOf(wf([{ id: 'plan', kind: 'plan', gate: 'auto' }, { id: 'pr', kind: 'pr', gate: 'auto' }]), on).map((r) => r.stops)).toEqual([false, false])
  })

  it('names a check\'s command, how many tries it gets, and whether it must pass or only reports', () => {
    const [must, only] = previewOf(wf([{ id: 'tests', kind: 'check', name: 'Tests pass', run: 'npm test', gate: 'pass', retries: 3 }, { id: 'lint', kind: 'check', run: 'npm run lint', gate: 'auto' }]), on)
    expect(must).toMatchObject({ label: 'Tests pass', says: 'the app runs `npm test` (you approve the command once), up to 4 tries, and it must pass', stops: true })
    expect(only).toMatchObject({ label: 'Check', says: 'the app runs `npm run lint` (you approve the command once), up to 3 tries, and it only reports', stops: false })
  })

  it('says a build you approve, your own approval step, a merge step, and a step with no name by its kind', () => {
    const rows = previewOf(wf([{ id: 'a', kind: 'work', gate: 'approve' }, { id: 'ok', kind: 'approve', name: 'Your review' }, { id: 'land', kind: 'merge' }]), on)
    expect(rows.map((r) => `${r.label}: ${r.says}`)).toEqual([
      'Build: you approve it when the agent says it is done',
      'Your review: you approve it or send it back',
      'Land: the merge into the base branch is held until the plan is approved and the findings are seen'
    ])
  })

  it('counts where the person stops, in one line', () => {
    expect(stopsLine(previewOf(STANDARD, on))).toBe('You stop at 3 of 4 steps.')
    expect(stopsLine(previewOf(wf([{ id: 'a', kind: 'work' }]), on))).toBe('Nothing waits for you.')
    expect(stopsLine(previewOf(wf([{ id: 'ok', kind: 'approve' }]), on))).toBe('You stop at 1 step.')
    expect(previewOf(wf([]), on)).toEqual([])
  })
})

describe('a step that starts when you press Run', () => {
  it('says so, and stops there, for a check, an audit and a pull request', () => {
    const rows = previewOf(wf([{ id: 'tests', kind: 'check', run: 'npm test', start: 'run' }, { id: 'review', kind: 'audit', start: 'run' }, { id: 'pr', kind: 'pr', start: 'run' }]), off)
    expect(rows.map((r) => r.stops)).toEqual([true, true, true])
    expect(rows[0]!.says).toBe('you press Run, then the app runs `npm test` (you approve the command once), up to 3 tries, and it only reports')
    expect(rows[1]!.says).toBe('you press Run, then you look at the findings')
    expect(rows[2]!.says).toBe('you press Run, then the agent pushes the branch and opens the pull request')
  })
  it('is unchanged for the same steps that start by themselves', () => {
    const rows = previewOf(wf([{ id: 'review', kind: 'audit', start: 'auto' }]), on)
    expect(rows[0]!.says).toBe('you look at the findings')
  })
})


describe('the settings every step can have, in what the person will meet', () => {
  it('a check you approve says so, and stops there', () => {
    const [row] = previewOf(wf([{ id: 'tests', kind: 'check', name: 'Tests', run: 'npm test', gate: 'approve' }]), off)
    expect(row!.says).toBe('the app runs `npm test` (you approve the command once), up to 3 tries, it must pass, and then you approve it')
    expect(row!.stops).toBe(true)
  })
  it('an optional step says you can skip it', () => {
    const rows = previewOf(wf([{ id: 'a', kind: 'work', optional: true }, { id: 'b', kind: 'approve', optional: true }, { id: 'c', kind: 'audit', optional: true }]), off)
    expect(rows.map((r) => r.says)).toEqual(['no stop (optional: you can skip it)', 'you approve it or send it back (optional: you can skip it)', 'you look at the findings (optional: you can skip it)'])
  })
  it('a plan or a pull request with skills says nothing more: the agent reads them', () => {
    const rows = previewOf(wf([{ id: 'plan', kind: 'plan', gate: 'approve', skills: ['tdd'] }]), off)
    expect(rows[0]!.says).toBe('you approve the plan before any edit')
  })
})
