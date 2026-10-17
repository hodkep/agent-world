import { describe, expect, it } from 'vitest'
import type { PlanReadback } from './plan'
import { type RunEvent, pendingPlans, reduceRuns, runLabel } from './runs'

const begin = (run: string, t: number, title = 'Fix the login redirect', agent = 'a1'): Extract<RunEvent, { k: 'begin' }> => ({ k: 'begin', t, run, agent, name: 'ada', project: '/p', title })

describe('what a run is, read from its log', () => {
  it('a begun task is an open run with one round', () => {
    const [r] = reduceRuns([begin('r1', 100)])
    expect(r).toMatchObject({ id: 'r1', agent: 'a1', name: 'ada', title: 'Fix the login redirect', status: 'open', startedAt: 100 })
    expect(r!.rounds).toEqual([{ n: 1, startedAt: 100, commits: [], steps: [], checks: [] }])
  })

  it('done closes the run and its round, with the summary', () => {
    const [r] = reduceRuns([begin('r1', 100), { k: 'done', t: 400, run: 'r1', summary: 'Redirect keeps the query string.' }])
    expect(r).toMatchObject({ status: 'done', endedAt: 400, summary: 'Redirect keeps the query string.' })
    expect(r!.rounds[0]).toMatchObject({ n: 1, endedAt: 400 })
  })

  it('a commit joins the latest round, and keeps its flag', () => {
    const [r] = reduceRuns([begin('r1', 100), { k: 'commit', t: 200, run: 'r1', sha: 'abc', subject: 'fix: keep query' }, { k: 'commit', t: 250, run: 'r1', sha: 'def', subject: 'wip', flagged: true }])
    expect(r!.rounds[0]!.commits).toEqual([{ sha: 'abc', subject: 'fix: keep query', t: 200 }, { sha: 'def', subject: 'wip', t: 250, flagged: true }])
  })

  it('a run the app started from a commit says so', () => {
    const [r] = reduceRuns([{ ...begin('r1', 100), auto: true }])
    expect(r!.auto).toBe(true)
    expect(reduceRuns([begin('r2', 100)])[0]!.auto).toBeUndefined()
  })

  it('a commit that names its round goes there, even when a later round exists', () => {
    const [r] = reduceRuns([begin('r1', 100), { k: 'done', t: 200, run: 'r1' }, { k: 'round', t: 300, run: 'r1' }, { k: 'commit', t: 150, run: 'r1', round: 1, sha: 'abc', subject: 'early' }])
    expect(r!.rounds.map((x) => x.commits.length)).toEqual([1, 0])
  })

  it('a follow-up reopens a done run as round 2, and its commits go there', () => {
    const [r] = reduceRuns([
      begin('r1', 100),
      { k: 'done', t: 400, run: 'r1' },
      { k: 'round', t: 500, run: 'r1' },
      { k: 'commit', t: 600, run: 'r1', sha: 'ghi', subject: 'handle empty query' }
    ])
    expect(r).toMatchObject({ status: 'open' })
    expect(r!.endedAt).toBeUndefined()
    expect(r!.rounds.map((x) => [x.n, x.startedAt, x.endedAt, x.commits.length])).toEqual([[1, 100, 400, 0], [2, 500, undefined, 1]])
  })

  it('a new snapshot of the workflow replaces the one the run began with, and the rounds keep what they logged', () => {
    const v1 = { id: 'journey', name: 'Journey', hash: 'aaaa1111', steps: [{ id: 'build', kind: 'work' as const, name: 'Build' }] }
    const v2 = { ...v1, hash: 'bbbb2222', steps: [...v1.steps, { id: 'tests', kind: 'check' as const, name: 'Tests', run: 'npm test' }] }
    const [r] = reduceRuns([{ ...begin('r1', 100), workflow: v1 }, { k: 'step', t: 150, run: 'r1', round: 1, step: 'build', state: 'done' }, { k: 'done', t: 200, run: 'r1' }, { k: 'round', t: 300, run: 'r1' }, { k: 'workflow', t: 310, run: 'r1', workflow: v2 }])
    expect(r!.workflow).toEqual(v2)
    expect(r!.rounds[0]!.steps).toHaveLength(1)
    expect(r!.rounds).toHaveLength(2)
  })

  it('a todo linked to the run is kept with it, once however often it is said, in the order they were linked', () => {
    const [r] = reduceRuns([begin('r1', 100), { k: 'todo', t: 110, run: 'r1', todo: '14' }, { k: 'todo', t: 120, run: 'r1', todo: '14' }, { k: 'todo', t: 130, run: 'r1', todo: '15' }])
    expect(r!.todos).toEqual(['14', '15'])
    expect(reduceRuns([begin('r2', 100)])[0]!.todos).toBeUndefined()
  })

  it('a stopped run is closed as stopped, and runs come out oldest first', () => {
    const rs = reduceRuns([begin('r1', 100), begin('r2', 150, 'Import CSV', 'a2'), { k: 'stop', t: 300, run: 'r2' }])
    expect(rs.map((r) => [r.id, r.status])).toEqual([['r1', 'open'], ['r2', 'stopped']])
    expect(rs[1]!.endedAt).toBe(300)
  })

  it('ignores events for a run that was never begun', () => {
    expect(reduceRuns([{ k: 'done', t: 1, run: 'ghost' }, { k: 'commit', t: 2, run: 'ghost', sha: 'x', subject: 'y' }])).toEqual([])
  })
})

describe('a run that is opened again because work was sent back', () => {
  it('is open again in the same round, without the end or the summary it had, and what follows counts in that round', () => {
    const [r] = reduceRuns([begin('r1', 1000), { k: 'done', t: 2000, run: 'r1', summary: 'Done.' }, { k: 'reopen', t: 3000, run: 'r1' }, { k: 'commit', t: 4000, run: 'r1', sha: 'abc', subject: 'fix' }])
    expect(r).toMatchObject({ status: 'open' })
    expect(r!.endedAt).toBeUndefined()
    expect(r!.summary).toBeUndefined()
    expect(r!.rounds).toHaveLength(1)
    expect(r!.rounds[0]!.endedAt).toBeUndefined()
    expect(r!.rounds[0]!.commits).toHaveLength(1)
  })

  it('counts how often work was sent back to it; a run never reopened has no count', () => {
    const [twice] = reduceRuns([begin('r1', 1000), { k: 'done', t: 2000, run: 'r1' }, { k: 'reopen', t: 3000, run: 'r1' }, { k: 'done', t: 4000, run: 'r1' }, { k: 'reopen', t: 5000, run: 'r1' }])
    expect(twice!.reopened).toBe(2)
    expect(reduceRuns([begin('r1', 1000), { k: 'done', t: 2000, run: 'r1' }])[0]!.reopened).toBeUndefined()
    expect(reduceRuns([begin('r1', 1000), { k: 'reopen', t: 3000, run: 'r1' }])[0]!.reopened).toBeUndefined()
  })

  it('does not reopen a run that was stopped, or one that is already open', () => {
    expect(reduceRuns([begin('r1', 1000), { k: 'stop', t: 2000, run: 'r1' }, { k: 'reopen', t: 3000, run: 'r1' }])[0]!.status).toBe('stopped')
    expect(reduceRuns([begin('r1', 1000), { k: 'reopen', t: 3000, run: 'r1' }])[0]!.status).toBe('open')
  })

  it('can end again: a second done closes it with its own summary', () => {
    const [r] = reduceRuns([begin('r1', 1000), { k: 'done', t: 2000, run: 'r1', summary: 'First.' }, { k: 'reopen', t: 3000, run: 'r1' }, { k: 'done', t: 4000, run: 'r1', summary: 'Second.' }])
    expect(r).toMatchObject({ status: 'done', summary: 'Second.', endedAt: 4000 })
  })
})

describe('naming a run for a list', () => {
  it('is the agent and the task, with the round only after the first', () => {
    const first = reduceRuns([begin('r1', 100)])[0]!
    expect(runLabel(first)).toBe('ada: Fix the login redirect')
    const again = reduceRuns([begin('r1', 100), { k: 'done', t: 200, run: 'r1' }, { k: 'round', t: 300, run: 'r1' }])[0]!
    expect(runLabel(again)).toBe('ada: Fix the login redirect (round 2)')
  })
})

const readback: PlanReadback = { goal: 'Add a toggle.', assumptions: [{ kind: 'given', text: 'In Settings.' }], outOfScope: [], questions: [] }

describe('a round\'s plan', () => {
  it('is submitted, then approved or sent back with a note and the person\'s answers', () => {
    const [r] = reduceRuns([
      begin('r1', 100),
      { k: 'plan', t: 200, run: 'r1', round: 1, state: 'submitted', path: '.agent-world/plan.md', readback },
      { k: 'plan', t: 300, run: 'r1', round: 1, state: 'changes', note: 'Also cover the settings page.', answers: [{ question: 'Every window?', answer: 'Every window' }] }
    ])
    expect(r!.rounds[0]!.plan).toEqual({ state: 'changes', path: '.agent-world/plan.md', readback, submittedAt: 200, decidedAt: 300, waitedMs: 100, sentBack: 1, note: 'Also cover the settings page.', answers: [{ question: 'Every window?', answer: 'Every window' }] })
  })

  it('a resubmitted plan replaces the old one and is waiting again; approving ends the wait', () => {
    const base: RunEvent[] = [begin('r1', 100), { k: 'plan', t: 200, run: 'r1', round: 1, state: 'submitted', path: 'p.md', readback }, { k: 'plan', t: 300, run: 'r1', round: 1, state: 'changes', note: 'no' }]
    const again = reduceRuns([...base, { k: 'plan', t: 400, run: 'r1', round: 1, state: 'submitted', path: 'p.md', readback: { ...readback, goal: 'Add a toggle, better.' } }])
    expect(again[0]!.rounds[0]!.plan).toMatchObject({ state: 'submitted', submittedAt: 400, readback: { goal: 'Add a toggle, better.' } })
    expect(again[0]!.rounds[0]!.plan!.note).toBeUndefined()
    expect(pendingPlans(again).map((x) => x.run.id)).toEqual(['r1'])
    const approved = reduceRuns([...base, { k: 'plan', t: 500, run: 'r1', round: 1, state: 'approved' }])
    expect(approved[0]!.rounds[0]!.plan).toMatchObject({ state: 'approved', decidedAt: 500 })
    expect(pendingPlans(approved)).toEqual([])
  })

  it('counts how often it was sent back, and keeps the count when it is submitted again; a plan never sent back has none', () => {
    const sub = (t: number): RunEvent => ({ k: 'plan', t, run: 'r1', round: 1, state: 'submitted', path: 'p.md', readback })
    const back = (t: number): RunEvent => ({ k: 'plan', t, run: 'r1', round: 1, state: 'changes', note: 'again' })
    const [twice] = reduceRuns([begin('r1', 100), sub(200), back(300), sub(400), back(500), sub(600), { k: 'plan', t: 700, run: 'r1', round: 1, state: 'approved' }])
    expect(twice!.rounds[0]!.plan).toMatchObject({ state: 'approved', sentBack: 2 })
    const [clean] = reduceRuns([begin('r1', 100), sub(200), { k: 'plan', t: 300, run: 'r1', round: 1, state: 'approved' }])
    expect(clean!.rounds[0]!.plan!.sentBack).toBeUndefined()
  })

  it('adds up how long the person was waited on, each time the plan was sent to them, and keeps the sum when it is submitted again', () => {
    const sub = (t: number): RunEvent => ({ k: 'plan', t, run: 'r1', round: 1, state: 'submitted', path: 'p.md', readback })
    const [r] = reduceRuns([begin('r1', 0), sub(1000), { k: 'plan', t: 4000, run: 'r1', round: 1, state: 'changes', note: 'x' }, sub(5000), { k: 'plan', t: 5500, run: 'r1', round: 1, state: 'approved' }])
    expect(r!.rounds[0]!.plan).toMatchObject({ state: 'approved', submittedAt: 5000, decidedAt: 5500, waitedMs: 3500 })
    // Still waiting: nothing is added until the person decides.
    expect(reduceRuns([begin('r1', 0), sub(1000)])[0]!.rounds[0]!.plan!.waitedMs).toBeUndefined()
  })

  it('a decision with no submitted plan before it is ignored, except a release, which lifts the block even then', () => {
    expect(reduceRuns([begin('r1', 100), { k: 'plan', t: 200, run: 'r1', round: 1, state: 'approved' }])[0]!.rounds[0]!.plan).toBeUndefined()
    expect(reduceRuns([begin('r1', 100), { k: 'plan', t: 200, run: 'r1', round: 1, state: 'released' }])[0]!.rounds[0]!.plan).toMatchObject({ state: 'released', decidedAt: 200 })
  })
})

describe('what the merge gate adds to a run', () => {
  const audit = (t: number, head: string): Extract<RunEvent, { k: 'audit' }> => ({ k: 'audit', t, run: 'r1', head, state: 'done', findings: [{ kind: 'out-of-scope', text: 'Adds a project key.' }, { kind: 'guess-wrong', text: 'localStorage.' }], files: 3, lines: 120, truncated: false, cost: 0.004, model: 'haiku' })

  it('the latest audit of the run shows with which findings were seen, and none of it ends the run', () => {
    const [r] = reduceRuns([begin('r1', 100), audit(200, 'h1'), { k: 'seen', t: 210, run: 'r1', head: 'h1', which: [1] }])
    expect(r!.status).toBe('open')
    expect(r!.audit).toEqual({ head: 'h1', t: 200, state: 'done', findings: [{ kind: 'out-of-scope', text: 'Adds a project key.', seen: false }, { kind: 'guess-wrong', text: 'localStorage.', seen: true }], files: 3, lines: 120, truncated: false, cost: 0.004, model: 'haiku' })
  })

  it('a newer head replaces the audit, so findings seen on an older head do not carry over', () => {
    const [r] = reduceRuns([begin('r1', 100), audit(200, 'h1'), { k: 'seen', t: 210, run: 'r1', head: 'h1', which: [0, 1] }, audit(300, 'h2')])
    expect(r!.audit).toMatchObject({ head: 'h2', findings: [{ seen: false }, { seen: false }] })
  })

  it('a failed audit keeps its reason, and landing is recorded with what was still holding it', () => {
    const [r] = reduceRuns([begin('r1', 100), { k: 'audit', t: 200, run: 'r1', head: 'h1', state: 'failed', reason: 'timed out' }, { k: 'merge', t: 300, run: 'r1', head: 'h1', how: 'anyway', held: ['No plan was approved for this task.'] }])
    expect(r!.audit).toEqual({ head: 'h1', t: 200, state: 'failed', reason: 'timed out' })
    expect(r!.landed).toEqual({ t: 300, head: 'h1', how: 'anyway', held: ['No plan was approved for this task.'] })
    expect(r!.status).toBe('open')
  })
})

describe('what the intent check adds to a submitted plan', () => {
  const readback: PlanReadback = { goal: 'Add a toggle.', assumptions: [], outOfScope: [], questions: [{ text: 'Which window?', options: ['All', 'This'] }, { text: 'Follow the system?', options: ['Yes', 'No'], source: 'check' }] }
  const submitted = (check?: object): RunEvent => ({ k: 'plan', t: 200, run: 'r1', round: 1, state: 'submitted', path: '.agent-world/plan.md', readback, ...(check && { check }) }) as RunEvent

  it('keeps what the check cost and how many questions it added with the plan, and its questions are in the read-back marked as its own', () => {
    const [r] = reduceRuns([begin('r1', 100), submitted({ added: 1, cost: 0.0006, model: 'claude-haiku-5-5' })])
    expect(r!.rounds[0]!.plan).toMatchObject({ state: 'submitted', check: { added: 1, cost: 0.0006, model: 'claude-haiku-5-5' } })
    expect(r!.rounds[0]!.plan!.readback.questions.map((q) => q.source)).toEqual([undefined, 'check'])
  })

  it('a check that failed keeps its reason, and a plan without one has none', () => {
    expect(reduceRuns([begin('r1', 100), submitted({ failed: 'timed out' })])[0]!.rounds[0]!.plan!.check).toEqual({ failed: 'timed out' })
    expect(reduceRuns([begin('r1', 100), submitted()])[0]!.rounds[0]!.plan!.check).toBeUndefined()
  })
})

describe('a run that follows a workflow', () => {
  const workflow = { id: 'bug-fix', name: 'Bug fix', hash: 'abc123', steps: [{ id: 'plan', kind: 'plan' as const, name: 'Plan' }, { id: 'fix', kind: 'work' as const, name: 'Fix' }, { id: 'ok', kind: 'approve' as const, name: 'Your review', gate: 'approve' as const }] }

  it('keeps the workflow it began with, as it was then', () => {
    const [r] = reduceRuns([{ ...begin('r1', 100), workflow }])
    expect(r!.workflow).toEqual(workflow)
    expect(reduceRuns([begin('r2', 100)])[0]!.workflow).toBeUndefined()
  })

  it('puts step events in the round they were made in, and ignores one for a round that does not exist', () => {
    const [r] = reduceRuns([
      { ...begin('r1', 100), workflow },
      { k: 'step', t: 200, run: 'r1', round: 1, step: 'fix', state: 'done' },
      { k: 'step', t: 250, run: 'r1', round: 1, step: 'ok', state: 'approved' },
      { k: 'step', t: 300, run: 'r1', round: 9, step: 'fix', state: 'done' },
      { k: 'done', t: 400, run: 'r1' },
      { k: 'round', t: 500, run: 'r1' },
      { k: 'step', t: 600, run: 'r1', round: 2, step: 'fix', state: 'done', implicit: true }
    ])
    expect(r!.rounds[0]!.steps).toEqual([{ step: 'fix', state: 'done', t: 200 }, { step: 'ok', state: 'approved', t: 250 }])
    expect(r!.rounds[1]!.steps).toEqual([{ step: 'fix', state: 'done', t: 600, implicit: true }])
    expect(r!.status).toBe('open')
  })
})

describe('what a check adds to a round', () => {
  const workflow = { id: 'f', name: 'F', steps: [{ id: 'tests', kind: 'check' as const, name: 'Tests pass', run: 'npm test' }] }
  const result = (t: number, attempt: number, ok: boolean, head = 'h1'): Extract<RunEvent, { k: 'check' }> => ({ k: 'check', t, run: 'r1', round: 1, step: 'tests', head, attempt, ok, exit: ok ? 0 : 1, timedOut: false, ms: 1200, tail: ok ? 'ok' : 'FAIL' })

  it('each run of a check is kept in the round with how it ended, in order', () => {
    const [r] = reduceRuns([{ ...begin('r1', 100), workflow }, result(200, 1, false), result(300, 2, true)])
    expect(r!.rounds[0]!.checks).toEqual([
      { step: 'tests', t: 200, head: 'h1', attempt: 1, ok: false, exit: 1, timedOut: false, ms: 1200, tail: 'FAIL' },
      { step: 'tests', t: 300, head: 'h1', attempt: 2, ok: true, exit: 0, timedOut: false, ms: 1200, tail: 'ok' }
    ])
    expect(r!.status).toBe('open')
  })

  it('what the person did with a check (skipped it, declined its commands, asked for it again) goes in the step log, and a check for a round that does not exist is ignored', () => {
    const [r] = reduceRuns([
      { ...begin('r1', 100), workflow },
      { k: 'step', t: 200, run: 'r1', round: 1, step: 'tests', state: 'declined' },
      { k: 'step', t: 300, run: 'r1', round: 1, step: 'tests', state: 'rerun' },
      { k: 'step', t: 400, run: 'r1', round: 1, step: 'tests', state: 'skipped' },
      { ...result(500, 1, true), round: 7 }
    ])
    expect(r!.rounds[0]!.steps.map((s) => s.state)).toEqual(['declined', 'rerun', 'skipped'])
    expect(r!.rounds[0]!.checks).toEqual([])
  })
})
