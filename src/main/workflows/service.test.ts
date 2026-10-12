import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Workflows } from './service'

function make(opts: { enabled?: boolean } = {}) {
  const file = join(mkdtempSync(join(tmpdir(), 'aw-runs-')), 'runs.jsonl')
  const state = { enabled: opts.enabled ?? true, planGate: true, since: 0, t: 1000, n: 0 }
  const open = () =>
    new Workflows(file, {
      enabled: () => state.enabled,
      since: () => state.since,
      planGate: () => state.planGate,
      now: () => (state.t += 10),
      newId: () => `r${++state.n}`,
      who: (id) => (id === 'a1' ? { name: 'ada', project: '/p' } : id === 'a2' ? { name: 'bo', project: '/p' } : undefined)
    })
  return { state, open, wf: open() }
}

describe('recording a task', () => {
  it('task_begin opens a run for the agent and task_done closes it, and both survive a restart', () => {
    const { wf, open } = make()
    wf.begin('a1', 'Fix the login redirect')
    expect(wf.runs()).toHaveLength(1)
    expect(wf.runs()[0]).toMatchObject({ agent: 'a1', name: 'ada', project: '/p', title: 'Fix the login redirect', status: 'open' })
    expect(wf.openCount()).toBe(1)
    wf.done('a1', 'Done.')
    expect(open().runs()[0]).toMatchObject({ status: 'done', summary: 'Done.' })
    expect(open().openCount()).toBe(0)
  })

  it('a new task_begin while one is open closes the old one as done: the agent moved on', () => {
    const { wf } = make()
    wf.begin('a1', 'First')
    wf.begin('a1', 'Second')
    expect(wf.runs().map((r) => [r.title, r.status])).toEqual([['First', 'done'], ['Second', 'open']])
  })

  it('task_done with nothing open says so, and an unknown agent cannot begin', () => {
    const { wf } = make()
    expect(() => wf.done('a1')).toThrow('No task is open')
    expect(() => wf.begin('nobody', 'x')).toThrow('Unknown agent')
  })
})

describe('turning workflows off', () => {
  it('starts no new task, but a task already open can still be finished', () => {
    const { wf, state } = make()
    wf.begin('a1', 'Fix it')
    state.enabled = false
    expect(() => wf.begin('a2', 'New work')).toThrow('Workflows are off')
    wf.done('a1', 'Fixed.')
    expect(wf.runs()[0]!.status).toBe('done')
  })

  it('stopAll closes every open run as stopped', () => {
    const { wf } = make()
    wf.begin('a1', 'One')
    wf.begin('a2', 'Two')
    wf.stopAll()
    expect(wf.runs().map((r) => r.status)).toEqual(['stopped', 'stopped'])
    expect(wf.openCount()).toBe(0)
  })
})

describe('follow-ups', () => {
  it('a follow-up after the task finished reopens the same run as round 2', () => {
    const { wf } = make()
    const id = wf.begin('a1', 'Add a dark-mode toggle')
    wf.done('a1')
    expect(wf.begin('a1', 'Missed the settings page', { followUp: true })).toBe(id)
    const [r] = wf.runs()
    expect(wf.runs()).toHaveLength(1)
    expect(r).toMatchObject({ status: 'open', title: 'Add a dark-mode toggle' })
    expect(r!.rounds.map((x) => x.n)).toEqual([1, 2])
  })

  it('a follow-up with nothing before it, or while the task is still open, changes nothing it should not', () => {
    const { wf } = make()
    wf.begin('a1', 'Open one')
    expect(wf.begin('a1', 'More', { followUp: true })).toBe(wf.runs()[0]!.id)
    expect(wf.runs()[0]!.rounds).toHaveLength(1)
    const fresh = wf.begin('a2', 'Brand new', { followUp: true })
    expect(wf.runs().find((r) => r.id === fresh)).toMatchObject({ agent: 'a2', title: 'Brand new' })
  })
})

describe('commits', () => {
  it('a commit while a task is open belongs to it, once', () => {
    const { wf } = make()
    wf.begin('a1', 'Fix it')
    wf.commit('a1', 'abc123', 'fix: keep query')
    wf.commit('a1', 'abc123', 'fix: keep query')
    expect(wf.runs()[0]!.rounds[0]!.commits).toEqual([{ sha: 'abc123', subject: 'fix: keep query', t: expect.any(Number) }])
  })

  it('a commit with no task open goes to the agent\'s nearest run and is flagged, never refused', () => {
    const { wf } = make()
    wf.begin('a1', 'Fix it')
    wf.done('a1')
    wf.commit('a1', 'def456', 'chore: tidy')
    expect(wf.runs()[0]!.rounds[0]!.commits[0]).toMatchObject({ sha: 'def456', flagged: true })
  })

  it('with workflows off only an open run takes a commit', () => {
    const { wf, state } = make()
    wf.begin('a1', 'Fix it')
    wf.done('a1')
    state.enabled = false
    wf.commit('a1', 'bbb222', 'after off')
    expect(wf.runs()[0]!.rounds[0]!.commits).toEqual([])
  })

  it('a commit made before the agent\'s first task began is not part of any run, and a later one keeps its own time', () => {
    const { wf } = make()
    wf.begin('a1', 'Fix it') // begins at t=1010
    wf.commit('a1', 'old111', 'from last week', 500)
    wf.commit('a1', 'new222', 'during', 1500)
    expect(wf.runs()[0]!.rounds[0]!.commits).toEqual([{ sha: 'new222', subject: 'during', t: 1500 }])
  })

  it('a commit is placed by the time it was made, not by when it was noticed: made while the task was open, it is not flagged even when read after task_done', () => {
    const { wf } = make()
    wf.begin('a1', 'Fix it') // 1010
    wf.done('a1') // 1020
    wf.commit('a1', 'in111', 'made during', 1015)
    wf.commit('a1', 'out22', 'made after', 1500)
    const [r] = wf.runs()
    expect(r!.rounds[0]!.commits).toEqual([{ sha: 'in111', subject: 'made during', t: 1015 }, { sha: 'out22', subject: 'made after', t: 1500, flagged: true }])
  })

  it('in a run with two rounds a commit goes to the round it was made in', () => {
    const { wf } = make()
    wf.begin('a1', 'Fix it') // 1010
    wf.done('a1') // 1020
    wf.begin('a1', 'Missed case', { followUp: true }) // round 2 at 1030
    wf.commit('a1', 'r1c', 'first round', 1015)
    wf.commit('a1', 'r2c', 'second round', 1035)
    const [r] = wf.runs()
    expect(r!.rounds.map((x) => x.commits.map((c) => c.sha))).toEqual([['r1c'], ['r2c']])
  })
})

describe('work the agent never announced', () => {
  const MIN = 60_000
  it('a commit from an agent with no run starts one titled from the commit, marked as the app\'s doing, already done', () => {
    const { wf } = make()
    wf.commit('a2', 'aaa111', 'feat: add slugify', 5000)
    const [r] = wf.runs()
    expect(r).toMatchObject({ agent: 'a2', name: 'bo', title: 'feat: add slugify', status: 'done', auto: true })
    expect(r!.rounds[0]!.commits).toEqual([{ sha: 'aaa111', subject: 'feat: add slugify', t: 5000 }])
  })

  it('a commit made before workflows were switched on is history, not work to record', () => {
    const { wf, state } = make()
    state.since = 9000
    wf.commit('a2', 'old000', 'from last week', 5000)
    expect(wf.runs()).toEqual([])
    wf.commit('a2', 'new000', 'today', 9500)
    expect(wf.runs()).toHaveLength(1)
  })

  it('commits close together are one run; one after a long gap is another', () => {
    const { wf } = make()
    wf.commit('a2', 'c1', 'feat: add slugify', 10 * MIN)
    wf.commit('a2', 'c2', 'test: cover slugify', 14 * MIN)
    wf.commit('a2', 'c3', 'feat: add truncate', 60 * MIN)
    expect(wf.runs().map((r) => [r.title, r.rounds[0]!.commits.length])).toEqual([['feat: add slugify', 2], ['feat: add truncate', 1]])
  })

  it('nothing is started with workflows off, and after a task the agent announced a stray commit is still just flagged', () => {
    const off = make({ enabled: false })
    off.wf.commit('a2', 'x1', 'whatever', 5000)
    expect(off.wf.runs()).toEqual([])
    const { wf } = make()
    wf.begin('a1', 'Fix it')
    wf.done('a1')
    wf.commit('a1', 'stray', 'chore: tidy', 5000)
    expect(wf.runs()).toHaveLength(1)
    expect(wf.runs()[0]!.rounds[0]!.commits[0]).toMatchObject({ sha: 'stray', flagged: true })
  })
})

const PLAN = `## Goal
Add a toggle.

## Assumptions
- [given] It lives in Settings.
- [guessed] It is saved in preferences.

## Out of scope
none

## Open questions
- Every window or this one?
  - Every window
  - This window
`

describe('the plan gate', () => {
  it('a submitted plan waits for the person, and approving it ends the wait', () => {
    const { wf } = make()
    const run = wf.begin('a1', 'Add a toggle')
    expect(wf.submitPlan('a1', '.agent-world/plan.md', PLAN)).toEqual({ questions: 1 })
    expect(wf.runs()[0]!.rounds[0]!.plan).toMatchObject({ state: 'submitted', path: '.agent-world/plan.md', readback: { goal: 'Add a toggle.' } })
    wf.decide(run, 'approved')
    expect(wf.runs()[0]!.rounds[0]!.plan).toMatchObject({ state: 'approved' })
  })

  it('an incomplete plan is refused with every problem, and nothing is recorded', () => {
    const { wf } = make()
    wf.begin('a1', 'Add a toggle')
    expect(() => wf.submitPlan('a1', 'p.md', '## Goal\nx\n')).toThrow(/Missing "## Assumptions"[\s\S]*Missing "## Out of scope"/)
    expect(wf.runs()[0]!.rounds[0]!.plan).toBeUndefined()
  })

  it('needs an open task, and a decision needs a plan that is waiting', () => {
    const { wf } = make()
    expect(() => wf.submitPlan('a1', 'p.md', PLAN)).toThrow('No task is open')
    const run = wf.begin('a1', 'x')
    expect(() => wf.decide(run, 'approved')).toThrow('No plan is waiting')
  })

  it('sent back for changes it can be submitted again', () => {
    const { wf } = make()
    const run = wf.begin('a1', 'Add a toggle')
    wf.submitPlan('a1', 'p.md', PLAN)
    wf.decide(run, 'changes', { note: 'Cover the settings page.', answers: [{ question: 'Every window or this one?', answer: 'Every window' }] })
    expect(wf.runs()[0]!.rounds[0]!.plan).toMatchObject({ state: 'changes', note: 'Cover the settings page.' })
    wf.submitPlan('a1', 'p.md', PLAN)
    expect(wf.runs()[0]!.rounds[0]!.plan!.state).toBe('submitted')
  })
})

describe('what the gate holds back', () => {
  const edit = (wf: Workflows, file = '/w/src/a.ts') => wf.editBlock('a1', file, '/w')
  it('from the task\'s start until its plan is approved, edits are refused, except to the plan\'s own folder', () => {
    const { wf } = make()
    expect(edit(wf)).toBeNull()
    const run = wf.begin('a1', 'Add a toggle')
    expect(edit(wf)).toMatch(/plan/i)
    expect(edit(wf, '/w/.agent-world/plan.md')).toBeNull()
    wf.submitPlan('a1', '.agent-world/plan.md', PLAN)
    expect(edit(wf)).toMatch(/waiting/i)
    wf.decide(run, 'changes', { note: 'again' })
    expect(edit(wf)).toMatch(/changes/i)
    wf.submitPlan('a1', '.agent-world/plan.md', PLAN)
    wf.decide(run, 'approved')
    expect(edit(wf)).toBeNull()
  })

  it('"release" lifts the block without approving, even before any plan was submitted', () => {
    const { wf } = make()
    const run = wf.begin('a1', 'Add a toggle')
    wf.decide(run, 'released')
    expect(edit(wf)).toBeNull()
  })

  it('does nothing with the gate off, for a task the app started, for a follow-up round with no new plan, or after the task is done', () => {
    const off = make()
    off.state.planGate = false
    off.wf.begin('a1', 'x')
    expect(edit(off.wf)).toBeNull()
    const auto = make()
    auto.wf.commit('a1', 'c1', 'feat: x', 5000)
    expect(edit(auto.wf)).toBeNull()
    const { wf } = make()
    const run = wf.begin('a1', 'x')
    wf.submitPlan('a1', 'p.md', PLAN)
    wf.decide(run, 'approved')
    wf.done('a1')
    expect(edit(wf)).toBeNull()
    wf.begin('a1', 'more', { followUp: true })
    expect(edit(wf)).toBeNull()
  })
})
