import { describe, expect, it } from 'vitest'
import { type RunEvent, type RunWorkflow, reduceRuns } from './runs'
import type { StepContext } from './steps'
import { waitWord, waitsForPerson } from './waits'

const STANDARD: RunWorkflow = { id: 'standard', name: 'Standard', steps: [{ id: 'plan', kind: 'plan', name: 'Plan' }, { id: 'build', kind: 'work', name: 'Build' }, { id: 'review', kind: 'audit', name: 'Audit' }, { id: 'land', kind: 'merge', name: 'Land' }] }
const CHECKED: RunWorkflow = { id: 'c', name: 'C', steps: [{ id: 'build', kind: 'work', name: 'Build' }, { id: 'tests', kind: 'check', name: 'Tests', run: 'pnpm test' }, { id: 'ok', kind: 'approve', name: 'Your review' }, { id: 'land', kind: 'merge', name: 'Land' }] }
const begin = (workflow: RunWorkflow, agent = 'a1', run = 'r1'): RunEvent => ({ k: 'begin', t: 100, run, agent, name: 'ada', project: '/p', title: 'Task', workflow })
const readback = { goal: 'g', assumptions: [], outOfScope: [], questions: [] }
const submitted: RunEvent = { k: 'plan', t: 200, run: 'r1', round: 1, state: 'submitted', path: 'p.md', readback }
const released: RunEvent = { k: 'plan', t: 200, run: 'r1', round: 1, state: 'released' }
const built: RunEvent = { k: 'step', t: 400, run: 'r1', round: 1, step: 'build', state: 'done' }
const audit = (seen = false): RunEvent[] => [{ k: 'audit', t: 500, run: 'r1', head: 'h1', state: 'done', findings: [{ kind: 'out-of-scope', text: 'x' }], files: 1, lines: 4, truncated: false }, ...(seen ? [{ k: 'seen', t: 520, run: 'r1', head: 'h1', which: [0] } as RunEvent] : [])]
const kinds = (events: RunEvent[], holds: { agentId: string; declined: boolean }[] = [], ctx: StepContext = { auditOn: true }) => waitsForPerson(reduceRuns(events), () => ctx, holds).map((w) => `${w.agentId}:${w.kind}`)

describe('what waits for the person, per agent', () => {
  it('a plan handed in', () => {
    expect(kinds([begin(STANDARD), submitted])).toEqual(['a1:plan'])
  })
  it('check commands nobody approved yet, and a check that gave up', () => {
    expect(kinds([begin(CHECKED), built], [], { auditOn: true, approved: false })).toEqual(['a1:check'])
  })
  it('a step the person approves', () => {
    expect(kinds([begin(CHECKED), { k: 'step', t: 400, run: 'r1', round: 1, step: 'build', state: 'done' }, { k: 'check', t: 410, run: 'r1', round: 1, step: 'tests', head: 'h', attempt: 1, ok: true, exit: 0, timedOut: false, ms: 5, tail: '' }])).toEqual(['a1:approve'])
  })
  it('audit findings not seen yet, and then Land once they are', () => {
    expect(kinds([begin(STANDARD), released, built, ...audit()])).toEqual(['a1:audit'])
    expect(kinds([begin(STANDARD), released, built, ...audit(true)])).toEqual(['a1:land'])
  })
  it('Land is also what waits when the audit is off, or failed, once the build is done', () => {
    expect(kinds([begin(STANDARD), released, built], [], { auditOn: false })).toEqual(['a1:land'])
  })
  it('nothing while the agent is still working, after landing, or in a stopped run', () => {
    expect(kinds([begin(STANDARD), released])).toEqual([])
    expect(kinds([begin(STANDARD), released, built, ...audit(true), { k: 'merge', t: 600, run: 'r1', head: 'h1', how: 'checked', held: [] }])).toEqual([])
    expect(kinds([begin(STANDARD), submitted, { k: 'stop', t: 300, run: 'r1' } as RunEvent])).toEqual([])
  })
  it('a merge git is holding for the person is a Land wait, once, unless the person said not yet', () => {
    expect(kinds([begin(STANDARD), released], [{ agentId: 'a1', declined: false }])).toEqual(['a1:land'])
    expect(kinds([begin(STANDARD), released, built], [{ agentId: 'a1', declined: false }])).toEqual(['a1:land'])
    expect(kinds([begin(STANDARD), released], [{ agentId: 'a1', declined: true }])).toEqual([])
  })
  it('says what is asked in one word', () => {
    expect(['plan', 'approve', 'check', 'audit', 'land'].map((k) => waitWord(k as never))).toEqual(['plan', 'approve', 'check?', 'audit', 'land'])
  })
})
