import { describe, expect, it } from 'vitest'
import { type Tile, type TileKind, columnRates, todoChips, GROUP_STANDS, groupKeyOf, groupRuns, invocations, ledgerRow, ledgerTotals, stageCounts, stepCounts, stepLines, stepMatrix, stepSummary, gateTiles, headline, runBar, runVerdict, runsWithin, says, timelineOf, weekDays } from './insights'
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

  it('count a pull request step as the landing: met when the push went through, waiting while the run is done and it has not', () => {
    const PULL: RunWorkflow = { id: 'pull', name: 'Pull', steps: [{ id: 'plan', kind: 'plan', name: 'Plan' }, { id: 'build', kind: 'work', name: 'Build' }, { id: 'review', kind: 'audit', name: 'Audit' }, { id: 'pr', kind: 'pr', name: 'Pull request' }] }
    const base = [begin(0, PULL), plan(1 * MIN, 'submitted'), plan(2 * MIN, 'approved'), stepDone(5 * MIN, 'build'), audit(7 * MIN)]
    expect(tiles([...base, merge(8 * MIN, 'checked'), done(8 * MIN)])[3]).toBe('land:ok')
    expect(tiles([...base, done(8 * MIN)])[3]).toBe('land:wait')
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

  it('are judged on the latest round that has anything logged, so a follow-up round that has not run its checks yet does not undo the first round\'s', () => {
    const events = [begin(), plan(1 * MIN, 'submitted'), plan(2 * MIN, 'approved'), stepDone(5 * MIN, 'build'), check(6 * MIN, 1, true), done(7 * MIN), { k: 'round', t: 20 * MIN, run: 'r1' } as RunEvent, { k: 'commit', t: 21 * MIN, run: 'r1', sha: 'abc', subject: 'fix' } as RunEvent, done(22 * MIN)]
    expect(tiles(events).slice(0, 2)).toEqual(['plan:ok', 'check:ok'])
  })

  it('say a review set aside with findings unseen in the run\'s own words', () => {
    const aside: RunEvent = { k: 'step', t: 8 * MIN, run: 'r1', round: 1, step: 'review', state: 'skipped' }
    const line = timelineOf(run([begin(), audit(7 * MIN, [finding, finding]), aside, done(9 * MIN)]), 99 * MIN).find((e) => /^You set the review aside/.test(e.text))
    expect(line).toMatchObject({ kind: 'bad', text: 'You set the review aside with 2 things not looked at: “Renamed a token.”' })
  })

  it('count a review the person set aside, with findings they never looked at, as not followed, and one set aside after seeing them as it was', () => {
    const aside = (t: number): RunEvent => ({ k: 'step', t, run: 'r1', round: 1, step: 'review', state: 'skipped' })
    expect(tiles([begin(), audit(7 * MIN, [finding]), aside(8 * MIN), done(9 * MIN)])[2]).toBe('review:bad')
    expect(tiles([begin(), audit(7 * MIN, [finding]), seen(7.5 * MIN, [0]), aside(8 * MIN), done(9 * MIN)])[2]).toBe('review:trouble')
    expect(tiles([begin(), audit(7 * MIN, [finding]), aside(8 * MIN), { k: 'step', t: 8.5 * MIN, run: 'r1', round: 1, step: 'review', state: 'rerun' } as RunEvent, done(9 * MIN)])[2]).toBe('review:bad')
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
    const h = headline(all, () => ctx, 100 * MIN)
    expect(h).toMatchObject({ runs: 5, finished: 3, metEvery: 2, withTrouble: 1, landedAnyway: 1, fromCommit: 1, waiting: 1 })
    // clean: 1 min; trouble: 1 + 2 min; anyway: 1 min until the hold was lifted; open: 95 min still waiting.
    expect(h.youMs).toBe((1 + 3 + 1 + 95) * MIN)
  })
})

describe('the count on a tile that met its gate with trouble', () => {
  it('is how often the plan was sent back, the check failed, or the review found things', () => {
    const events = [begin(), plan(1 * MIN, 'submitted'), plan(2 * MIN, 'changes'), plan(3 * MIN, 'submitted'), plan(4 * MIN, 'approved'), stepDone(5 * MIN, 'build'), check(6 * MIN, 1, false), check(7 * MIN, 2, false), check(8 * MIN, 3, true), audit(9 * MIN, [finding, finding]), seen(10 * MIN, [0, 1]), merge(11 * MIN, 'checked'), done(11 * MIN)]
    expect(gateTiles(run(events), ctx).map((t) => t.n)).toEqual([1, 2, 2, undefined, undefined])
  })
})

describe('what stands out in a grid of runs', () => {
  const row = (title: string, kinds: string[]) => ({ title, tiles: (['plan', 'check', 'review', 'land', 'told'] as const).map((gate, i) => ({ gate, kind: kinds[i] as 'ok' })) })
  it('names the red row and what went wrong in it, and the amber column with what it may mean', () => {
    const rows = [row('Add titleCase', ['ok', 'ok', 'na', 'na', 'ok']), row('Billing export', ['bad', 'trouble', 'bad', 'bad', 'ok']), row('Fix login', ['na', 'ok', 'na', 'ok', 'ok']), row('Add wordCount', ['trouble', 'ok', 'ok', 'ok', 'ok']), row('Dark mode', ['ok', 'trouble', 'trouble', 'ok', 'ok'])]
    expect(says(rows)).toEqual([
      'Billing export is the red row: the plan hold was lifted, a finding was not seen, it landed anyway.',
      'Check is the amber column: 2 of 5 runs needed more than one try. The check may be stricter than the request.'
    ])
  })
  it('says nothing when nothing stands out', () => {
    expect(says([row('A', ['ok', 'ok', 'ok', 'ok', 'ok']), row('B', ['ok', 'trouble', 'ok', 'ok', 'ok'])])).toEqual([])
  })
})

describe('how one run went, line by line', () => {
  it('tells the plan, the check, the review and the landing, each as met, with trouble, or missed, with the time since the start', () => {
    const r = run([begin(), plan(5 * MIN, 'submitted'), plan(30 * MIN, 'released'), stepDone(60 * MIN, 'build'), check(62 * MIN, 1, false, 4000), check(80 * MIN, 2, true), audit(85 * MIN, [finding]), merge(90 * MIN, 'anyway'), done(90 * MIN)])
    expect(timelineOf(r, 99 * MIN)).toEqual([
      { at: 0, kind: 'ok', text: 'Began by the agent · Journey' },
      { at: 30 * MIN, kind: 'bad', text: 'Plan sent, then you lifted the hold after 25m without approving it' },
      { at: 80 * MIN, kind: 'trouble', text: 'Check failed once, passed on try 2' },
      { at: 85 * MIN, kind: 'bad', text: 'Review found 1 thing you did not look at: “Renamed a token.”' },
      { at: 90 * MIN, kind: 'bad', text: 'Landed anyway. Not met: review.' }
    ])
  })
  it('tells a landing anyway as what was not met, one sentence, and a skipped hold as its own sentence; a run that ends in a pull request says pushed', () => {
    const PR: RunWorkflow = { id: 'pr', name: 'Standard', steps: [{ id: 'build', kind: 'work', name: 'Build' }, { id: 'pr', kind: 'pr', name: 'Pull request', gate: 'approve' }] }
    const landed = (wf: RunWorkflow, held: string[]) => timelineOf(run([begin(0, wf), { k: 'merge', t: MIN, run: 'r1', head: 'h1', how: 'anyway', held }, done(MIN)]), 9 * MIN).at(-1)
    expect(landed(PR, ['The review has not run for this branch yet.', 'Pushed without the hold: git push --no-verify.'])).toEqual({ at: MIN, kind: 'bad', text: 'Pushed anyway. Not met: the review has not run for this branch yet. The hold itself was skipped: git push --no-verify.' })
    expect(landed(PR, ['Pushed without the hold: git push --no-verify.'])!.text).toBe('Pushed anyway. The hold itself was skipped: git push --no-verify.')
    expect(landed(JOURNEY, ['No plan was approved for this task.', '2 audit findings have not been seen.'])!.text).toBe('Landed anyway. Not met: no plan was approved for this task; 2 audit findings have not been seen.')
    expect(landed(JOURNEY, [])!.text).toBe('Landed anyway.')
  })

  it('says what was added to the plan, when, in the story of the run', () => {
    const r = run([begin(), audit(2 * MIN, [finding]), { k: 'scope', t: 3 * MIN, run: 'r1', text: 'Renamed a token.' }])
    expect(timelineOf(r, 9 * MIN).at(-1)).toEqual({ at: 3 * MIN, kind: 'trouble', text: 'Added to the plan: “Renamed a token.”' })
  })

  it('says the landing was with the review set aside when it was, instead of after the checks', () => {
    const aside: RunEvent = { k: 'step', t: 3 * MIN, run: 'r1', round: 1, step: 'review', state: 'skipped' }
    const r = run([begin(), plan(MIN, 'submitted'), plan(2 * MIN, 'approved'), stepDone(2.5 * MIN, 'build'), check(2.6 * MIN, 1, true), audit(2.8 * MIN, [finding]), aside, merge(4 * MIN, 'checked'), done(4 * MIN)].map((e) => (e.k === 'merge' ? { ...e, held: [] } : e)))
    expect(timelineOf(r, 9 * MIN).at(-1)).toEqual({ at: 4 * MIN, kind: 'trouble', text: 'Landed with the review set aside' })
  })

  it('says a plan still waiting is waiting for the person, and a clean run as met', () => {
    expect(timelineOf(run([begin(), plan(5 * MIN, 'submitted')]), 26 * MIN).at(-1)).toEqual({ at: 5 * MIN, kind: 'you', text: 'Plan sent 21m ago: waiting for you' })
    const clean = run([begin(), plan(1 * MIN, 'submitted'), plan(2 * MIN, 'approved'), stepDone(5 * MIN, 'build'), check(6 * MIN, 1, true), audit(7 * MIN), merge(8 * MIN, 'checked'), done(8 * MIN)])
    expect(timelineOf(clean, 99 * MIN).map((e) => `${e.kind}: ${e.text}`)).toEqual(['ok: Began by the agent · Journey', 'ok: Plan approved after 1m', 'ok: Check passed first time', 'ok: Review found nothing', 'ok: Landed after the checks'])
  })
  it('says when the review could not run, and why', () => {
    const failed: RunEvent = { k: 'audit', t: 7 * MIN, run: 'r1', head: 'h1', state: 'failed', reason: 'Credit balance is too low' }
    expect(timelineOf(run([begin(), failed, done(8 * MIN)]), 99 * MIN)).toContainEqual({ at: 7 * MIN, kind: 'trouble', text: 'Review could not run: Credit balance is too low' })
  })
  it('marks a follow-up round, and a run begun from a commit', () => {
    const r = run([begin(), done(10 * MIN), { k: 'round', t: 20 * MIN, run: 'r1' }, done(30 * MIN)])
    expect(timelineOf(r, 99 * MIN).map((e) => e.text)).toContain('Follow-up round 2 began')
    expect(timelineOf(run([begin(0, null, { auto: true }), done(0)]), 99 * MIN)[0]).toEqual({ at: 0, kind: 'bad', text: 'Began from a commit: the agent never said it had started the task' })
  })
})

describe('the runs of the last days', () => {
  it('are those that ended or are still going within that many days', () => {
    const DAY = 24 * 60 * MIN
    const old = run([begin(0, JOURNEY, {}, 'old'), done(1 * MIN, 'old')])
    const mid = run([begin(20 * DAY, JOURNEY, {}, 'mid'), done(20 * DAY + MIN, 'mid')])
    const open = run([begin(39 * DAY, JOURNEY, {}, 'open')])
    const now = 40 * DAY
    expect(runsWithin([old, mid, open], 7, now).map((r) => r.id)).toEqual(['open'])
    expect(runsWithin([old, mid, open], 30, now).map((r) => r.id)).toEqual(['mid', 'open'])
  })
})

describe('one tile for a whole run', () => {
  const tiles = (...kinds: TileKind[]) => kinds.map((kind, i) => ({ gate: (['plan', 'check', 'review', 'land', 'told'] as const)[i % 5]!, kind }))
  it('is the worst that happened: missed, then waiting, then trouble, then met', () => {
    expect(runVerdict(tiles('ok', 'ok', 'na', 'na', 'ok'))).toBe('ok')
    expect(runVerdict(tiles('ok', 'trouble', 'na', 'na', 'ok'))).toBe('trouble')
    expect(runVerdict(tiles('wait', 'trouble', 'na', 'na', 'ok'))).toBe('wait')
    expect(runVerdict(tiles('trouble', 'wait', 'bad', 'ok', 'ok'))).toBe('bad')
    expect(runVerdict(tiles('na', 'na', 'na', 'na', 'na'))).toBe('na')
  })
})

describe('the week, day by day', () => {
  // Oct 14 to 16, 2026 are a Wednesday to a Friday; the week began on Monday the 12th.
  const at = (day: number, hour: number, min = 0) => new Date(2026, 9, day, hour, min).getTime()
  const sub = (t: number, run: string): RunEvent => ({ k: 'plan', t, run, round: 1, state: 'submitted', path: 'p.md', readback })
  const plans = (run: string, d: number, hour: number, sentBack: boolean): RunEvent[] => [...(sentBack ? [sub(at(d, hour, 1), run), { k: 'plan', t: at(d, hour, 2), run, round: 1, state: 'changes' } as RunEvent] : []), sub(at(d, hour, 3), run), { k: 'plan', t: at(d, hour, 4), run, round: 1, state: 'approved' } as RunEvent]
  const finish = (run: string, d: number, hour: number): RunEvent[] => [stepDone(at(d, hour, 10), 'build', run), check(at(d, hour, 11), 1, true, 1000, run), audit(at(d, hour, 12), [], run), merge(at(d, hour, 13), 'checked', run), done(at(d, hour, 13), run)]
  const runs = [
    run([begin(at(14, 10), JOURNEY, { title: 'Dark mode' }, 'w'), ...plans('w', 14, 10, true), ...finish('w', 14, 10)]),
    run([begin(at(15, 10), JOURNEY, { title: 'Word count' }, 't'), ...plans('t', 15, 10, false), stepDone(at(15, 10, 10), 'build', 't'), check(at(15, 10, 11), 1, false, 1000, 't'), check(at(15, 10, 12), 2, true, 1000, 't'), audit(at(15, 10, 13), [], 't'), merge(at(15, 10, 14), 'checked', 't'), done(at(15, 10, 14), 't')]),
    run([begin(at(16, 9), QUICK, { title: 'README' }, 'f1'), stepDone(at(16, 9, 5), 'quick', 'f1'), merge(at(16, 9, 6), 'checked', 'f1'), done(at(16, 9, 6), 'f1')]),
    run([begin(at(16, 11), JOURNEY, { title: 'Slug limit' }, 'f2'), sub(at(16, 11, 5), 'f2')])
  ]
  it('puts each run on the day it began, oldest first, with one verdict each, and marks today', () => {
    const days = weekDays(runs, () => ctx, at(16, 12))
    expect(days.map((d) => d.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    expect(days.map((d) => d.today)).toEqual([false, false, false, false, true, false, false])
    expect(days.map((d) => d.runs.map((r) => r.kind))).toEqual([[], [], ['trouble'], ['trouble'], ['ok', 'wait'], [], []])
    expect(days[4]!.runs.map((r) => r.title)).toEqual(['README', 'Slug limit'])
  })
  it('puts a run from before the week that is still going on Monday, and leaves out one that ended before it', () => {
    const old = run([begin(at(5, 10), JOURNEY, { title: 'Old' }, 'o'), done(at(5, 11), 'o')])
    const stuck = run([begin(at(5, 10), JOURNEY, { title: 'Stuck' }, 's')])
    const days = weekDays([old, stuck], () => ctx, at(16, 12))
    expect(days[0]!.runs.map((r) => r.title)).toEqual(['Stuck'])
    expect(days.flatMap((d) => d.runs)).toHaveLength(1)
  })
})

describe('how well each stage was followed', () => {
  const t = (gate: Tile['gate'], kind: TileKind): Tile => ({ gate, kind })
  it('counts the runs that met each stage first time, after trouble, or not at all, leaving out what was not asked or is still waiting', () => {
    const rows: Tile[][] = [
      [t('plan', 'ok'), t('check', 'ok'), t('review', 'ok'), t('land', 'ok'), t('told', 'ok')],
      [t('plan', 'trouble'), t('check', 'trouble'), t('review', 'trouble'), t('land', 'bad'), t('told', 'ok')],
      [t('plan', 'bad'), t('check', 'bad'), t('review', 'bad'), t('land', 'wait'), t('told', 'bad')],
      [t('plan', 'na'), t('check', 'wait'), t('review', 'na'), t('land', 'na'), t('told', 'ok')]
    ]
    expect(stageCounts(rows)).toEqual({
      plan: { ok: 1, trouble: 1, bad: 1 },
      check: { ok: 1, trouble: 1, bad: 1 },
      review: { ok: 1, trouble: 1, bad: 1 },
      land: { ok: 1, trouble: 0, bad: 1 }
    })
  })
  it('is all zeros when there are no runs', () => {
    expect(stageCounts([]).plan).toEqual({ ok: 0, trouble: 0, bad: 0 })
  })
})

describe('how often each workflow was invoked', () => {
  const DAY = 24 * 60 * MIN
  const now = new Date(2026, 9, 16, 12, 0, 0).getTime()
  const runs = reduceRuns([
    begin(now - 1 * MIN, JOURNEY, {}, 'a'),
    begin(now - 2 * MIN, JOURNEY, {}, 'b'),
    begin(now - DAY, QUICK, {}, 'c'),
    begin(now - 3 * DAY, JOURNEY, {}, 'd'),
    begin(now - 20 * DAY, JOURNEY, {}, 'e'),
    begin(now - 2 * DAY, null, { auto: true }, 'f')
  ])
  it('counts the runs of each workflow, most used first, and the runs the app started from a commit apart', () => {
    const inv = invocations(runs, 7, now)
    expect(inv.byWorkflow).toEqual([{ name: 'Journey', runs: 4 }, { name: 'Quick change', runs: 1 }])
    expect(inv.fromCommit).toBe(1)
    expect(inv.total).toBe(5)
  })
  it('counts the runs begun each day, oldest day first and today last, with a run begun before the window on its first day', () => {
    const inv = invocations(runs, 7, now)
    expect(inv.perDay).toHaveLength(7)
    expect(inv.perDay).toEqual([1, 0, 0, 1, 0, 1, 2])
  })
  it('has a day for each of 30 days when asked for a month', () => {
    expect(invocations(runs, 30, now).perDay).toHaveLength(30)
    expect(invocations(runs, 30, now).perDay.at(-1)).toBe(2)
    expect(invocations(runs, 30, now).perDay.at(-21)).toBe(1)
  })
})

describe('the runs grouped by what to do about them', () => {
  const stop = (t: number, run: string): RunEvent => ({ k: 'stop', t, run })
  const landedClean = (id: string, t0: number, retried = false): RunEvent[] => [begin(t0, JOURNEY, {}, id), plan(t0 + 1, 'submitted', id), plan(t0 + 2, 'approved', id), stepDone(t0 + 3, 'build', id), ...(retried ? [check(t0 + 4, 1, false, 1000, id)] : []), check(t0 + 5, retried ? 2 : 1, true, 1000, id), audit(t0 + 6, [], id), merge(t0 + 7, 'checked', id), done(t0 + 8, id)]
  const events: RunEvent[] = [
    ...landedClean('clean-old', 1000),
    ...landedClean('clean-retried', 2000, true),
    begin(3000, JOURNEY, {}, 'trouble'), plan(3001, 'submitted', 'trouble'), plan(3002, 'approved', 'trouble'), check(3003, 1, true, 1000, 'trouble'), audit(3004, [finding], 'trouble'), merge(3005, 'anyway', 'trouble'), done(3006, 'trouble'),
    begin(4000, JOURNEY, {}, 'needs'), plan(4001, 'submitted', 'needs'),
    begin(5000, JOURNEY, {}, 'open'), plan(5001, 'submitted', 'open'), plan(5002, 'approved', 'open'), stepDone(5003, 'build', 'open'),
    begin(6000, JOURNEY, {}, 'stopped'), stop(6001, 'stopped'),
    ...landedClean('clean-new', 7000)
  ]
  const runs = reduceRuns(events)
  const groups = groupRuns(runs, () => ctx)
  it('puts first what waits on the person, then what is still going, then what landed with trouble or clean, and last what was stopped', () => {
    expect(groups.map((g) => g.key)).toEqual(['needs', 'open', 'trouble', 'clean', 'stopped'])
    expect(groups.map((g) => g.title)).toEqual(['Needs you', 'Still open', 'Landed with trouble', 'Landed clean', 'Stopped'])
  })
  it('lists the newest run first inside a group', () => {
    expect(groups.find((g) => g.key === 'clean')!.runs.map((r) => r.id)).toEqual(['clean-new', 'clean-retried', 'clean-old'])
  })
  it('says which group one run is in, the way the ledger groups them, so the todo board can say how a task\'s run went', () => {
    const byId = (id: string) => runs.find((r) => r.id === id)!
    const key = (id: string) => groupKeyOf(byId(id), gateTiles(byId(id), ctx))
    expect([key('needs'), key('open'), key('trouble'), key('clean-old'), key('stopped')]).toEqual(['needs', 'open', 'trouble', 'clean', 'stopped'])
  })
  it('puts a run that landed anyway or missed a gate under trouble, and one that needed a second try among the clean, counted', () => {
    expect(groups.find((g) => g.key === 'trouble')!.runs.map((r) => r.id)).toEqual(['trouble'])
    expect(groups.find((g) => g.key === 'clean')!.note).toBe('1 needed a second try')
  })
  it('leaves out a group with no runs, and says nothing in a note that has nothing to say', () => {
    const only = groupRuns(reduceRuns(landedClean('x', 0)), () => ctx)
    expect(only.map((g) => g.key)).toEqual(['clean'])
    expect(only[0]!.note).toBe('')
  })
  it('does not call a run the app started from a commit trouble, nor clean: it is not announced, in a group of its own below the others', () => {
    const auto = reduceRuns([begin(0, null, { auto: true }, 'c'), done(1, 'c')])
    const groups = groupRuns([...auto, ...reduceRuns(landedClean('x', 5))], () => ctx)
    expect(groups.map((g) => g.key)).toEqual(['clean', 'unannounced'])
    expect(groups[1]).toMatchObject({ title: 'Not announced', note: 'no task was started, so no plan, checks or review' })
    expect(groupKeyOf(auto[0]!, gateTiles(auto[0]!, ctx))).toBe('unannounced')
    expect(GROUP_STANDS.unannounced).toBe('not announced')
  })
})

describe('what the ledger says about a run', () => {
  const commit = (t: number, sha: string, run = 'r1'): RunEvent => ({ k: 'commit', t, run, sha, subject: 's' })
  const row = (events: RunEvent[], now = 100 * MIN) => {
    const r = run(events)
    return ledgerRow(r, gateTiles(r, ctx), runBar(r, now))
  }
  it('has the wall time, the wait on the person, the commits, and how the checks and the review went', () => {
    const r = row([begin(), plan(3 * MIN, 'submitted'), plan(7 * MIN, 'approved'), stepDone(10 * MIN, 'build'), check(11 * MIN, 1, true, 2000), audit(12 * MIN), commit(13 * MIN, 'a1'), commit(14 * MIN, 'a2'), merge(15 * MIN, 'checked'), done(15 * MIN)])
    expect(r).toEqual({ finished: true, wallMs: 15 * MIN, youMs: 4 * MIN, checks: { kind: 'first', tries: 0 }, review: { kind: 'clean', n: 0 }, commits: 2 })
  })
  it('says a check passed on a later try, and a review whose findings were seen', () => {
    const r = row([begin(), plan(1, 'submitted'), plan(2, 'approved'), stepDone(MIN, 'build'), check(2 * MIN, 1, false), check(3 * MIN, 2, true), audit(4 * MIN, [finding]), seen(5 * MIN, [0]), merge(6 * MIN, 'checked'), done(6 * MIN)])
    expect(r.checks).toEqual({ kind: 'retried', tries: 1 })
    expect(r.review).toEqual({ kind: 'seen', n: 1 })
  })
  it('says a review with findings nobody looked at, and a check that ran out of tries', () => {
    const r = row([begin(), plan(1, 'submitted'), plan(2, 'approved'), stepDone(MIN, 'build'), check(2 * MIN, 1, false), check(3 * MIN, 2, false), check(4 * MIN, 3, false), audit(5 * MIN, [finding])])
    expect(r.checks.kind).toBe('failed')
    expect(r.review).toEqual({ kind: 'unseen', n: 1 })
  })
  it('says a check not reached yet and no review asked for, and has no wall time for a run the app started from a commit', () => {
    const r = row([begin(), plan(1, 'submitted')])
    expect(r).toMatchObject({ finished: false, checks: { kind: 'none' }, review: { kind: 'none' } })
    const auto = ledgerRow(run([begin(0, null, { auto: true }), done(1)]), gateTiles(run([begin(0, null, { auto: true }), done(1)]), ctx), undefined)
    expect(auto.wallMs).toBeNull()
  })
  it('totals a set of rows: the median wall time of the runs that finished, the wait on the person, and how often checks passed first time and a review found something', () => {
    const rows = [
      { finished: true, wallMs: 1 * MIN, youMs: 0, checks: { kind: 'first' as const, tries: 0 }, review: { kind: 'clean' as const, n: 0 }, commits: 1 },
      { finished: true, wallMs: 3 * MIN, youMs: 2 * MIN, checks: { kind: 'retried' as const, tries: 1 }, review: { kind: 'seen' as const, n: 1 }, commits: 1 },
      { finished: true, wallMs: 100 * MIN, youMs: 1 * MIN, checks: { kind: 'failed' as const, tries: 3 }, review: { kind: 'none' as const, n: 0 }, commits: 1 },
      { finished: false, wallMs: 25 * 60 * MIN, youMs: 0, checks: { kind: 'none' as const, tries: 0 }, review: { kind: 'none' as const, n: 0 }, commits: 0 },
      { finished: true, wallMs: null, youMs: 0, checks: { kind: 'first' as const, tries: 0 }, review: { kind: 'clean' as const, n: 0 }, commits: 0 }
    ]
    expect(ledgerTotals(rows)).toEqual({ medianWallMs: 3 * MIN, youMs: 3 * MIN, checks: { first: 2, of: 4 }, review: { found: 1, of: 3 } })
  })
  it('has no median when no run finished with a time', () => {
    expect(ledgerTotals([]).medianWallMs).toBeNull()
  })
})

describe('todoChips', () => {
  it('shows every todo up to five, and none are hidden', () => {
    expect(todoChips([1, 2, 3, 4, 5])).toEqual({ shown: [1, 2, 3, 4, 5], more: 0 })
    expect(todoChips(undefined)).toEqual({ shown: [], more: 0 })
  })

  it('shows the first five and counts the rest', () => {
    expect(todoChips(Array.from({ length: 22 }, (_, i) => i + 1))).toEqual({ shown: [1, 2, 3, 4, 5], more: 17 })
  })
})

describe('the steps of a run, as the Runs tab lists them', () => {
  const FLOW: RunWorkflow = { id: 'f', name: 'F', steps: [{ id: 'designs', kind: 'work', name: 'Designs', optional: true }, { id: 'build', kind: 'work', name: 'Build' }, { id: 'commit', kind: 'work', name: 'Commit', start: 'run' }] }
  const skip = (t: number, run = 'r1'): RunEvent => ({ k: 'step', t, run, round: 1, step: 'designs', state: 'skipped', note: 'No UI.' })
  const refuse = (t: number, run = 'r1'): RunEvent => ({ k: 'step', t, run, round: 1, step: 'commit', state: 'declined' })
  const c = { auditOn: false }

  it('lists each step with how it ended and the reason a step was skipped', () => {
    const lines = stepLines(run([begin(0, FLOW), skip(1), stepDone(2, 'build')]), c)
    expect(lines.map((l) => `${l.id}:${l.state}`)).toEqual(['designs:skipped', 'build:passed', 'commit:waiting'])
    expect(lines[0]!.note).toBe('No UI.')
  })

  it('sums them up, naming a refused step first, then one that waits for the person', () => {
    expect(stepSummary(stepLines(run([begin(0, FLOW), skip(1), stepDone(2, 'build')]), c))).toEqual({ text: '1 of 3 met, 1 skipped · Commit waits for you', tone: 'you' })
    expect(stepSummary(stepLines(run([begin(0, FLOW), skip(1), stepDone(2, 'build'), refuse(3)]), c))).toEqual({ text: '1 of 3 met, 1 skipped · Commit failed', tone: 'bad' })
    expect(stepSummary([])).toEqual({ text: '—', tone: 'dim' })
  })

  it('counts, per step name, the runs that met, skipped or failed it, leaving out the runs that have not got there', () => {
    const runs = reduceRuns([begin(0, FLOW), skip(1), stepDone(2, 'build'), refuse(3), begin(10, FLOW, {}, 'r2'), stepDone(11, 'designs', 'r2')])
    expect(stepCounts(runs, () => c)).toEqual([{ name: 'Designs', met: 1, skipped: 1, failed: 0 }, { name: 'Build', met: 1, skipped: 0, failed: 0 }, { name: 'Commit', met: 0, skipped: 0, failed: 1 }])
  })

  it('lays the runs out against the steps, oldest first, so each cell says how that step ended in that run', () => {
    const runs = reduceRuns([begin(0, FLOW), skip(1), stepDone(2, 'build'), refuse(3), begin(10, FLOW, {}, 'r2'), stepDone(11, 'designs', 'r2')])
    const m = stepMatrix(runs, () => c)
    expect(m.steps).toEqual(['Designs', 'Build', 'Commit'])
    expect(stepMatrix(reduceRuns([begin(0, QUICK), begin(10, FLOW, {}, 'r2')]), () => c).steps).toEqual(['Designs', 'Build', 'Commit', 'Land'])
    expect(m.runs.map((r) => r.id)).toEqual(['r1', 'r2'])
    expect(m.runs[0]!.cells.map((x) => x.state)).toEqual(['skipped', 'passed', 'failed'])
    expect(m.runs[0]!.cells[0]!.note).toBe('No UI.')
    expect(m.runs[1]!.cells.map((x) => x.state)).toEqual(['passed', 'open', undefined])
    expect(stepMatrix(runs, () => c, 1)).toMatchObject({ more: 1, runs: [{ id: 'r2' }] })
  })
})
