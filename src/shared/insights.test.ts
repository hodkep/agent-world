import { describe, expect, it } from 'vitest'
import { columnRates, gateTiles, headline, runBar } from './insights'
import { type RunEvent, type RunWorkflow, reduceRuns } from './runs'

const MIN = 60_000
const ctx = { auditOn: true }
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
const QUICK: RunWorkflow = { id: 'quick-change', name: 'Quick change', steps: [{ id: 'quick', kind: 'work', name: 'Build' }, { id: 'land', kind: 'merge', name: 'Land', gate: 'auto' }] }
const REVIEWED: RunWorkflow = { id: 'reviewed', name: 'Reviewed', steps: [{ id: 'fix', kind: 'work', name: 'Fix' }, { id: 'ok', kind: 'approve', name: 'Your review', gate: 'approve' }, { id: 'land', kind: 'merge', name: 'Land', gate: 'auto' }] }
const readback = { goal: 'g', assumptions: [], outOfScope: [], questions: [] }

const begin = (t = 0, wf: RunWorkflow | null = JOURNEY, extra: object = {}, run = 'r1'): RunEvent => ({ k: 'begin', t, run, agent: 'a1', name: 'ada', project: '/p', title: 'Add wordCount', ...(wf && { workflow: wf }), ...extra }) as RunEvent
const plan = (t: number, state: 'submitted' | 'approved' | 'changes' | 'released', run = 'r1'): RunEvent => (state === 'submitted' ? { k: 'plan', t, run, round: 1, state, path: 'p.md', readback } : { k: 'plan', t, run, round: 1, state })
const check = (t: number, attempt: number, ok: boolean, ms = 1000, run = 'r1'): RunEvent => ({ k: 'check', t, run, round: 1, step: 'tests', head: `h${attempt}`, attempt, ok, exit: ok ? 0 : 1, timedOut: false, ms, tail: '' })
const stepDone = (t: number, step: string, run = 'r1'): RunEvent => ({ k: 'step', t, run, round: 1, step, state: 'done' })
const audit = (t: number, findings: { kind: 'out-of-scope'; text: string }[] = [], run = 'r1'): RunEvent => ({ k: 'audit', t, run, head: 'h1', state: 'done', findings, files: 1, lines: 1, truncated: false })
const seen = (t: number, which: number[], run = 'r1'): RunEvent => ({ k: 'seen', t, run, head: 'h1', which })
const merge = (t: number, how: 'checked' | 'anyway', run = 'r1'): RunEvent => ({ k: 'merge', t, run, head: 'h1', how, held: how === 'anyway' ? ['review'] : [] })
const done = (t: number, run = 'r1'): RunEvent => ({ k: 'done', t, run })
const run = (events: RunEvent[]) => reduceRuns(events)[0]!
const finding = { kind: 'out-of-scope' as const, text: 'Renamed a token.' }

describe('where a run\'s time went', () => {
  it('is the time in the order it happened: the agent working, the person waited on, the checks and what failed', () => {
    const r = run([begin(), plan(3 * MIN, 'submitted'), plan(7 * MIN, 'approved'), stepDone(50 * MIN, 'build'), check(51 * MIN, 1, false, 3000), check(60 * MIN, 2, true, 2000), audit(61 * MIN), merge(62 * MIN, 'checked'), done(62 * MIN)])
    const bar = runBar(r, 100 * MIN)!
    expect(bar.totalMs).toBe(62 * MIN)
    expect(bar.segments).toEqual([
      { kind: 'work', ms: 3 * MIN },
      { kind: 'you', ms: 4 * MIN },
      { kind: 'work', ms: 51 * MIN - 3000 - 7 * MIN },
      { kind: 'fail', ms: 3000 },
      { kind: 'work', ms: 60 * MIN - 2000 - 51 * MIN },
      { kind: 'check', ms: 2000 },
      { kind: 'work', ms: 2 * MIN }
    ])
    expect(bar.marks).toEqual([{ kind: 'review', at: 61 * MIN }, { kind: 'landed', at: 62 * MIN }])
    expect(bar.waiting).toBe(false)
  })

  it('shows a plan still waiting as an open stretch of waiting on the person', () => {
    const bar = runBar(run([begin(), plan(5 * MIN, 'submitted')]), 26 * MIN)!
    expect(bar.segments).toEqual([{ kind: 'work', ms: 5 * MIN }, { kind: 'you', ms: 21 * MIN }])
    expect(bar.totalMs).toBe(26 * MIN)
    expect(bar.waiting).toBe(true)
  })

  it('draws the waits together, ending where the plan was approved, when it was sent back first', () => {
    const r = run([begin(), plan(2 * MIN, 'submitted'), plan(6 * MIN, 'changes'), plan(8 * MIN, 'submitted'), plan(11 * MIN, 'approved'), done(20 * MIN)])
    const bar = runBar(r, 99 * MIN)!
    expect(bar.segments).toEqual([{ kind: 'work', ms: 4 * MIN }, { kind: 'you', ms: 7 * MIN }, { kind: 'work', ms: 9 * MIN }])
  })

  it('marks where the person lifted the hold without approving, and counts the wait up to then', () => {
    const bar = runBar(run([begin(), plan(2 * MIN, 'submitted'), plan(30 * MIN, 'released'), done(40 * MIN)]), 99 * MIN)!
    expect(bar.segments).toEqual([{ kind: 'work', ms: 2 * MIN }, { kind: 'you', ms: 28 * MIN }, { kind: 'work', ms: 10 * MIN }])
    expect(bar.marks).toContainEqual({ kind: 'lifted', at: 30 * MIN })
  })

  it('counts the time a step the person approves waited, from the work before it to their answer, and while it still waits', () => {
    const fixed: RunEvent = { k: 'step', t: 10 * MIN, run: 'r1', round: 1, step: 'fix', state: 'done' }
    const approved: RunEvent = { k: 'step', t: 25 * MIN, run: 'r1', round: 1, step: 'ok', state: 'approved' }
    const bar = runBar(run([begin(0, REVIEWED), fixed, approved, done(30 * MIN)]), 99 * MIN)!
    expect(bar.segments).toEqual([{ kind: 'work', ms: 10 * MIN }, { kind: 'you', ms: 15 * MIN }, { kind: 'work', ms: 5 * MIN }])
    const open = runBar(run([begin(0, REVIEWED), fixed]), 40 * MIN)!
    expect(open.segments).toEqual([{ kind: 'work', ms: 10 * MIN }, { kind: 'you', ms: 30 * MIN }])
    expect(open.waiting).toBe(true)
  })

  it('has no times for a run the app started from a commit, which was never announced', () => {
    expect(runBar(run([begin(0, null, { auto: true }), done(0)]), 99 * MIN)).toBeUndefined()
  })

  it('draws a follow-up round after the first, without the gap between them, and marks where it starts', () => {
    const r = run([begin(), done(10 * MIN), { k: 'round', t: 20 * MIN, run: 'r1' }, done(30 * MIN)])
    const bar = runBar(r, 99 * MIN)!
    expect(bar.totalMs).toBe(20 * MIN)
    expect(bar.segments).toEqual([{ kind: 'work', ms: 20 * MIN }])
    expect(bar.marks).toEqual([{ kind: 'round', at: 10 * MIN }])
  })
})

describe('which gates a run met', () => {
  const tiles = (events: RunEvent[]) => gateTiles(run(events), ctx).map((t) => `${t.gate}:${t.kind}${t.tries ? t.tries : ''}`)

  it('are all met, first time, for a run that did everything the workflow asked', () => {
    expect(tiles([begin(), plan(1 * MIN, 'submitted'), plan(2 * MIN, 'approved'), stepDone(5 * MIN, 'build'), check(6 * MIN, 1, true), audit(7 * MIN), merge(8 * MIN, 'checked'), done(8 * MIN)])).toEqual(['plan:ok', 'check:ok', 'review:ok', 'land:ok', 'told:ok'])
  })

  it('are met with trouble when a plan was sent back, a check was retried, or the review found things the person saw', () => {
    const events = [begin(), plan(1 * MIN, 'submitted'), plan(2 * MIN, 'changes'), plan(3 * MIN, 'submitted'), plan(4 * MIN, 'approved'), stepDone(5 * MIN, 'build'), check(6 * MIN, 1, false), check(7 * MIN, 2, true), audit(8 * MIN, [finding]), seen(9 * MIN, [0]), merge(10 * MIN, 'checked'), done(10 * MIN)]
    expect(tiles(events)).toEqual(['plan:trouble', 'check:trouble1', 'review:trouble', 'land:ok', 'told:ok'])
  })

  it('are missed or overridden when the hold was lifted, a check was skipped, a finding was never seen, or landing went ahead anyway', () => {
    const skip: RunEvent = { k: 'step', t: 9 * MIN, run: 'r1', round: 1, step: 'tests', state: 'skipped' }
    const events = [begin(), plan(1 * MIN, 'submitted'), plan(2 * MIN, 'released'), stepDone(5 * MIN, 'build'), check(6 * MIN, 1, false), check(7 * MIN, 2, false), check(8 * MIN, 3, false), skip, audit(10 * MIN, [finding]), merge(11 * MIN, 'anyway'), done(11 * MIN)]
    expect(tiles(events)).toEqual(['plan:bad', 'check:bad', 'review:bad', 'land:bad', 'told:ok'])
  })

  it('are waiting where the run is held for the person, and not asked of what has not come yet', () => {
    expect(tiles([begin(), plan(1 * MIN, 'submitted')])).toEqual(['plan:wait', 'check:na', 'review:na', 'land:na', 'told:ok'])
    expect(tiles([begin(), plan(1 * MIN, 'submitted'), plan(2 * MIN, 'approved'), stepDone(5 * MIN, 'build'), check(6 * MIN, 1, true), done(7 * MIN)])).toEqual(['plan:ok', 'check:ok', 'review:na', 'land:wait', 'told:ok'])
  })

  it('leave out the gates a workflow does not have, and say a run began from a commit as a missed announcement', () => {
    expect(tiles([begin(0, QUICK), stepDone(1 * MIN, 'quick'), merge(2 * MIN, 'checked'), done(2 * MIN)])).toEqual(['plan:na', 'check:na', 'review:na', 'land:ok', 'told:ok'])
    expect(tiles([begin(0, null, { auto: true }), done(0)])).toEqual(['plan:na', 'check:na', 'review:na', 'land:na', 'told:bad'])
  })

  it('count a review that found nothing as met, and one that could not run as not asked', () => {
    expect(tiles([begin(), audit(7 * MIN), merge(8 * MIN, 'checked'), done(8 * MIN)])[2]).toBe('review:ok')
    const failed: RunEvent = { k: 'audit', t: 7 * MIN, run: 'r1', head: 'h1', state: 'failed', reason: 'no model' }
    expect(tiles([begin(), failed, done(8 * MIN)])[2]).toBe('review:na')
  })
})

describe('the numbers over a set of runs', () => {
  const rows = (...evs: RunEvent[][]) => evs.map((e) => run(e))
  const clean = [begin(0, JOURNEY, {}, 'a'), plan(1 * MIN, 'submitted', 'a'), plan(2 * MIN, 'approved', 'a'), stepDone(5 * MIN, 'build', 'a'), check(6 * MIN, 1, true, 1000, 'a'), audit(7 * MIN, [], 'a'), merge(8 * MIN, 'checked', 'a'), done(8 * MIN, 'a')]
  const trouble = [begin(0, JOURNEY, {}, 'b'), plan(1 * MIN, 'submitted', 'b'), plan(2 * MIN, 'changes', 'b'), plan(3 * MIN, 'submitted', 'b'), plan(5 * MIN, 'approved', 'b'), stepDone(6 * MIN, 'build', 'b'), check(7 * MIN, 1, false, 1000, 'b'), check(8 * MIN, 2, true, 1000, 'b'), audit(9 * MIN, [finding], 'b'), seen(10 * MIN, [0], 'b'), merge(11 * MIN, 'checked', 'b'), done(11 * MIN, 'b')]
  const anyway = [begin(0, JOURNEY, {}, 'c'), plan(1 * MIN, 'submitted', 'c'), plan(2 * MIN, 'released', 'c'), stepDone(5 * MIN, 'build', 'c'), check(6 * MIN, 1, true, 1000, 'c'), audit(7 * MIN, [finding], 'c'), merge(8 * MIN, 'anyway', 'c'), done(8 * MIN, 'c')]
  const fromCommit = [begin(0, null, { auto: true }, 'd'), done(0, 'd')]
  const open = [begin(0, JOURNEY, {}, 'e'), plan(5 * MIN, 'submitted', 'e')]
  const all = rows(clean, trouble, anyway, fromCommit, open)
  const tilesOf = (r: ReturnType<typeof run>) => gateTiles(r, ctx)

  it('count, for each gate, how often it was met as asked, out of how often it was asked and decided', () => {
    const rates = columnRates(all.map(tilesOf))
    expect(rates.plan).toEqual({ good: 1, of: 3 })
    expect(rates.check).toEqual({ good: 2, of: 3 })
    expect(rates.review).toEqual({ good: 2, of: 3 })
    expect(rates.land).toEqual({ good: 2, of: 3 })
    expect(rates.told).toEqual({ good: 4, of: 5 })
  })

  it('say the week in a few counts: runs, those that met every gate (and with trouble), landed anyway, from a commit, waiting, and the time the person was waited on', () => {
    const h = headline(all, ctx, 100 * MIN)
    expect(h).toMatchObject({ runs: 5, finished: 3, metEvery: 2, withTrouble: 1, landedAnyway: 1, fromCommit: 1, waiting: 1 })
    // clean: 1 min; trouble: 1 + 2 min; anyway: 1 min until the hold was lifted; open: 95 min still waiting.
    expect(h.youMs).toBe((1 + 3 + 1 + 95) * MIN)
  })
})
