import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Dial } from '../../shared/workflows'
import type { RunWorkflow } from '../../shared/runs'
import { stepStates } from '../../shared/steps'
import { Workflows } from './service'

type Reply = { text: string; cost?: number; tokens?: number; model?: string }
function make(opts: { enabled?: boolean } = {}) {
  const file = join(mkdtempSync(join(tmpdir(), 'aw-runs-')), 'runs.jsonl')
  const state = { enabled: opts.enabled ?? true, planGate: true, mergeGate: true, dial: 'balanced' as Dial, since: 0, t: 1000, n: 0, asked: [] as string[], askedFor: [] as string[], models: [] as string[], ran: [] as string[], approved: true, results: [] as { exit: number | null; timedOut?: boolean; tail?: string }[], gate: null as null | Promise<void>, picked: [] as (string | undefined)[], pick: ((): RunWorkflow | undefined => undefined) as (id?: string) => RunWorkflow | undefined, todoOf: ((): string | undefined => undefined) as (id: string) => string | undefined, reply: (async () => ({ text: '{"findings":[]}' })) as (prompt: string) => Promise<Reply> }
  const open = () =>
    new Workflows(file, {
      enabled: () => state.enabled,
      since: () => state.since,
      planGate: () => state.planGate,
      mergeGate: () => state.mergeGate,
      pick: (_agent, id) => (state.picked.push(id), state.pick(id)),
      run: async (command, cwd) => {
        state.ran.push(`${command} @ ${cwd}`)
        if (state.gate) await state.gate
        const r = state.results.shift() ?? { exit: 0 }
        return { exit: r.exit, timedOut: r.timedOut ?? false, tail: r.tail ?? '', ms: 1200 }
      },
      approved: () => state.approved,
      cwd: () => '/w',
      dial: () => state.dial,
      ask: (agent, prompt, model) => (state.askedFor.push(agent), state.asked.push(prompt), state.models.push(model ?? ''), state.reply(prompt)),
      now: () => (state.t += 10),
      newId: () => `r${++state.n}`,
      todoOf: (id) => state.todoOf(id),
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

  it('a follow-up after the task finished takes the workflow file as it is now when its version changed, so a changed file is read again', () => {
    const { wf, state } = make()
    const v1: RunWorkflow = { id: 'journey', name: 'Journey', hash: 'aaaa1111', steps: [{ id: 'build', kind: 'work', name: 'Build' }] }
    const v2: RunWorkflow = { ...v1, hash: 'bbbb2222', steps: [...v1.steps, { id: 'tests', kind: 'check', name: 'Tests', run: 'npm test' }] }
    state.pick = () => v1
    wf.begin('a1', 'Add a dark-mode toggle')
    wf.done('a1')
    state.pick = (id) => (id === 'journey' ? v2 : undefined)
    wf.begin('a1', 'Missed the settings page', { followUp: true })
    expect(state.picked.at(-1)).toBe('journey')
    expect(wf.runs()[0]!.workflow).toEqual(v2)
  })

  it('a follow-up leaves the run as it is when the file is unchanged, is gone, or the task is still open', () => {
    const { wf, state } = make()
    const v1: RunWorkflow = { id: 'journey', name: 'Journey', hash: 'aaaa1111', steps: [{ id: 'build', kind: 'work', name: 'Build' }] }
    state.pick = () => v1
    wf.begin('a1', 'Add a dark-mode toggle')
    wf.begin('a1', 'More', { followUp: true })
    wf.done('a1')
    wf.begin('a1', 'Same file', { followUp: true })
    wf.done('a1')
    state.pick = () => undefined
    wf.begin('a1', 'File gone', { followUp: true })
    wf.done('a1')
    state.pick = () => ({ ...v1, id: 'standard', name: 'Standard', hash: 'cccc3333' })
    wf.begin('a1', 'Another workflow answers', { followUp: true })
    expect(wf.runs()[0]!.workflow).toEqual(v1)
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

describe('the todo a run belongs to', () => {
  it('is linked when a task begins while the agent is on a todo, and a follow-up on the same run links the todo it is on then', () => {
    const { wf, state } = make()
    state.todoOf = () => '14'
    wf.begin('a1', 'Add a dark-mode toggle')
    expect(wf.runs()[0]!.todos).toEqual(['14'])
    wf.done('a1')
    state.todoOf = () => '15'
    wf.begin('a1', 'Missed the settings page', { followUp: true })
    expect(wf.runs()[0]!.todos).toEqual(['14', '15'])
    wf.begin('a1', 'More', { followUp: true })
    expect(wf.runs()[0]!.todos).toEqual(['14', '15'])
  })

  it('is nothing when the agent is on no todo, and the link survives a restart', () => {
    const { wf, state, open } = make()
    wf.begin('a1', 'No todo')
    expect(wf.runs()[0]!.todos).toBeUndefined()
    state.todoOf = () => '9'
    wf.begin('a2', 'With one')
    expect(open().runs().find((r) => r.agent === 'a2')!.todos).toEqual(['9'])
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

  it('a run the app starts belongs to the task the agent is on, and a different task is a different run even when the commits are close', () => {
    const { wf, state } = make()
    state.todoOf = () => '4'
    wf.commit('a2', 'c1', 'feat: cancel button', 10 * MIN)
    wf.commit('a2', 'c2', 'test: cancel button', 12 * MIN)
    state.todoOf = () => '5'
    wf.commit('a2', 'c3', 'feat: todo chip', 13 * MIN)
    expect(wf.runs().map((r) => [r.title, r.todos, r.rounds[0]!.commits.length])).toEqual([['feat: cancel button', ['4'], 2], ['feat: todo chip', ['5'], 1]])
  })

  it('commits made while no task is claimed still join, and take the task the agent claims next', () => {
    const { wf, state } = make()
    wf.commit('a2', 'c1', 'feat: a', 10 * MIN)
    state.todoOf = () => '4'
    wf.commit('a2', 'c2', 'feat: b', 12 * MIN)
    expect(wf.runs().map((r) => [r.todos, r.rounds[0]!.commits.length])).toEqual([[['4'], 2]])
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

describe('a commit follows the plan hold', () => {
  const commit = (wf: Workflows, files: string[]) => wf.commitBlock('a1', '/w', files)

  it('is held while an edit would be, with the same words, and let through once the plan is approved', () => {
    const { wf } = make()
    expect(commit(wf, ['src/a.ts'])).toBeNull()
    wf.begin('a1', 'Add a toggle')
    expect(commit(wf, ['src/a.ts'])).toMatch(/plan/i)
    wf.submitPlan('a1', '.agent-world/plan.md', PLAN)
    expect(commit(wf, ['src/a.ts'])).toBe(wf.editBlock('a1', '/w/src/a.ts', '/w'))
    wf.decide(wf.runs()[0]!.id, 'approved')
    expect(commit(wf, ['src/a.ts'])).toBeNull()
  })

  it('lets through a commit of the plan\'s own folder alone, but not that folder along with code', () => {
    const { wf } = make()
    wf.begin('a1', 'Add a toggle')
    expect(commit(wf, ['.agent-world/plan.md'])).toBeNull()
    expect(commit(wf, ['.agent-world/plan.md', 'src/a.ts'])).toMatch(/plan/i)
  })

  it('is not held for another agent, with workflows off, at the economy dial for a task with no plan, or for a follow-up round', () => {
    const { wf, state } = make()
    wf.begin('a1', 'Add a toggle')
    expect(wf.commitBlock('a2', '/w', ['src/a.ts'])).toBeNull()
    state.dial = 'economy'
    expect(commit(wf, ['src/a.ts'])).toBeNull()
    state.dial = 'balanced'
    expect(commit(wf, ['src/a.ts'])).toMatch(/plan/i)
    state.enabled = false
    expect(commit(wf, ['src/a.ts'])).toBeNull()
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

  it('keeps the tokens of an audit that a program reports in place of dollars, with the model that answered', async () => {
    const { wf, state } = make()
    wf.begin('a1', 'Add a toggle')
    wf.submitPlan('a1', '.agent-world/plan.md', PLAN)
    wf.decide(wf.runs()[0]!.id, 'approved')
    state.reply = async () => ({ text: '{"findings":[]}', tokens: 16948, model: 'gemini-3.8-flash-low' })
    await wf.runAudit('a1', 'h1', 'diff --git a/a.ts b/a.ts\n+x\n')
    const audit = wf.mergeCheck('a1', 'h1')!.audit
    expect(audit).toMatchObject({ state: 'done', tokens: 16948, model: 'gemini-3.8-flash-low' })
    expect('cost' in audit).toBe(false)
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

  it('an audit the person set aside holds nothing (not its unseen findings, not a review that has not run), says so, and asking for it again brings the hold back', async () => {
    const { wf, state } = make()
    state.pick = () => ({ id: 'f', name: 'F', steps: [{ id: 'plan', kind: 'plan', name: 'Plan' }, { id: 'build', kind: 'work', name: 'Build' }, { id: 'review', kind: 'audit', name: 'Review' }, { id: 'land', kind: 'merge', name: 'Land' }] })
    wf.begin('a1', 'Add a toggle')
    wf.submitPlan('a1', '.agent-world/plan.md', PLAN)
    wf.decide(wf.runs()[0]!.id, 'approved')
    expect(wf.landingHold('a1', 'h1')).toEqual(['The review has not run for this branch yet.'])
    wf.asideAudit('a1')
    expect(wf.landingHold('a1', 'h1')).toBeNull()
    expect(wf.mergeCheck('a1', 'h1')).toMatchObject({ asideAudit: true, blocking: [] })
    wf.undoAsideAudit('a1')
    expect(wf.landingHold('a1', 'h1')).toEqual(['The review has not run for this branch yet.'])
    state.reply = async () => ({ text: '{"findings":[{"kind":"guess-wrong","text":"Saved in localStorage."}]}' })
    await wf.runAudit('a1', 'h1', 'diff --git a/a.ts b/a.ts\n+x\n')
    expect(wf.landingHold('a1', 'h1')).toEqual(['1 audit finding has not been seen.'])
    wf.asideAudit('a1')
    expect(wf.landingHold('a1', 'h1')).toBeNull()
    expect(wf.mergeCheck('a1', 'h1')).toMatchObject({ asideAudit: true, blocking: [], audit: { state: 'done' } })
    wf.undoAsideAudit('a1')
    expect(wf.mergeCheck('a1', 'h1')).toMatchObject({ asideAudit: false, blocking: ['1 audit finding has not been seen.'] })
  })

  it('a run that follows no workflow can set its audit aside too', async () => {
    const { wf, state } = make()
    wf.begin('a1', 'Add a toggle')
    wf.submitPlan('a1', '.agent-world/plan.md', PLAN)
    wf.decide(wf.runs()[0]!.id, 'approved')
    state.reply = async () => ({ text: '{"findings":[{"kind":"guess-wrong","text":"Saved in localStorage."}]}' })
    await wf.runAudit('a1', 'h1', 'diff --git a/a.ts b/a.ts\n+x\n')
    wf.asideAudit('a1')
    expect(wf.mergeCheck('a1', 'h1')).toMatchObject({ asideAudit: true, blocking: [] })
    wf.undoAsideAudit('a1')
    expect(wf.mergeCheck('a1', 'h1')).toMatchObject({ asideAudit: false, blocking: ['1 audit finding has not been seen.'] })
  })

  it('holds the base branch while the review has not run or is still running, and then for the findings not seen, but not for a review that failed or cannot run', async () => {
    const { wf, state } = make()
    wf.begin('a1', 'Add a toggle')
    wf.submitPlan('a1', '.agent-world/plan.md', PLAN)
    wf.decide(wf.runs()[0]!.id, 'approved')
    expect(wf.landingHold('a1', 'h1')).toEqual(['The review has not run for this branch yet.'])
    expect(wf.landingHold('a1', 'h1', { auditable: false })).toBeNull()
    let release!: () => void
    state.reply = () => new Promise((r) => (release = () => r({ text: '{"findings":[{"kind":"guess-wrong","text":"Saved in localStorage."}]}' })))
    const audit = wf.runAudit('a1', 'h1', 'diff --git a/a.ts b/a.ts\n+x\n')
    expect(wf.landingHold('a1', 'h1')).toEqual(['The review is still running.'])
    release()
    await audit
    expect(wf.landingHold('a1', 'h1')).toEqual(['1 audit finding has not been seen.'])
    wf.seen('a1', 'h1', [0])
    expect(wf.landingHold('a1', 'h1')).toBeNull()
    state.reply = async () => ({ text: 'not json' })
    await wf.runAudit('a1', 'h2', 'diff --git a/a.ts b/a.ts\n+y\n')
    expect(wf.landingHold('a1', 'h2')).toBeNull()
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
    expect(wf.mergeCheck('a1', 'h1', { auditable: false })!.audit).toEqual({ state: 'off', reason: 'no-model' })
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

  it('holds the base branch for git itself, for the reasons that hold Land, until the person allows that head and no other', () => {
    const { wf, state } = make()
    expect(wf.landingHold('a1', 'h1')).toBeNull()
    wf.begin('a1', 'Add a toggle')
    expect(wf.landingHold('a1', 'h1')).toEqual(['No plan was approved for this task.'])
    wf.allowLanding('a1', 'h1')
    expect(wf.landingHold('a1', 'h1')).toBeNull()
    expect(wf.landingHold('a1', 'h2')).toEqual(['No plan was approved for this task.'])
    state.mergeGate = false
    expect(wf.landingHold('a1', 'h2')).toBeNull()
  })

  it('lets the base branch move once the plan was approved, with nothing for the person to allow', () => {
    const { wf } = make()
    wf.begin('a1', 'Add a toggle')
    wf.decide(wf.runs()[0]!.id, 'released')
    expect(wf.landingHold('a1', 'h1')).toBeNull()
  })

  describe('a pull request step, which holds the push of the branch', () => {
    const pull = (gate?: 'auto' | 'approve'): RunWorkflow => ({ id: 'p', name: 'P', steps: [{ id: 'plan', kind: 'plan', name: 'Plan' }, { id: 'build', kind: 'work', name: 'Build' }, { id: 'review', kind: 'audit', name: 'Review' }, { id: 'pr', kind: 'pr', name: 'Pull request', ...(gate && { gate }) }] })

    it('holds for the same reasons Land does, says which landing the run ends in, and its own gate decides over the switch', () => {
      const run = (w: RunWorkflow, mergeGate = true) => {
        const { wf, state } = make()
        state.mergeGate = mergeGate
        state.pick = () => w
        wf.begin('a1', 'Add a toggle')
        return wf
      }
      const wf = run(pull())
      expect(wf.landKind('a1')).toBe('pr')
      expect(wf.mergeCheck('a1', 'h1')).toMatchObject({ land: 'pr', blocking: ['No plan was approved for this task.'] })
      expect(wf.landingHold('a1', 'h1')).toEqual(['No plan was approved for this task.'])
      expect(run(pull(), false).landingHold('a1', 'h1')).toBeNull()
      expect(run(pull('approve'), false).landingHold('a1', 'h1')).toEqual(['No plan was approved for this task.'])
      expect(run(pull('auto'), true).landingHold('a1', 'h1')).toBeNull()
    })

    it('ends the run when the push went through, recorded like a landing', () => {
      const { wf, state } = make()
      state.pick = () => pull()
      wf.begin('a1', 'Add a toggle')
      wf.decide(wf.runs()[0]!.id, 'released')
      wf.landing('a1', 'h1', { anyway: true })
      expect(wf.runs()[0]!.landed).toMatchObject({ head: 'h1', how: 'checked' })
    })

    it('ends the run on a push even when its gate is auto and nothing was checked, so it does not wait for ever', () => {
      const { wf, state } = make()
      state.pick = () => pull('auto')
      wf.begin('a1', 'Add a toggle')
      wf.landing('a1', 'h1', { anyway: true })
      expect(wf.runs()[0]!.landed).toMatchObject({ head: 'h1', how: 'checked', held: [] })
    })

    it('records a push that skipped the hold as pushed anyway, with that reason after whatever held it, even when nothing did', () => {
      const run = (w: RunWorkflow) => {
        const { wf, state } = make()
        state.pick = () => w
        wf.begin('a1', 'Add a toggle')
        return wf
      }
      const held = run(pull())
      held.landing('a1', 'h1', { anyway: true, unchecked: true })
      expect(held.runs()[0]!.landed).toMatchObject({ head: 'h1', how: 'anyway', held: ['No plan was approved for this task.', 'Pushed without the hold: git push --no-verify.'] })
      const clear = run(pull('auto'))
      clear.landing('a1', 'h1', { anyway: true, unchecked: true })
      expect(clear.runs()[0]!.landed).toMatchObject({ how: 'anyway', held: ['Pushed without the hold: git push --no-verify.'] })
    })

    it('says whether a head was already recorded as pushed, so a push the office let through is not recorded twice', () => {
      const { wf, state } = make()
      state.pick = () => pull('auto')
      wf.begin('a1', 'Add a toggle')
      expect(wf.landedHead('a1', 'h1')).toBe(false)
      wf.landing('a1', 'h1', { anyway: true })
      expect(wf.landedHead('a1', 'h1')).toBe(true)
      expect(wf.landedHead('a1', 'h2')).toBe(false)
    })

    it('is not what a merge workflow, or a run with no workflow, ends in', () => {
      const { wf, state } = make()
      state.pick = () => ({ id: 'f', name: 'F', steps: [{ id: 'build', kind: 'work', name: 'Build' }, { id: 'land', kind: 'merge', name: 'Land' }] })
      wf.begin('a1', 'Task')
      expect(wf.landKind('a1')).toBe('merge')
      expect(make().wf.landKind('a1')).toBeUndefined()
    })
  })

  it('forgets the allowance once the branch has landed, so the next head is held again', () => {
    const { wf } = make()
    wf.begin('a1', 'Add a toggle')
    wf.allowLanding('a1', 'h1')
    wf.landing('a1', 'h1', { anyway: true })
    expect(wf.landingHold('a1', 'h1')).toEqual(['No plan was approved for this task.'])
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

describe('the economy dial: a plan is optional, but one that was handed in is still gated', () => {
  it('holds no edit while no plan was submitted, and holds them again once one is waiting or sent back', () => {
    const { wf, state } = make()
    state.dial = 'economy'
    wf.begin('a1', 'Fix a typo')
    expect(wf.editBlock('a1', '/w/src/a.ts', '/w')).toBeNull()
    wf.submitPlan('a1', '.agent-world/plan.md', PLAN)
    expect(wf.editBlock('a1', '/w/src/a.ts', '/w')).toContain('waiting')
    wf.decide(wf.runs()[0]!.id, 'changes')
    expect(wf.editBlock('a1', '/w/src/a.ts', '/w')).toContain('asked for changes')
    state.dial = 'balanced'
    wf.begin('a2', 'Other')
    expect(wf.editBlock('a2', '/w/src/a.ts', '/w')).toContain('approved first')
  })

  it('does not hold landing for a plan that was never submitted, but does for one that is waiting', () => {
    const { wf, state } = make()
    state.dial = 'economy'
    wf.begin('a1', 'Fix a typo')
    expect(wf.mergeCheck('a1', 'h1')).toMatchObject({ plan: 'not-needed', blocking: [] })
    wf.submitPlan('a1', '.agent-world/plan.md', PLAN)
    expect(wf.mergeCheck('a1', 'h1')).toMatchObject({ plan: 'waiting', blocking: ['The plan is still waiting for your approval.'] })
  })
})

const GAPS = '{"gaps":[{"question":"Should the toggle follow the system setting?","options":["Follow the system","Always manual"]}]}'

describe('the intent check at the max dial', () => {
  it('asks a small model what the plan leaves open about the request, under the agent, and gives back its questions with the cost', async () => {
    const { wf, state } = make()
    state.dial = 'max'
    wf.begin('a1', 'Add a toggle')
    state.reply = async () => ({ text: GAPS, cost: 0.0006, model: 'claude-haiku-5-5' })
    const check = await wf.intentCheck('a1', PLAN, 'add dark mode to the app')
    expect(state.askedFor).toEqual(['a1'])
    expect(state.models).toEqual(['haiku'])
    expect(state.asked[0]).toContain('add dark mode to the app')
    expect(state.asked[0]).toContain('Add a toggle.')
    expect(check).toEqual({ questions: [{ text: 'Should the toggle follow the system setting?', options: ['Follow the system', 'Always manual'], source: 'check' }], cost: 0.0006, model: 'claude-haiku-5-5' })
  })

  it('asks nothing below max, with workflows off, with no open task, or for a plan that will be refused anyway', async () => {
    const { wf, state } = make()
    wf.begin('a1', 'Add a toggle')
    for (const dial of ['economy', 'balanced'] as const) {
      state.dial = dial
      expect(await wf.intentCheck('a1', PLAN, 'req')).toBeUndefined()
    }
    state.dial = 'max'
    expect(await wf.intentCheck('a1', '## Goal\nOnly a goal.\n', 'req')).toBeUndefined()
    expect(await wf.intentCheck('a2', PLAN, 'req')).toBeUndefined()
    state.enabled = false
    expect(await wf.intentCheck('a1', PLAN, 'req')).toBeUndefined()
    expect(state.asked).toEqual([])
  })

  it('a model that throws or answers with something unreadable gives a failure the plan goes ahead with', async () => {
    const { wf, state } = make()
    state.dial = 'max'
    wf.begin('a1', 'Add a toggle')
    state.reply = async () => {
      throw new Error('claude timed out')
    }
    expect(await wf.intentCheck('a1', PLAN, 'req')).toEqual({ failed: 'claude timed out' })
    state.reply = async () => ({ text: 'Looks clear to me.' })
    expect(await wf.intentCheck('a1', PLAN, 'req')).toEqual({ failed: 'The reply was not a list of gaps.' })
  })

  it('submitPlan puts the check\'s questions after the agent\'s own, marked as the check\'s, leaves out one already asked, and keeps what the check cost', () => {
    const { wf } = make()
    wf.begin('a1', 'Add a toggle')
    const dup = { text: 'every window or this one?', options: ['x'], source: 'check' as const }
    const added = { text: 'Follow the system?', options: ['Yes', 'No'], source: 'check' as const }
    const r = wf.submitPlan('a1', '.agent-world/plan.md', PLAN, { questions: [dup, added], cost: 0.0006, model: 'claude-haiku-5-5' })
    expect(r.questions).toBe(2)
    const plan = wf.runs()[0]!.rounds[0]!.plan!
    expect(plan.readback.questions.map((q) => q.text)).toEqual(['Every window or this one?', 'Follow the system?'])
    expect(plan.readback.questions.map((q) => q.source)).toEqual([undefined, 'check'])
    expect(plan.check).toEqual({ added: 1, cost: 0.0006, model: 'claude-haiku-5-5' })
  })

  it('submitPlan with a failed check records the failure and the plan is exactly the agent\'s', () => {
    const { wf } = make()
    wf.begin('a1', 'Add a toggle')
    expect(wf.submitPlan('a1', '.agent-world/plan.md', PLAN, { failed: 'timed out' }).questions).toBe(1)
    expect(wf.runs()[0]!.rounds[0]!.plan).toMatchObject({ check: { failed: 'timed out' }, readback: { questions: [{ text: 'Every window or this one?' }] } })
  })
})

const BUG_FIX: RunWorkflow = { id: 'bug-fix', name: 'Bug fix', hash: 'h1', steps: [{ id: 'plan', kind: 'plan', name: 'Plan', gate: 'approve' }, { id: 'fix', kind: 'work', name: 'Fix' }, { id: 'ok', kind: 'approve', name: 'Your review', gate: 'approve' }, { id: 'land', kind: 'merge', name: 'Land' }] }

describe('a task that follows a workflow', () => {
  it('begins with the workflow the project picks, or the one the agent asked for, and keeps it as it was then', () => {
    const { wf, state } = make()
    state.pick = (id) => ({ ...BUG_FIX, id: id ?? 'standard' })
    wf.begin('a1', 'Fix it')
    wf.begin('a2', 'Other', { workflow: 'bug-fix' })
    expect(state.picked).toEqual([undefined, 'bug-fix'])
    expect(wf.runs().map((r) => r.workflow?.id)).toEqual(['standard', 'bug-fix'])
    expect(wf.runs()[1]!.workflow!.steps.map((s) => s.id)).toEqual(['plan', 'fix', 'ok', 'land'])
  })

  it('a follow-up round goes on with the same workflow, read again by its id and not chosen afresh, and a run with no pick has no workflow', () => {
    const { wf, state } = make()
    wf.begin('a1', 'No pick')
    expect(wf.runs()[0]!.workflow).toBeUndefined()
    state.pick = () => BUG_FIX
    wf.begin('a2', 'Task')
    wf.done('a2')
    state.picked.length = 0
    wf.begin('a2', 'More', { followUp: true })
    expect(state.picked).toEqual(['bug-fix'])
    expect(wf.runs()[1]!.rounds).toHaveLength(2)
    expect(wf.runs()[1]!.workflow!.id).toBe('bug-fix')
  })
})

describe('the skills a task\'s workflow names', () => {
  const WITH_SKILLS: RunWorkflow = { id: 'skilled', name: 'Skilled', steps: [{ id: 'fix', kind: 'work', name: 'Fix', skills: ['tdd', 'review'] }, { id: 'again', kind: 'work', name: 'Again', skills: ['review'] }, { id: 'land', kind: 'merge', name: 'Land' }] }

  it('are the agent\'s while its task is open, each once, and nobody else\'s', () => {
    const { wf, state } = make()
    state.pick = () => WITH_SKILLS
    expect(wf.skillsOf('a1')).toEqual([])
    wf.begin('a1', 'Fix it')
    expect(wf.skillsOf('a1')).toEqual(['tdd', 'review'])
    expect(wf.skillsOf('a2')).toEqual([])
  })

  it('end when the task does, and a task with no workflow names none', () => {
    const { wf, state } = make()
    wf.begin('a2', 'No pick')
    expect(wf.skillsOf('a2')).toEqual([])
    state.pick = () => WITH_SKILLS
    wf.begin('a1', 'Fix it')
    wf.done('a1')
    expect(wf.skillsOf('a1')).toEqual([])
  })
})

describe('reporting a step done', () => {
  const TWO_WORKS: RunWorkflow = { id: 'two', name: 'Two', steps: [{ id: 'a', kind: 'work', name: 'First' }, { id: 'b', kind: 'work', name: 'Second' }, { id: 'ok', kind: 'approve', name: 'Your review', gate: 'approve' }, { id: 'land', kind: 'merge', name: 'Land' }] }
  const started = (flow: RunWorkflow = TWO_WORKS) => {
    const t = make()
    t.state.pick = () => flow
    t.wf.begin('a1', 'Task')
    return t
  }
  const logged = (wf: Workflows) => wf.runs()[0]!.rounds.at(-1)!.steps.map((s) => `${s.step}:${s.state}`)

  it('marks the first work step still open, or the one named, and says what now waits for the person', () => {
    const { wf } = started()
    expect(wf.stepDone('a1')).toEqual({ done: 'a' })
    expect(wf.stepDone('a1', 'b')).toEqual({ done: 'b', waiting: 'Your review' })
    expect(logged(wf)).toEqual(['a:done', 'b:done'])
  })

  it('refuses a step that does not exist, is not a work step, is already done, or a task with no steps to report', () => {
    const { wf } = started()
    expect(() => wf.stepDone('a1', 'nope')).toThrow('This workflow has no step "nope". Its steps: a, b, ok, land.')
    expect(() => wf.stepDone('a1', 'land')).toThrow('"land" is not a step you report: the app or the person does it.')
    wf.stepDone('a1', 'a')
    expect(() => wf.stepDone('a1', 'a')).toThrow('"a" is already done.')
    wf.stepDone('a1')
    expect(() => wf.stepDone('a1')).toThrow('Every step you do is already reported done.')
    const bare = make()
    bare.wf.begin('a1', 'No steps')
    expect(() => bare.wf.stepDone('a1')).toThrow('This task has no steps to report.')
    expect(() => bare.wf.stepDone('a2')).toThrow('No task is open.')
  })

  it('after the person sent the work back, reporting again reports the work done once more', () => {
    const { wf, state } = started()
    wf.stepDone('a1')
    wf.stepDone('a1')
    wf.approveStep(wf.runs()[0]!.id, 'ok', 'changes', { note: 'smaller' })
    state.t += 100
    expect(wf.stepDone('a1')).toEqual({ done: 'b', waiting: 'Your review' })
    expect(logged(wf)).toEqual(['a:done', 'b:done', 'ok:changes', 'b:done'])
  })
})

describe('approving a step, and finishing the task', () => {
  const FLOW: RunWorkflow = { id: 'f', name: 'F', steps: [{ id: 'a', kind: 'work', name: 'First' }, { id: 'b', kind: 'work', name: 'Second', gate: 'approve' }, { id: 'ok', kind: 'approve', name: 'Your review', gate: 'approve' }, { id: 'land', kind: 'merge', name: 'Land' }] }
  const started = () => {
    const t = make()
    t.state.pick = () => FLOW
    t.wf.begin('a1', 'Task')
    return { ...t, run: t.wf.runs()[0]!.id, log: () => t.wf.runs()[0]!.rounds.at(-1)!.steps.map((s) => `${s.step}:${s.state}${s.implicit ? '*' : ''}`) }
  }

  it('approves a step that waits for the person, and refuses one that does not, or a run that is not there', () => {
    const { wf, run, log } = started()
    expect(() => wf.approveStep(run, 'ok', 'approved')).toThrow('Nothing is waiting for approval there.')
    wf.stepDone('a1')
    wf.stepDone('a1')
    wf.approveStep(run, 'b', 'approved')
    wf.approveStep(run, 'ok', 'approved', { note: 'good' })
    expect(log()).toEqual(['a:done', 'b:done', 'b:approved', 'ok:approved'])
    expect(wf.runs()[0]!.rounds[0]!.steps.at(-1)!.note).toBe('good')
    expect(() => wf.approveStep(run, 'ok', 'approved')).toThrow('Nothing is waiting for approval there.')
    expect(() => wf.approveStep('nope', 'ok', 'approved')).toThrow('No such run.')
  })

  it('work the person sends back after the task was finished opens the task again; an approval does not', () => {
    const { wf, run } = started()
    wf.stepDone('a1')
    wf.stepDone('a1')
    wf.approveStep(run, 'b', 'approved')
    wf.done('a1', 'Done.')
    expect(wf.runs()[0]!.status).toBe('done')
    wf.approveStep(run, 'ok', 'approved')
    expect(wf.runs()[0]!.status).toBe('done')
    const again = started()
    again.wf.stepDone('a1')
    again.wf.stepDone('a1')
    again.wf.approveStep(again.run, 'b', 'approved')
    again.wf.done('a1', 'Done.')
    again.wf.approveStep(again.run, 'ok', 'changes', { note: 'add a test' })
    expect(again.wf.runs()[0]!.status).toBe('open')
    expect(again.wf.stepDone('a1').done).toBe('b')
  })

  it('work sent back by an approve step is reported again by its id as well as with no id', () => {
    const { wf, run } = started()
    wf.stepDone('a1')
    wf.stepDone('a1')
    wf.approveStep(run, 'b', 'approved')
    wf.approveStep(run, 'ok', 'changes', { note: 'add a test' })
    expect(() => wf.stepDone('a1', 'a')).toThrow('Work was sent back: report the fix with step_done("b"), or with no id.')
    expect(wf.stepDone('a1', 'b').done).toBe('b')
  })

  it('finishing the task marks the work steps the agent never reported as done by the app, and leaves the ones it did', () => {
    const { wf, log } = started()
    wf.stepDone('a1', 'a')
    wf.done('a1', 'All done.')
    expect(log()).toEqual(['a:done', 'b:done*'])
    expect(wf.runs()[0]!.status).toBe('done')
  })
})

describe('the plan hold follows the workflow', () => {
  const flow = (plan?: { gate?: 'auto' | 'approve' }): RunWorkflow => ({ id: 'f', name: 'F', steps: [...(plan ? [{ id: 'plan', kind: 'plan' as const, name: 'Plan', ...plan }] : []), { id: 'build', kind: 'work', name: 'Build' }, { id: 'land', kind: 'merge', name: 'Land' }] })
  const held = (w: RunWorkflow | undefined, planGate: boolean) => {
    const { wf, state } = make()
    state.planGate = planGate
    state.pick = () => w
    wf.begin('a1', 'Task')
    return wf.editBlock('a1', '/w/src/a.ts', '/w') !== null
  }

  it('a plan step that names its gate decides, whatever the Settings switch says', () => {
    expect([held(flow({ gate: 'auto' }), true), held(flow({ gate: 'approve' }), false)]).toEqual([false, true])
  })

  it('a plan step with no gate follows the switch, a workflow with no plan step holds nothing, and a run with no workflow follows the switch as before', () => {
    expect([held(flow({}), true), held(flow({}), false)]).toEqual([true, false])
    expect(held(flow(), true)).toBe(false)
    expect([held(undefined, true), held(undefined, false)]).toEqual([true, false])
  })
})

describe('the merge gate follows the workflow', () => {
  const flow = (o: { plan?: boolean; audit?: boolean; merge?: { gate?: 'auto' | 'approve' } | false; review?: boolean } = {}): RunWorkflow => ({
    id: 'f',
    name: 'F',
    steps: [
      ...(o.plan === false ? [] : [{ id: 'plan', kind: 'plan' as const, name: 'Plan' }]),
      { id: 'build', kind: 'work' as const, name: 'Build' },
      ...(o.review ? [{ id: 'ok', kind: 'approve' as const, name: 'Your review', gate: 'approve' as const }] : []),
      ...(o.audit === false ? [] : [{ id: 'audit', kind: 'audit' as const, name: 'Audit' }]),
      ...(o.merge === false ? [] : [{ id: 'land', kind: 'merge' as const, name: 'Land', ...o.merge }])
    ]
  })
  const started = (w: RunWorkflow, switches: { mergeGate?: boolean; planGate?: boolean } = {}) => {
    const t = make()
    Object.assign(t.state, switches)
    t.state.pick = () => w
    t.wf.begin('a1', 'Task')
    return t
  }

  it('a merge step that names its gate decides, whatever the Settings switch says, and one with no gate follows the switch', () => {
    expect(started(flow({ merge: { gate: 'auto' } })).wf.mergeCheck('a1', 'h1')).toBeNull()
    expect(started(flow({ merge: { gate: 'approve' } }), { mergeGate: false }).wf.mergeCheck('a1', 'h1')).not.toBeNull()
    expect(started(flow({ merge: {} }), { mergeGate: false }).wf.mergeCheck('a1', 'h1')).toBeNull()
    expect(started(flow({ merge: false }), { mergeGate: true }).wf.mergeCheck('a1', 'h1')).not.toBeNull()
  })

  it('a workflow with no plan step needs no plan to land, and one with no audit step has no audit and asks no model', async () => {
    const t = started(flow({ plan: false, audit: false }))
    expect(t.wf.mergeCheck('a1', 'h1')).toMatchObject({ plan: 'not-needed', audit: { state: 'off', reason: 'workflow' }, blocking: [] })
    await t.wf.runAudit('a1', 'h1', 'diff --git a/a.ts b/a.ts\n+x\n')
    expect(t.state.asked).toEqual([])
  })

  it('a step the person has not approved holds landing and is named; approving it lifts the hold', () => {
    const t = started(flow({ plan: false, review: true }))
    expect(t.wf.mergeCheck('a1', 'h1')!.blocking).toEqual([])
    t.wf.stepDone('a1')
    expect(t.wf.mergeCheck('a1', 'h1')!.blocking).toEqual(['"Your review" has not been approved.'])
    t.wf.approveStep(t.wf.runs()[0]!.id, 'ok', 'approved')
    expect(t.wf.mergeCheck('a1', 'h1')!.blocking).toEqual([])
  })

  it('says whether the plan comes first for the task that is open, by the same rule', () => {
    const wanted = (plan: { gate?: 'auto' | 'approve' } | undefined, planGate: boolean) => {
      const t = started(flow({ merge: {} }), { planGate })
      t.state.pick = () => ({ ...flow(), steps: [...(plan ? [{ id: 'plan', kind: 'plan' as const, name: 'Plan', ...plan }] : []), ...flow({ plan: false }).steps] })
      t.wf.begin('a2', 'Task')
      return t.wf.planWanted('a2')
    }
    expect([wanted({ gate: 'auto' }, true), wanted({ gate: 'approve' }, false), wanted({}, true), wanted({}, false), wanted(undefined, true)]).toEqual([false, true, true, false, false])
    expect(make().wf.planWanted('a1')).toBe(false)
  })
})

describe('running a workflow\'s checks', () => {
  const FLOW: RunWorkflow = { id: 'c', name: 'C', hash: 'h1', scope: 'project', steps: [{ id: 'build', kind: 'work', name: 'Build' }, { id: 'tests', kind: 'check', name: 'Tests pass', run: 'npm test', gate: 'pass', retries: 2 }, { id: 'lint', kind: 'check', name: 'Lint', run: 'npm run lint' }, { id: 'land', kind: 'merge', name: 'Land' }] }
  const started = (built = true) => {
    const t = make()
    t.state.pick = () => FLOW
    t.wf.begin('a1', 'Task')
    if (built) t.wf.stepDone('a1', 'build')
    return t
  }
  const stateOf = (wf: Workflows, id: string, head = 'h1', approved = true) => stepStates(wf.runs()[0]!, { auditOn: false, head, approved }).find((s) => s.id === id)!.state

  it('runs each check that is due, in order and in the agent\'s worktree, and goes on to the next once one passes', async () => {
    const { wf, state } = started()
    expect(await wf.runChecks('a1', 'h1')).toEqual({ ran: 2, passed: [{ name: 'Tests pass', run: 'npm test', ms: 1200 }, { name: 'Lint', run: 'npm run lint', ms: 1200 }] })
    expect(state.ran).toEqual(['npm test @ /w', 'npm run lint @ /w'])
    expect([stateOf(wf, 'tests'), stateOf(wf, 'lint')]).toEqual(['passed', 'passed'])
    expect(wf.runs()[0]!.rounds[0]!.checks.map((c) => [c.step, c.attempt, c.ok, c.head])).toEqual([['tests', 1, true, 'h1'], ['lint', 1, true, 'h1']])
  })

  it('does nothing while the work before a check is not reported done', async () => {
    const { wf, state } = started(false)
    expect(await wf.runChecks('a1', 'h1')).toEqual({ ran: 0 })
    expect(state.ran).toEqual([])
  })

  it('a task the agent already finished is opened again when its check sends work back, so the fix can be reported, and stays finished when the check passes', async () => {
    const passing = started()
    passing.wf.done('a1', 'Done.')
    await passing.wf.runChecks('a1', 'h1')
    expect(passing.wf.runs()[0]!.status).toBe('done')
    const { wf, state } = started()
    wf.done('a1', 'Done.')
    expect(wf.runs()[0]!.status).toBe('done')
    state.results = [{ exit: 1, tail: 'FAIL a' }]
    const first = await wf.runChecks('a1', 'h1')
    expect(first.sendBack).toContain('failed (try 1 of 3)')
    expect(wf.runs()[0]!.status).toBe('open')
    expect(wf.stepDone('a1').done).toBe('build')
    await wf.runChecks('a1', 'h2')
    expect(stateOf(wf, 'tests', 'h2')).toBe('passed')
  })

  it('a task the agent finishes while its check is still running is opened again when that check fails: it is the run as it is now that counts', async () => {
    const { wf, state } = started()
    let release = () => {}
    state.gate = new Promise<void>((r) => (release = r))
    state.results = [{ exit: 1, tail: 'FAIL a' }]
    const running = wf.runChecks('a1', 'h1')
    await new Promise((r) => setTimeout(r, 0))
    wf.done('a1', 'Done.')
    expect(wf.runs()[0]!.status).toBe('done')
    release()
    expect((await running).sendBack).toContain('failed (try 1 of 3)')
    expect(wf.runs()[0]!.status).toBe('open')
    expect(wf.stepDone('a1').done).toBe('build')
  })

  it('a finished task opened again by a failing check stays open while the check keeps failing, and the person is asked when it runs out of tries', async () => {
    const { wf, state } = started()
    state.results = [{ exit: 1, tail: 'a' }, { exit: 1, tail: 'b' }, { exit: 1, tail: 'c' }]
    wf.done('a1', 'Done.')
    await wf.runChecks('a1', 'h1')
    await wf.runChecks('a1', 'h2')
    const last = await wf.runChecks('a1', 'h3')
    expect(last.gaveUp).toBeDefined()
    expect(wf.runs()[0]!.status).toBe('open')
  })

  it('the agent that reports the fix by the step\'s id, as the brief taught it to, is heard like one that names nothing; a step with nothing sent back is still done', async () => {
    const { wf, state } = started()
    expect(() => wf.stepDone('a1', 'build')).toThrow('"build" is already done.')
    state.results = [{ exit: 1, tail: 'FAIL a' }]
    await wf.runChecks('a1', 'h1')
    expect(wf.stepDone('a1', 'build')).toMatchObject({ done: 'build', checking: true })
    expect(wf.runs()[0]!.rounds[0]!.steps.filter((x) => x.step === 'build').map((x) => x.state)).toEqual(['done', 'done'])
    // Once the check passes there is nothing to report again.
    await wf.runChecks('a1', 'h2')
    expect(() => wf.stepDone('a1', 'build')).toThrow('"build" is already done.')
  })

  it('an agent that closed the task before it heard its check had failed can still report the fix: the task opens again', async () => {
    const { wf, state } = started()
    state.results = [{ exit: 1, tail: 'FAIL a' }]
    await wf.runChecks('a1', 'h1')
    wf.done('a1', 'all done')
    expect(wf.runs()[0]!.status).toBe('done')
    expect(wf.stepDone('a1', 'build')).toMatchObject({ done: 'build', checking: true })
    expect(wf.runs()[0]!.status).toBe('open')
    // With nothing sent back, a closed task stays closed.
    await wf.runChecks('a1', 'h2')
    wf.done('a1')
    expect(() => wf.stepDone('a1', 'build')).toThrow('No task is open.')
  })

  it('the refusal of a step that is done says how to report a fix when a check was sent back, and names the step to use', async () => {
    const t = make()
    t.state.pick = () => ({ ...FLOW, steps: [{ id: 'first', kind: 'work', name: 'First' }, { id: 'build', kind: 'work', name: 'Build' }, ...FLOW.steps.slice(1)] })
    t.wf.begin('a1', 'Task')
    t.wf.stepDone('a1', 'first')
    t.wf.stepDone('a1', 'build')
    t.state.results = [{ exit: 1, tail: 'FAIL a' }]
    await t.wf.runChecks('a1', 'h1')
    expect(() => t.wf.stepDone('a1', 'first')).toThrow('"first" is already done. A check was sent back: report the fix with step_done("build"), or with no id.')
    expect(t.wf.stepDone('a1', 'build').done).toBe('build')
  })

  it('a failing check is sent back to the agent with what it printed, again after the agent reports once more, and when it has no tries left the person is asked', async () => {
    const { wf, state } = started()
    state.results = [{ exit: 1, tail: 'FAIL a' }, { exit: 1, tail: 'FAIL b' }, { exit: 2, tail: 'FAIL c' }]
    const first = await wf.runChecks('a1', 'h1')
    expect(first).toEqual({ ran: 1, sendBack: 'The check "Tests pass" failed (try 1 of 3): `npm test` exited with 1. What it printed last:\nFAIL a\nFix it, commit, then call step_done again. This is still the same task, so do not call task_begin again.' })
    expect(stateOf(wf, 'tests')).toBe('running')
    const second = await wf.runChecks('a1', 'h2')
    expect(second.sendBack).toContain('(try 2 of 3)')
    const third = await wf.runChecks('a1', 'h3')
    expect(third).toEqual({ ran: 1, gaveUp: 'The check "Tests pass" still fails after 3 tries. The person has been asked what to do; change nothing more until they answer.' })
    expect(stateOf(wf, 'tests', 'h3')).toBe('failed')
    state.ran.length = 0
    expect(await wf.runChecks('a1', 'h4')).toEqual({ ran: 0 })
    expect(state.ran).toEqual([])
  })

  it('a second request for the same commit does not run a failing check again or use up another try, unless the person asks for it to run again', async () => {
    const { wf, state } = started()
    state.results = [{ exit: 1, tail: 'FAIL a' }, { exit: 1, tail: 'FAIL b' }]
    expect((await wf.runChecks('a1', 'h1')).ran).toBe(1)
    state.ran.length = 0
    // The agent reports its step and the task in quick succession: both ask for the checks of the same commit.
    expect(await wf.runChecks('a1', 'h1')).toEqual({ ran: 0 })
    expect(state.ran).toEqual([])
    const run = wf.runs()[0]!
    wf.rerunCheck(run.id, 'tests')
    expect((await wf.runChecks('a1', 'h1')).sendBack).toContain('(try 1 of 3)')
  })

  it('does not run a project\'s commands the person has not approved, and says which check waits', async () => {
    const { wf, state } = started()
    state.approved = false
    expect(await wf.runChecks('a1', 'h1')).toEqual({ ran: 0, waitingApproval: 'Tests pass' })
    expect(state.ran).toEqual([])
    state.approved = true
    expect((await wf.runChecks('a1', 'h1')).ran).toBe(2)
  })

  it('runs again when the branch has moved since it passed, and a second request while one is running does not run it twice', async () => {
    const { wf, state } = started()
    await wf.runChecks('a1', 'h1')
    state.ran.length = 0
    expect((await wf.runChecks('a1', 'h2')).ran).toBe(2)
    expect(state.ran).toHaveLength(2)
    state.ran.length = 0
    expect((await wf.runChecks('a1', 'h2')).ran).toBe(0)
    const later = started()
    let release!: () => void
    later.state.gate = new Promise<void>((r) => (release = r))
    const a = later.wf.runChecks('a1', 'h1')
    const b = await later.wf.runChecks('a1', 'h1')
    release()
    await a
    expect(b.ran).toBe(0)
    expect(later.state.ran.filter((c) => c.startsWith('npm test'))).toHaveLength(1)
  })

  it('the person can skip a check, ask for it again after it ran out of tries, or decline the commands, and is refused what makes no sense', async () => {
    const { wf, state } = started()
    const run = wf.runs()[0]!.id
    state.results = [{ exit: 1 }, { exit: 1 }, { exit: 1 }]
    for (const h of ['h1', 'h2', 'h3']) await wf.runChecks('a1', h)
    expect(stateOf(wf, 'tests', 'h3')).toBe('failed')
    wf.rerunCheck(run, 'tests')
    expect(stateOf(wf, 'tests', 'h3')).toBe('running')
    state.results = [{ exit: 0 }]
    expect((await wf.runChecks('a1', 'h3')).ran).toBe(2)
    expect(() => wf.skipCheck(run, 'tests')).toThrow('That check already passed.')
    expect(() => wf.skipCheck(run, 'build')).toThrow('That is not a check.')
    expect(() => wf.skipCheck('nope', 'tests')).toThrow('No such run.')
    expect(() => wf.rerunCheck(run, 'build')).toThrow('That is not a check.')
  })

  it('skipping a check that has not passed passes it over, and declining the commands marks the checks that wait as failed', async () => {
    const a = started()
    a.state.results = [{ exit: 1 }, { exit: 1 }, { exit: 1 }]
    for (const h of ['h1', 'h2', 'h3']) await a.wf.runChecks('a1', h)
    a.wf.skipCheck(a.wf.runs()[0]!.id, 'tests')
    expect(stateOf(a.wf, 'tests', 'h3')).toBe('skipped')
    const b = started()
    b.state.approved = false
    expect(stateOf(b.wf, 'tests', 'h1', false)).toBe('waiting')
    b.wf.declineCommands(b.wf.runs()[0]!.id)
    expect(stateOf(b.wf, 'tests', 'h1', false)).toBe('failed')
  })

  const held = (wf: Workflows, head = 'h1') => wf.mergeCheck('a1', head)!.blocking.filter((b) => !b.includes('plan'))

  it('landing is held, by name, for a check that has not run, has not passed for this branch, failed on every try, was declined or waits for approval', async () => {
    const t = started(false)
    t.state.pick = () => ({ ...FLOW, steps: FLOW.steps.map((s) => (s.id === 'lint' ? { ...s, gate: 'auto' as const } : s)) })
    t.wf.begin('a2', 'Other')
    expect(t.wf.mergeCheck('a2', 'h1')!.blocking).toContain('"Tests pass" has not run yet.')
    t.wf.stepDone('a2', 'build')
    expect(t.wf.mergeCheck('a2', 'h1')!.blocking).toContain('"Tests pass" has not passed for the branch as it is now.')
    t.state.approved = false
    expect(t.wf.mergeCheck('a2', 'h1')!.blocking).toContain('"Tests pass" has not run: its commands are not approved.')
    t.wf.declineCommands(t.wf.runs().at(-1)!.id)
    expect(t.wf.mergeCheck('a2', 'h1')!.blocking).toContain('"Tests pass" did not run: you declined its commands.')
    t.state.approved = true
    t.wf.rerunCheck(t.wf.runs().at(-1)!.id, 'tests')
    t.state.results = [{ exit: 1 }, { exit: 1 }, { exit: 1 }]
    for (const h of ['h1', 'h2', 'h3']) await t.wf.runChecks('a2', h)
    expect(t.wf.mergeCheck('a2', 'h3')!.blocking).toContain('"Tests pass" failed after 3 tries.')
  })

  it('a passed or skipped check holds nothing, and a check whose gate is auto never holds landing', async () => {
    const { wf, state } = started()
    state.pick = () => FLOW
    await wf.runChecks('a1', 'h1')
    expect(held(wf)).toEqual([])
    const auto = started()
    auto.state.pick = () => ({ ...FLOW, steps: FLOW.steps.map((s) => (s.kind === 'check' ? { ...s, gate: 'auto' as const } : s)) })
    auto.wf.begin('a2', 'Third')
    auto.wf.stepDone('a2', 'build')
    expect(auto.wf.mergeCheck('a2', 'h1')!.blocking.filter((b) => b.includes('has not'))).toEqual([])
    const skipped = started()
    skipped.wf.skipCheck(skipped.wf.runs()[0]!.id, 'tests')
    skipped.wf.skipCheck(skipped.wf.runs()[0]!.id, 'lint')
    expect(held(skipped.wf)).toEqual([])
  })

  it('gives Finish a row per check: its state, what it ran, how long it took and how many times it failed', async () => {
    const { wf, state } = started()
    state.results = [{ exit: 1, tail: 'FAIL a' }, { exit: 0 }, { exit: 0 }]
    await wf.runChecks('a1', 'h1')
    await wf.runChecks('a1', 'h2')
    const rows = wf.mergeCheck('a1', 'h2')!.checks
    expect(rows).toEqual([
      { id: 'tests', name: 'Tests pass', run: 'npm test', state: 'passed', tries: 1, ms: 1200 },
      { id: 'lint', name: 'Lint', run: 'npm run lint', state: 'passed', ms: 1200 }
    ])
    const failed = started()
    failed.state.results = [{ exit: 1, tail: 'FAIL a' }]
    await failed.wf.runChecks('a1', 'h1')
    expect(failed.wf.mergeCheck('a1', 'h1')!.checks[0]).toEqual({ id: 'tests', name: 'Tests pass', run: 'npm test', state: 'running', tries: 1, ms: 1200, tail: 'FAIL a' })
  })

  it('when asked only for what is new (as Finish does), leaves alone a check that already ran for this branch, so looking at Finish never uses up its tries', async () => {
    const { wf, state } = started()
    state.results = [{ exit: 1 }]
    await wf.runChecks('a1', 'h1')
    state.ran.length = 0
    expect(await wf.runChecks('a1', 'h1', { fresh: true })).toEqual({ ran: 0 })
    expect(state.ran).toEqual([])
    expect((await wf.runChecks('a1', 'h2', { fresh: true })).ran).toBeGreaterThan(0)
  })

  it('says, when the agent reports its work, that the app is now running the checks that follow', () => {
    expect(started(false).wf.stepDone('a1', 'build')).toEqual({ done: 'build', checking: true })
    const none = make()
    none.state.pick = () => ({ id: 'n', name: 'N', steps: [{ id: 'build', kind: 'work', name: 'Build' }] })
    none.wf.begin('a1', 'Task')
    expect(none.wf.stepDone('a1')).toEqual({ done: 'build' })
  })

  it('after a check failed and the agent fixed it, reporting again is accepted and has the checks run once more, rather than refused as already done', async () => {
    const { wf, state } = started()
    state.results = [{ exit: 1, tail: 'FAIL' }]
    await wf.runChecks('a1', 'h1')
    expect(wf.stepDone('a1')).toEqual({ done: 'build', checking: true })
    expect((await wf.runChecks('a1', 'h2')).ran).toBe(2)
    expect(() => wf.stepDone('a1')).toThrow('Every step you do is already reported done.')
  })

  it('a merge step with gate auto turns off the plan and audit rules but not a check that must pass or a step the person must approve', async () => {
    const t = started()
    t.state.pick = () => ({ ...FLOW, steps: FLOW.steps.filter((s) => s.id !== 'lint').map((s) => (s.kind === 'merge' ? { ...s, gate: 'auto' as const } : s)) })
    t.wf.begin('a2', 'Other')
    t.wf.stepDone('a2', 'build')
    const check = t.wf.mergeCheck('a2', 'h1')!
    expect(check.blocking).toEqual(['"Tests pass" has not passed for the branch as it is now.'])
    expect(check).toMatchObject({ plan: 'not-needed', audit: { state: 'off', reason: 'gate' } })
    await t.wf.runChecks('a2', 'h1')
    // Nothing holds landing any more, but the check that passed is still listed for Finish.
    expect(t.wf.mergeCheck('a2', 'h1')).toMatchObject({ blocking: [], checks: [{ id: 'tests', state: 'passed' }] })
  })

  it('approving the commands after declining them lets the declined checks run, and leaves alone a check that failed on its tries', async () => {
    const { wf, state } = started()
    state.approved = false
    const run = wf.runs()[0]!.id
    wf.declineCommands(run)
    state.approved = true
    expect(await wf.runChecks('a1', 'h1')).toEqual({ ran: 0 })
    wf.commandsApproved(run)
    expect((await wf.runChecks('a1', 'h1')).ran).toBe(2)
    state.results = [{ exit: 1 }, { exit: 1 }, { exit: 1 }]
    const b = started()
    b.state.results = [{ exit: 1 }, { exit: 1 }, { exit: 1 }]
    for (const h of ['h1', 'h2', 'h3']) await b.wf.runChecks('a1', h)
    b.wf.commandsApproved(b.wf.runs()[0]!.id)
    expect(stateOf(b.wf, 'tests', 'h3')).toBe('failed')
  })
})

describe('when the app starts the audit by itself', () => {
  const STANDARD: RunWorkflow = { id: 'standard', name: 'Standard', steps: [{ id: 'plan', kind: 'plan', name: 'Plan' }, { id: 'build', kind: 'work', name: 'Build' }, { id: 'review', kind: 'audit', name: 'Audit' }, { id: 'land', kind: 'merge', name: 'Land' }] }
  const built = () => {
    const o = make()
    o.state.pick = () => STANDARD
    o.wf.begin('a1', 'Add a toggle')
    o.wf.submitPlan('a1', '.agent-world/plan.md', PLAN)
    o.wf.decide(o.wf.runs()[0]!.id, 'approved')
    return o
  }
  it('not while the agent is still building, once it reported its work, and not for a run with no workflow', () => {
    const { wf } = built()
    expect(wf.auditDue('a1', 'h1')).toBe(false)
    wf.stepDone('a1', 'build')
    expect(wf.auditDue('a1', 'h1')).toBe(true)
    const plain = make()
    plain.wf.begin('a1', 'No steps')
    expect(plain.wf.auditDue('a1', 'h1')).toBe(false)
  })
  it('once per run: a later commit (a new head) is not audited again by itself, only when the person asks', async () => {
    const { wf } = built()
    wf.stepDone('a1', 'build')
    await wf.runAudit('a1', 'h1', 'diff --git a/a.ts b/a.ts\n+x\n')
    expect(wf.auditDue('a1', 'h1')).toBe(false)
    expect(wf.auditDue('a1', 'h2')).toBe(false)
    // The person's own "Run the audit now" still audits the new head.
    await wf.runAudit('a1', 'h2', 'diff --git a/a.ts b/a.ts\n+y\n')
    expect(wf.mergeCheck('a1', 'h2')!.audit.state).toBe('done')
  })
})
