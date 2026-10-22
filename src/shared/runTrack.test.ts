import { describe, expect, it } from 'vitest'
import { type RunEvent, type RunWorkflow, reduceRuns } from './runs'
import { landingPill, trackOf } from './runTrack'

const JOURNEY: RunWorkflow = {
  id: 'journey',
  name: 'Journey',
  steps: [
    { id: 'plan', kind: 'plan', name: 'Plan', gate: 'approve' },
    { id: 'build', kind: 'work', name: 'Build' },
    { id: 'tests', kind: 'check', name: 'Project check', run: 'node check.js', retries: 2 },
    { id: 'review', kind: 'audit', name: 'Review' },
    { id: 'land', kind: 'merge', name: 'Land', gate: 'approve' }
  ]
}
const PULL: RunWorkflow = { id: 'pull', name: 'Pull', steps: [{ id: 'plan', kind: 'plan', name: 'Plan' }, { id: 'build', kind: 'work', name: 'Build' }, { id: 'review', kind: 'audit', name: 'Audit' }, { id: 'pr', kind: 'pr', name: 'Pull request' }] }
const ctx = { auditOn: true }
const readback = { goal: 'g', assumptions: [], outOfScope: [], questions: [] }
const begin: RunEvent = { k: 'begin', t: 100, run: 'r1', agent: 'a1', name: 'ada', project: '/p', title: 'Add wordCount', workflow: JOURNEY }
const submitted = (t = 200): RunEvent => ({ k: 'plan', t, run: 'r1', round: 1, state: 'submitted', path: 'p.md', readback })
const planned = (state: 'approved' | 'changes', t = 300): RunEvent => ({ k: 'plan', t, run: 'r1', round: 1, state })
const done = (step: string, t = 400): RunEvent => ({ k: 'step', t, run: 'r1', round: 1, step, state: 'done' })
const ran = (attempt: number, ok: boolean, t = 500): RunEvent => ({ k: 'check', t, run: 'r1', round: 1, step: 'tests', head: `h${attempt}`, attempt, ok, exit: ok ? 0 : 1, timedOut: false, ms: 900, tail: 'x' })
const track = (events: RunEvent[]) => trackOf(reduceRuns([begin, ...events])[0]!, ctx)
const states = (events: RunEvent[]) => track(events)?.stations.map((s) => `${s.id}:${s.state}`)

describe('where a run is on its track', () => {
  it('stands on the plan while it waits for the person, and says so', () => {
    const t = track([submitted()])!
    expect(t).toMatchObject({ title: 'Add wordCount', workflow: 'Journey', round: 1, at: 0, waiting: 'needs your approval' })
    expect(states([submitted()])).toEqual(['plan:now', 'build:next', 'tests:next', 'review:next', 'land:next'])
  })

  it('moves on when the plan is approved: the plan is done and the agent is building, with nothing waiting on the person', () => {
    const t = track([submitted(), planned('approved')])!
    expect(t.at).toBe(1)
    expect(t.waiting).toBeUndefined()
    expect(states([submitted(), planned('approved')])).toEqual(['plan:done', 'build:now', 'tests:next', 'review:next', 'land:next'])
  })

  it('marks a plan that was sent back before it was approved as done with trouble', () => {
    expect(states([submitted(), planned('changes'), submitted(400), planned('approved', 500)])![0]).toBe('plan:trouble')
  })

  it('keeps the agent on a check that failed and still has tries, and marks it with trouble once it has passed', () => {
    const base = [submitted(), planned('approved'), done('build')]
    expect(states([...base, ran(1, false)])![2]).toBe('tests:now')
    expect(states([...base, ran(1, false), ran(2, true)])![2]).toBe('tests:trouble')
    expect(states([...base, ran(1, true)])![2]).toBe('tests:done')
  })

  it('keeps how often a check failed on its station, while it is retried and after it passed', () => {
    const base = [submitted(), planned('approved'), done('build')]
    expect(track([...base, ran(1, false)])!.stations[2]).toMatchObject({ state: 'now', tries: 1 })
    expect(track([...base, ran(1, false), ran(2, false), ran(3, true)])!.stations[2]).toMatchObject({ state: 'trouble', tries: 2 })
    expect(track([...base, ran(1, true)])!.stations[2]!.tries).toBeUndefined()
  })

  it('says a plan the person sent back is being revised: the agent has it, so nothing waits on the person', () => {
    const t = track([submitted(), planned('changes')])!
    expect(t.at).toBe(0)
    expect(t.waiting).toBeUndefined()
    expect(t.note).toBe('plan sent back: being revised')
    expect(track([submitted(), planned('changes'), submitted(400)])!.note).toBeUndefined()
  })

  it('keeps how often the plan was sent back on its station', () => {
    expect(track([submitted(), planned('changes'), submitted(400), planned('approved', 500)])!.stations[0]).toMatchObject({ state: 'trouble', tries: 1 })
  })

  it('stands on a check that ran out of tries and says it is the person\'s call', () => {
    const t = track([submitted(), planned('approved'), done('build'), ran(1, false), ran(2, false), ran(3, false)])!
    expect(t.stations[2]).toMatchObject({ id: 'tests', state: 'failed' })
    expect(t.at).toBe(2)
    expect(t.waiting).toBe('out of tries: your call')
  })

  it('shows a check the person skipped as skipped, not as met', () => {
    const skip: RunEvent = { k: 'step', t: 600, run: 'r1', round: 1, step: 'tests', state: 'skipped' }
    expect(states([submitted(), planned('approved'), done('build'), ran(1, false), ran(2, false), ran(3, false), skip])![2]).toBe('tests:skipped')
  })

  it('waits for the landing once the work is done, which the person asks the agent for in the chat', () => {
    const work = [submitted(), planned('approved'), done('build'), ran(1, true), { k: 'done', t: 700, run: 'r1' } as RunEvent]
    const t = track(work)!
    expect(t.stations.map((s) => s.state).slice(0, 3)).toEqual(['done', 'done', 'done'])
    expect(t.at).toBe(3)
    expect(t.waiting).toBe('ready to land: ask the agent')
  })

  it('for a pull request workflow, waits for the pull request, which git lets through once the gates are met', () => {
    const run = reduceRuns([{ ...begin, workflow: PULL }, submitted(), planned('approved'), done('build'), { k: 'done', t: 700, run: 'r1' } as RunEvent])[0]!
    const t = trackOf(run, ctx)!
    expect(t.at).toBe(2)
    // The audit has not run yet.
    expect(t.waiting).toBe('waiting for the audit')
  })

  it('says what each landing step waits for by its gate: the person\'s approval, the push that follows it, or the office doing it by itself', () => {
    const audited: RunEvent = { k: 'audit', t: 650, run: 'r1', head: 'h1', state: 'done', findings: [], files: 1, lines: 1, truncated: false }
    const run = (wf: RunWorkflow, extra: RunEvent[] = []) => reduceRuns([{ ...begin, workflow: wf }, submitted(), planned('approved'), done('build'), audited, { k: 'done', t: 700, run: 'r1' } as RunEvent, ...extra])[0]!
    const gated: RunWorkflow = { ...PULL, steps: PULL.steps.map((s) => (s.kind === 'pr' ? { ...s, gate: 'approve' as const } : s)) }
    const approved: RunEvent = { k: 'step', t: 800, run: 'r1', round: 1, step: 'pr', state: 'approved' }
    expect(trackOf(run(gated), ctx)!.waiting).toBe('needs your approval')
    expect(trackOf(run(PULL), { ...ctx, mergeGate: true })!.waiting).toBe('needs your approval')
    expect(trackOf(run(gated, [approved]), ctx)!.waiting).toBe('approved: the agent pushes it')
    expect(trackOf(run(PULL), { ...ctx, mergeGate: false })!.waiting).toBe('audit passed: the agent is told to push')
    // A merge is the person's own click on Land: the bar only says it is ready.
    const merge: RunWorkflow = { ...JOURNEY, steps: JOURNEY.steps.filter((x) => x.kind !== 'check') }
    expect(trackOf(run(merge), ctx)!.waiting).toBe('ready to land: ask the agent')
  })

  it('has a pill for a push git held, not a land', () => {
    expect(landingPill({ declined: false }, 'pr')).toEqual({ kind: 'held', text: 'Push held' })
    expect(landingPill({ declined: true }, 'pr')).toEqual({ kind: 'notyet', text: 'Push held · not yet' })
    expect(landingPill({ declined: false })).toEqual({ kind: 'held', text: 'Land held' })
  })

  it('has no track for a run that landed, was stopped, follows no workflow, or has nothing left to do', () => {
    const landed: RunEvent[] = [submitted(), planned('approved'), done('build'), ran(1, true), { k: 'audit', t: 600, run: 'r1', head: 'h1', state: 'done', findings: [], files: 1, lines: 2, truncated: false }, { k: 'merge', t: 700, run: 'r1', head: 'h1', how: 'checked', held: [] }, { k: 'done', t: 710, run: 'r1' }]
    expect(track(landed)).toBeUndefined()
    expect(track([submitted(), { k: 'stop', t: 300, run: 'r1' }])).toBeUndefined()
    const plain = reduceRuns([{ ...begin, workflow: undefined }])[0]!
    expect(trackOf(plain, ctx)).toBeUndefined()
  })
})

describe('the marker that a merge was held', () => {
  it('says the merge is held, and stays with the person\'s answer not yet while the band is put away', () => {
    expect(landingPill({ declined: false })).toEqual({ kind: 'held', text: 'Land held' })
    expect(landingPill({ declined: true })).toEqual({ kind: 'notyet', text: 'Land held · not yet' })
  })
  it('is nothing when no merge was held', () => {
    expect(landingPill(undefined)).toBeNull()
  })
})
