import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Dial } from '../../shared/workflows'
import { Workflows } from './service'

type Reply = { text: string; cost?: number; model?: string }
function make(opts: { enabled?: boolean } = {}) {
  const file = join(mkdtempSync(join(tmpdir(), 'aw-runs-')), 'runs.jsonl')
  const state = { enabled: opts.enabled ?? true, planGate: true, mergeGate: true, dial: 'balanced' as Dial, since: 0, t: 1000, n: 0, asked: [] as string[], askedFor: [] as string[], reply: (async () => ({ text: '{"findings":[]}' })) as (prompt: string) => Promise<Reply> }
  const open = () =>
    new Workflows(file, {
      enabled: () => state.enabled,
      since: () => state.since,
      planGate: () => state.planGate,
      mergeGate: () => state.mergeGate,
      dial: () => state.dial,
      ask: (agent, prompt) => (state.askedFor.push(agent), state.asked.push(prompt), state.reply(prompt)),
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

describe('the merge gate', () => {
  it('has nothing to say when workflows or the merge gate are off, or the agent never had a run', () => {
    const { wf, state } = make()
    expect(wf.mergeCheck('a1', 'h1')).toBeNull()
    wf.begin('a1', 'Add a toggle')
    expect(wf.mergeCheck('a1', 'h1')).not.toBeNull()
    state.mergeGate = false
    expect(wf.mergeCheck('a1', 'h1')).toBeNull()
    state.mergeGate = true
    state.enabled = false
    expect(wf.mergeCheck('a1', 'h1')).toBeNull()
  })

  it('holds Land until the plan was approved or the person released the hold, and says why', () => {
    const { wf } = make()
    const run = (wf.begin('a1', 'Add a toggle'), wf.runs()[0]!.id)
    expect(wf.mergeCheck('a1', 'h1')).toMatchObject({ plan: 'none', blocking: ['No plan was approved for this task.'] })
    wf.submitPlan('a1', '.agent-world/plan.md', PLAN)
    expect(wf.mergeCheck('a1', 'h1')).toMatchObject({ plan: 'waiting', blocking: ['The plan is still waiting for your approval.'] })
    wf.decide(run, 'changes', { note: 'smaller' })
    expect(wf.mergeCheck('a1', 'h1')).toMatchObject({ plan: 'changes', blocking: ['You asked for changes to the plan and no new plan was approved.'] })
    wf.submitPlan('a1', '.agent-world/plan.md', PLAN)
    wf.decide(run, 'approved')
    expect(wf.mergeCheck('a1', 'h1')).toMatchObject({ plan: 'approved', blocking: [] })
  })

  it('does not hold Land for a plan when the hold was released, the plan gate is off, or the app started the run from a commit', () => {
    const { wf, state } = make()
    wf.begin('a1', 'Add a toggle')
    wf.decide(wf.runs()[0]!.id, 'released')
    expect(wf.mergeCheck('a1', 'h1')).toMatchObject({ plan: 'released', blocking: [] })
    wf.begin('a2', 'Other task')
    state.planGate = false
    expect(wf.mergeCheck('a2', 'h1')).toMatchObject({ plan: 'not-needed', blocking: [] })
    const auto = make()
    auto.wf.commit('a1', 'c9', 'fix: login', 2000)
    expect(auto.wf.mergeCheck('a1', 'h1')).toMatchObject({ plan: 'not-needed', blocking: [], notes: ['The app started this run from a commit, so there was no plan to approve.'] })
  })

  it('notes, without holding Land, that the task is still open or that commits were made outside it', () => {
    const { wf } = make()
    wf.begin('a1', 'Add a toggle')
    wf.decide(wf.runs()[0]!.id, 'released')
    expect(wf.mergeCheck('a1', 'h1')!.notes).toEqual(['The task is still open: the agent has not said it is done.'])
    wf.done('a1')
    wf.commit('a1', 's1', 'chore: a', 9000)
    wf.commit('a1', 's2', 'chore: b', 9100)
    wf.commit('a1', 's3', 'chore: c', 9200)
    expect(wf.mergeCheck('a1', 'h1')).toMatchObject({ blocking: [], notes: ['3 commits were made outside the task.'] })
    const one = make()
    one.wf.begin('a1', 'x')
    one.wf.decide(one.wf.runs()[0]!.id, 'released')
    one.wf.done('a1')
    one.wf.commit('a1', 's1', 'chore: a', 9000)
    expect(one.wf.mergeCheck('a1', 'h1')!.notes).toEqual(['1 commit was made outside the task.'])
  })

  it('audits the diff against the approved plan, shows the findings, and holds Land until each was seen', async () => {
    const { wf, state } = make()
    wf.begin('a1', 'Add a toggle')
    wf.submitPlan('a1', '.agent-world/plan.md', PLAN)
    wf.decide(wf.runs()[0]!.id, 'approved')
    state.reply = async () => ({ text: '{"findings":[{"kind":"out-of-scope","file":"a.ts","text":"Adds a project key."},{"kind":"guess-wrong","text":"Saved in localStorage."}]}', cost: 0.004, model: 'haiku' })
    await wf.runAudit('a1', 'h1', 'diff --git a/a.ts b/a.ts\n+x\n')
    expect(state.asked).toHaveLength(1)
    expect(state.askedFor).toEqual(['a1'])
    expect(state.asked[0]).toContain('Add a toggle.')
    expect(state.asked[0]).toContain('diff --git a/a.ts b/a.ts')
    expect(wf.mergeCheck('a1', 'h1')).toMatchObject({
      audit: { state: 'done', findings: [{ kind: 'out-of-scope', file: 'a.ts', text: 'Adds a project key.', seen: false }, { kind: 'guess-wrong', text: 'Saved in localStorage.', seen: false }], files: 1, cost: 0.004, model: 'haiku' },
      blocking: ['2 audit findings have not been seen.']
    })
    wf.seen('a1', 'h1', [0])
    expect(wf.mergeCheck('a1', 'h1')!.blocking).toEqual(['1 audit finding has not been seen.'])
    wf.seen('a1', 'h1', [1])
    expect(wf.mergeCheck('a1', 'h1')!.blocking).toEqual([])
  })

  it('runs no audit at the economy dial, for a provider that cannot, or when there is no plan to audit against, and says which', async () => {
    const { wf, state } = make()
    wf.begin('a1', 'Add a toggle')
    wf.submitPlan('a1', '.agent-world/plan.md', PLAN)
    wf.decide(wf.runs()[0]!.id, 'approved')
    state.dial = 'economy'
    await wf.runAudit('a1', 'h1', 'diff --git a/a.ts b/a.ts\n+x\n')
    expect(state.asked).toEqual([])
    expect(wf.mergeCheck('a1', 'h1')!.audit).toEqual({ state: 'off', reason: 'economy' })
    state.dial = 'max'
    expect(wf.mergeCheck('a1', 'h1', { auditable: false })!.audit).toEqual({ state: 'off', reason: 'provider' })
    wf.begin('a2', 'Other')
    wf.decide(wf.runs()[1]!.id, 'released')
    await wf.runAudit('a2', 'h1', 'diff --git a/a.ts b/a.ts\n+x\n')
    expect(state.asked).toEqual([])
    expect(wf.mergeCheck('a2', 'h1')!.audit).toEqual({ state: 'off', reason: 'no-plan' })
  })

  it('a model call that throws or answers with something unreadable is logged as failed and never holds Land', async () => {
    const { wf, state } = make()
    wf.begin('a1', 'Add a toggle')
    wf.submitPlan('a1', '.agent-world/plan.md', PLAN)
    wf.decide(wf.runs()[0]!.id, 'approved')
    state.reply = async () => {
      throw new Error('claude timed out')
    }
    await wf.runAudit('a1', 'h1', 'diff --git a/a.ts b/a.ts\n+x\n')
    expect(wf.mergeCheck('a1', 'h1')).toMatchObject({ audit: { state: 'failed', reason: 'claude timed out' }, blocking: [] })
    state.reply = async () => ({ text: 'Looks fine to me.' })
    await wf.runAudit('a1', 'h1', 'diff --git a/a.ts b/a.ts\n+x\n')
    expect(wf.mergeCheck('a1', 'h1')).toMatchObject({ audit: { state: 'failed', reason: 'The reply was not a list of findings.' }, blocking: [] })
  })

  it('audits a branch head once, however often or at once Finish asks, retries after a failure, and starts over when the head moves', async () => {
    const { wf, state } = make()
    wf.begin('a1', 'Add a toggle')
    wf.submitPlan('a1', '.agent-world/plan.md', PLAN)
    wf.decide(wf.runs()[0]!.id, 'approved')
    const diff = 'diff --git a/a.ts b/a.ts\n+x\n'
    await Promise.all([wf.runAudit('a1', 'h1', diff), wf.runAudit('a1', 'h1', diff)])
    await wf.runAudit('a1', 'h1', diff)
    expect(state.asked).toHaveLength(1)
    await wf.runAudit('a1', 'h2', diff)
    expect(state.asked).toHaveLength(2)
    state.reply = async () => {
      throw new Error('offline')
    }
    await wf.runAudit('a1', 'h3', diff)
    state.reply = async () => ({ text: '{"findings":[]}' })
    await wf.runAudit('a1', 'h3', diff)
    expect(state.asked).toHaveLength(4)
    expect(wf.mergeCheck('a1', 'h3')!.audit).toMatchObject({ state: 'done', findings: [] })
  })

  it('refuses to land while something holds it, unless the person chose to land anyway, and records which it was', () => {
    const { wf, state } = make()
    wf.begin('a1', 'Add a toggle')
    expect(() => wf.landing('a1', 'h1')).toThrow('No plan was approved for this task.')
    expect(wf.runs()[0]!.landed).toBeUndefined()
    wf.landing('a1', 'h1', { anyway: true })
    expect(wf.runs()[0]!.landed).toMatchObject({ head: 'h1', how: 'anyway', held: ['No plan was approved for this task.'] })
    wf.decide(wf.runs()[0]!.id, 'released')
    wf.landing('a1', 'h2')
    expect(wf.runs()[0]!.landed).toMatchObject({ head: 'h2', how: 'checked', held: [] })
    state.mergeGate = false
    expect(() => wf.landing('a1', 'h3')).not.toThrow()
    expect(wf.runs()[0]!.landed!.head).toBe('h2')
  })

  it('says the audit is running while the model has not answered, so a second look does not start another', async () => {
    const { wf, state } = make()
    wf.begin('a1', 'Add a toggle')
    wf.submitPlan('a1', '.agent-world/plan.md', PLAN)
    wf.decide(wf.runs()[0]!.id, 'approved')
    let answer!: (r: Reply) => void
    state.reply = () => new Promise<Reply>((r) => (answer = r))
    const pending = wf.runAudit('a1', 'h1', 'diff --git a/a.ts b/a.ts\n+x\n')
    expect(wf.mergeCheck('a1', 'h1')!.audit).toEqual({ state: 'running' })
    answer({ text: '{"findings":[]}' })
    await pending
    expect(wf.mergeCheck('a1', 'h1')!.audit.state).toBe('done')
  })

  it('carries what the "Against the plan" block shows: the approved goal, what is out of scope, and how many commits were in the task or outside it', () => {
    const { wf } = make()
    wf.begin('a1', 'Add a toggle')
    wf.submitPlan('a1', '.agent-world/plan.md', '## Goal\nAdd a dark-mode toggle.\n\n## Assumptions\nnone\n\n## Out of scope\n- A theme per project.\n- Animations.\n\n## Open questions\nnone\n')
    wf.decide(wf.runs()[0]!.id, 'approved')
    wf.commit('a1', 'c1', 'feat: toggle', 1030)
    wf.commit('a1', 'c2', 'feat: save', 1040)
    wf.done('a1')
    wf.commit('a1', 'c3', 'chore: late', 9000)
    expect(wf.mergeCheck('a1', 'h1')).toMatchObject({ planned: { goal: 'Add a dark-mode toggle.', outOfScope: ['A theme per project.', 'Animations.'] }, commits: 3, flagged: 1 })
    const none = make()
    none.wf.begin('a1', 'x')
    expect(none.wf.mergeCheck('a1', 'h1')!.planned).toBeNull()
  })
})
