import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Dial } from '../../shared/workflows'
import type { RunWorkflow } from '../../shared/runs'
import { lanesOf, refusedAsk, stepStates } from '../../shared/steps'
import { Workflows } from './service'

type Reply = { text: string; cost?: number; tokens?: number; model?: string }
function make(opts: { enabled?: boolean } = {}) {
  const file = join(mkdtempSync(join(tmpdir(), 'aw-runs-')), 'runs.jsonl')
  const state = { enabled: opts.enabled ?? true, dial: 'balanced' as Dial, since: 0, t: 1000, n: 0, asked: [] as string[], askedFor: [] as string[], models: [] as string[], ran: [] as string[], approved: true, results: [] as { exit: number | null; timedOut?: boolean; tail?: string }[], gate: null as null | Promise<void>, picked: [] as (string | undefined)[], none: false, pick: ((): RunWorkflow | undefined => undefined) as (id?: string) => RunWorkflow | undefined, todoOf: ((): string | undefined => undefined) as (id: string) => string | undefined, reply: (async () => ({ text: '{"findings":[]}' })) as (prompt: string) => Promise<Reply> }
  const open = () =>
    new Workflows(file, {
      enabled: () => state.enabled,
      since: () => state.since,
      noWorkflow: () => state.none,
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

// Workflows that ask for nothing: a plan that says auto and a pull request that goes ahead by itself (AUTO), or the same with a merge, which is the person's own click (PLAN_AUTO).
const PLAN_AUTO: RunWorkflow = { id: 'pa', name: 'PA', steps: [{ id: 'plan', kind: 'plan', name: 'Plan', gate: 'auto' }, { id: 'build', kind: 'work', name: 'Build' }, { id: 'land', kind: 'merge', name: 'Land' }] }
const AUTO: RunWorkflow = { id: 'au', name: 'AU', steps: [{ id: 'plan', kind: 'plan', name: 'Plan', gate: 'auto' }, { id: 'build', kind: 'work', name: 'Build' }, { id: 'pr', kind: 'pr', name: 'Pull request', gate: 'auto' }] }

/** What an agent that did everything says: reports every step it has left, in order, then the task done. */
function finish(wf: Workflows, agent: string, summary?: string) {
  // At most as many reports as there are steps: a step sent back is reported again by the same call, which would never end.
  for (let i = 0; i < 12; i++) {
    try {
      wf.stepDone(agent)
    } catch {
      break
    }
  }
  wf.done(agent, summary)
}

describe('recording a task', () => {
  it('task_begin opens a run for the agent and task_done closes it, and both survive a restart', () => {
    const { wf, open } = make()
    wf.begin('a1', 'Fix the login redirect')
    expect(wf.runs()).toHaveLength(1)
    expect(wf.runs()[0]).toMatchObject({ agent: 'a1', name: 'ada', project: '/p', title: 'Fix the login redirect', status: 'open' })
    expect(wf.openCount()).toBe(1)
    finish(wf, 'a1', 'Done.')
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
    expect(() => finish(wf, 'a1')).toThrow('No task is open')
    expect(() => wf.begin('nobody', 'x')).toThrow('Unknown agent')
  })
})

describe('turning workflows off', () => {
  it('starts no new task, but a task already open can still be finished', () => {
    const { wf, state } = make()
    wf.begin('a1', 'Fix it')
    state.enabled = false
    expect(() => wf.begin('a2', 'New work')).toThrow('Workflows are off')
    finish(wf, 'a1', 'Fixed.')
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
    finish(wf, 'a1')
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
    finish(wf, 'a1')
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
    finish(wf, 'a1')
    wf.begin('a1', 'Same file', { followUp: true })
    finish(wf, 'a1')
    state.pick = () => undefined
    wf.begin('a1', 'File gone', { followUp: true })
    finish(wf, 'a1')
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
    finish(wf, 'a1')
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
    finish(wf, 'a1')
    wf.commit('a1', 'def456', 'chore: tidy')
    expect(wf.runs()[0]!.rounds[0]!.commits[0]).toMatchObject({ sha: 'def456', flagged: true })
  })

  it('with no workflow in the project nothing is recorded: no run starts from a commit, and the task is said to have no workflow to follow', () => {
    const { wf, state } = make()
    state.none = true
    wf.commit('a1', 'ccc333', 'feat: x')
    expect(wf.runs()).toEqual([])
    expect(wf.applies('a1')).toBe(false)
    expect(wf.applies('a1', 'bug-fix')).toBe(false)
    state.pick = (id) => (id === 'bug-fix' ? { id: 'bug-fix', name: 'Bug fix', steps: [{ id: 'build', kind: 'work', name: 'Build' }] } : undefined)
    expect(wf.applies('a1', 'bug-fix')).toBe(true)
    state.none = false
    expect(wf.applies('a1')).toBe(true)
  })

  describe('a new request while the agent\'s run is open', () => {
    it('is an item of that run, not another run: its title is kept, the todo it is on is linked, and the run goes on', () => {
      const { wf, state } = make()
      wf.begin('a1', 'Fix the old-side numbers')
      state.todoOf = () => '7'
      const run = wf.addition('a1', 'Fold unchanged code')
      expect(run?.id).toBe(wf.runs()[0]!.id)
      expect(wf.runs()).toHaveLength(1)
      expect(wf.runs()[0]).toMatchObject({ status: 'open', title: 'Fix the old-side numbers', items: [{ title: 'Fold unchanged code' }], todos: ['7'] })
    })

    it('is another run when there is none open, the run was done, landed, started from a commit or stopped, or the request continues the last task', () => {
      const { wf } = make()
      expect(wf.addition('a1', 'x')).toBeUndefined()
      wf.begin('a1', 'One')
      expect(wf.addition('a1', 'x', true)).toBeUndefined()
      wf.landing('a1', 'h1', { anyway: true })
      expect(wf.addition('a1', 'x')).toBeUndefined()
      finish(wf, 'a1')
      expect(wf.addition('a1', 'x')).toBeUndefined()
      const b = make()
      b.wf.begin('a1', 'One')
      b.wf.stopAll()
      expect(b.wf.addition('a1', 'x')).toBeUndefined()
      const c = make()
      c.wf.commit('a1', 'sss', 'feat: from a commit', 1500)
      expect(c.wf.runs()[0]!.auto).toBe(true)
      expect(c.wf.addition('a1', 'x')).toBeUndefined()
    })
  })

  it('with workflows off only an open run takes a commit', () => {
    const { wf, state } = make()
    wf.begin('a1', 'Fix it')
    finish(wf, 'a1')
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
    finish(wf, 'a1') // 1020
    wf.commit('a1', 'in111', 'made during', 1015)
    wf.commit('a1', 'out22', 'made after', 1500)
    const [r] = wf.runs()
    expect(r!.rounds[0]!.commits).toEqual([{ sha: 'in111', subject: 'made during', t: 1015 }, { sha: 'out22', subject: 'made after', t: 1500, flagged: true }])
  })

  it('in a run with two rounds a commit goes to the round it was made in', () => {
    const { wf } = make()
    wf.begin('a1', 'Fix it') // 1010
    finish(wf, 'a1') // 1020
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
    finish(wf, 'a1')
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
    off.state.pick = () => AUTO
    off.wf.begin('a1', 'x')
    expect(edit(off.wf)).toBeNull()
    const auto = make()
    auto.wf.commit('a1', 'c1', 'feat: x', 5000)
    expect(edit(auto.wf)).toBeNull()
    const { wf } = make()
    const run = wf.begin('a1', 'x')
    wf.submitPlan('a1', 'p.md', PLAN)
    wf.decide(run, 'approved')
    finish(wf, 'a1')
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
    const auto = make()
    auto.state.pick = () => AUTO
    auto.wf.begin('a1', 'Add a toggle')
    expect(auto.wf.mergeCheck('a1', 'h1')).toBeNull()
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
    state.pick = () => PLAN_AUTO
    wf.begin('a2', 'Other task')
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
    finish(wf, 'a1')
    wf.commit('a1', 's1', 'chore: a', 9000)
    wf.commit('a1', 's2', 'chore: b', 9100)
    wf.commit('a1', 's3', 'chore: c', 9200)
    expect(wf.mergeCheck('a1', 'h1')).toMatchObject({ blocking: [], notes: ['3 commits were made outside the task.'] })
    const one = make()
    one.wf.begin('a1', 'x')
    one.wf.decide(one.wf.runs()[0]!.id, 'released')
    finish(one.wf, 'a1')
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

  it('follows the run that owns the head, not the agent\'s latest: a finished task keeps its approved plan, its audit and its findings when another task begins, and a head no run saw committed follows the latest', async () => {
    const { wf, state } = make()
    wf.begin('a1', 'First task')
    const first = wf.runs()[0]!.id
    wf.submitPlan('a1', '.agent-world/plan.md', PLAN)
    wf.decide(first, 'approved')
    wf.commit('a1', 'h1', 'first work')
    state.reply = async () => ({ text: '{"findings":[{"kind":"out-of-scope","file":"a.ts","text":"Adds a project key."}]}' })
    await wf.runAudit('a1', 'h1', 'diff --git a/a.ts b/a.ts\n+x\n')
    finish(wf, 'a1')
    // Another task begins before the first one's branch is pushed, and has no plan yet.
    wf.begin('a1', 'Second task')
    wf.commit('a1', 'h2', 'second work')

    expect(wf.mergeCheck('a1', 'h1')).toMatchObject({ run: { title: 'First task' }, plan: 'approved', audit: { state: 'done', findings: [{ seen: false }] }, blocking: ['1 audit finding has not been seen.'] })
    wf.seen('a1', 'h1', [0])
    expect(wf.mergeCheck('a1', 'h1')!.blocking).toEqual([])
    expect(wf.landingHold('a1', 'h1')).toBeNull()
    // The second task's own head is held by the second task's missing plan, and a head nobody recorded follows the latest run.
    expect(wf.mergeCheck('a1', 'h2')).toMatchObject({ run: { title: 'Second task' }, plan: 'none', blocking: ['No plan was approved for this task.'] })
    expect(wf.mergeCheck('a1', 'h9')).toMatchObject({ run: { title: 'Second task' } })
    // Landing the first head is recorded on the first run.
    wf.landing('a1', 'h1')
    expect(wf.landedHead('a1', 'h1')).toBe(true)
    expect(wf.landedHead('a1', 'h2')).toBe(false)
    expect(wf.runs().find((r) => r.id === first)!.landed).toMatchObject({ head: 'h1' })
  })

  it('does not let a commit that was recorded after a later task began, however it is dated, take the gate of an earlier task: it follows the later one', () => {
    const { wf } = make()
    wf.begin('a1', 'First task')
    const first = wf.runs()[0]!
    wf.submitPlan('a1', '.agent-world/plan.md', PLAN)
    wf.decide(first.id, 'approved')
    finish(wf, 'a1')
    wf.begin('a1', 'Second task')
    // A commit dated inside the first task's time, seen by the app only now (a date git was told to use).
    wf.commit('a1', 'h3', 'backdated', first.rounds[0]!.startedAt + 1)
    expect(wf.runs().find((r) => r.id === first.id)!.rounds[0]!.commits.map((c) => c.sha)).toEqual(['h3'])
    expect(wf.mergeCheck('a1', 'h3')).toMatchObject({ run: { title: 'Second task' }, plan: 'none', blocking: ['No plan was approved for this task.'] })
  })

  it('says when the audit began while it runs, and when it was done once it has', async () => {
    const { wf, state } = make()
    wf.begin('a1', 'Add a toggle')
    wf.submitPlan('a1', '.agent-world/plan.md', PLAN)
    wf.decide(wf.runs()[0]!.id, 'approved')
    wf.commit('a1', 'h1', 'toggle')
    let release!: () => void
    state.reply = () => new Promise((r) => (release = () => r({ text: '{"findings":[]}' })))
    const before = state.t
    const audit = wf.runAudit('a1', 'h1', 'diff --git a/a.ts b/a.ts\n+x\n')
    const running = wf.mergeCheck('a1', 'h1')!.audit
    expect(running).toMatchObject({ state: 'running' })
    expect((running as { since: number }).since).toBeGreaterThan(before)
    release()
    await audit
    const done = wf.mergeCheck('a1', 'h1')!.audit as { state: string; t: number }
    expect(done.state).toBe('done')
    expect(done.t).toBeGreaterThan((running as { since: number }).since)
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

  it('Add to plan records an out-of-scope finding as in scope and as seen, refuses any other kind, and the next audit is told what was added', async () => {
    const { wf, state } = make()
    state.pick = () => ({ id: 'f', name: 'F', steps: [{ id: 'plan', kind: 'plan', name: 'Plan' }, { id: 'build', kind: 'work', name: 'Build' }, { id: 'review', kind: 'audit', name: 'Review' }, { id: 'pr', kind: 'pr', name: 'Pull request', gate: 'approve' }] })
    wf.begin('a1', 'Add a toggle')
    wf.submitPlan('a1', '.agent-world/plan.md', PLAN)
    wf.decide(wf.runs()[0]!.id, 'approved')
    state.reply = async () => ({ text: '{"findings":[{"kind":"out-of-scope","files":["a.ts","b.ts"],"text":"Folds unchanged code."},{"kind":"goal-unmet","text":"No test."},{"kind":"out-of-scope","text":"Adds a shortcut."}]}' })
    await wf.runAudit('a1', 'h1', 'diff --git a/a.ts b/a.ts\n+x\n')
    expect(wf.mergeCheck('a1', 'h1')!.blocking).toEqual(['3 audit findings have not been seen.', '"Pull request" has not been approved.'])
    expect(() => wf.addToPlan('a1', 'h1', [1])).toThrow('Only out-of-scope work can be added to the plan.')
    wf.addToPlan('a1', 'h1', [0, 2])
    expect(wf.runs()[0]!.additions?.map((a) => a.text)).toEqual(['Folds unchanged code.', 'Adds a shortcut.'])
    expect(wf.mergeCheck('a1', 'h1')!.blocking).toEqual(['1 audit finding has not been seen.', '"Pull request" has not been approved.'])
    state.asked.length = 0
    await wf.runAudit('a1', 'h2', 'diff --git a/a.ts b/a.ts\n+y\n')
    expect(state.asked[0]).toContain('## Added to the plan afterwards by the person: in scope')
    expect(state.asked[0]).toContain('- Folds unchanged code.')
    expect(() => wf.addToPlan('a1', 'h9', [0])).toThrow('That audit is not the latest.')
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
    const free = make()
    free.state.pick = () => AUTO
    free.wf.begin('a1', 'Add a toggle')
    expect(() => free.wf.landing('a1', 'h3')).not.toThrow()
    expect(free.wf.runs()[0]!.landed).toMatchObject({ head: 'h3', how: 'checked', held: [] })
  })

  it('holds the base branch for git itself, for the reasons that hold Land, until the person allows that head and no other', () => {
    const { wf, state } = make()
    expect(wf.landingHold('a1', 'h1')).toBeNull()
    wf.begin('a1', 'Add a toggle')
    expect(wf.landingHold('a1', 'h1')).toEqual(['No plan was approved for this task.'])
    wf.allowLanding('a1', 'h1')
    expect(wf.landingHold('a1', 'h1')).toBeNull()
    expect(wf.landingHold('a1', 'h2')).toEqual(['No plan was approved for this task.'])
    const free = make()
    free.state.pick = () => AUTO
    free.wf.begin('a1', 'Add a toggle')
    expect(free.wf.landingHold('a1', 'h2')).toBeNull()
  })

  it('lets the base branch move once the plan was approved, with nothing for the person to allow', () => {
    const { wf } = make()
    wf.begin('a1', 'Add a toggle')
    wf.decide(wf.runs()[0]!.id, 'released')
    expect(wf.landingHold('a1', 'h1')).toBeNull()
  })

  describe('a pull request step, which holds the push of the branch', () => {
    const pull = (gate: 'auto' | 'approve' = 'approve'): RunWorkflow => ({ id: 'p', name: 'P', steps: [{ id: 'plan', kind: 'plan', name: 'Plan' }, { id: 'build', kind: 'work', name: 'Build' }, { id: 'review', kind: 'audit', name: 'Review' }, { id: 'pr', kind: 'pr', name: 'Pull request', gate }] })

    it('holds for the same reasons Land does, says which landing the run ends in, and a pull request that does not ask holds nothing', () => {
      const run = (w: RunWorkflow) => {
        const { wf, state } = make()
        state.pick = () => w
        wf.begin('a1', 'Add a toggle')
        return wf
      }
      const wf = run(pull())
      expect(wf.landKind('a1')).toBe('pr')
      expect(wf.mergeCheck('a1', 'h1')).toMatchObject({ land: 'pr', blocking: ['No plan was approved for this task.', '"Pull request" has not been approved.'] })
      expect(wf.landingHold('a1', 'h1')).toEqual(['No plan was approved for this task.', '"Pull request" has not been approved.'])
      expect(run(pull('approve')).landingHold('a1', 'h1')).toEqual(['No plan was approved for this task.', '"Pull request" has not been approved.'])
      expect(run(pull('auto')).landingHold('a1', 'h1')).toBeNull()
    })

    it('ends the run when the push went through, recorded like a landing', () => {
      const { wf, state } = make()
      state.pick = () => pull('auto')
      wf.begin('a1', 'Add a toggle')
      wf.decide(wf.runs()[0]!.id, 'released')
      wf.landing('a1', 'h1', { anyway: true })
      expect(wf.runs()[0]!.landed).toMatchObject({ head: 'h1', how: 'checked' })
    })

    it('ends the run when the push went through, as the brief says, so the agent\'s own task_done afterwards is no error, and the next task is a run of its own', () => {
      const { wf, state } = make()
      state.pick = () => pull('auto')
      wf.begin('a1', 'Add a toggle')
      wf.landing('a1', 'h1', { anyway: true })
      expect(wf.runs()[0]).toMatchObject({ status: 'done', landed: { head: 'h1' } })
      expect(() => finish(wf, 'a1', 'Pushed.')).not.toThrow()
      wf.begin('a1', 'Next')
      expect(wf.runs()).toHaveLength(2)
      expect(() => finish(wf, 'a2')).toThrow('No task is open.')
    })

    it('does not end a run that lands by merging: that one goes on until the agent says it is done', () => {
      const { wf, state } = make()
      state.pick = () => ({ id: 'f', name: 'F', steps: [{ id: 'build', kind: 'work', name: 'Build' }, { id: 'land', kind: 'merge', name: 'Land', gate: 'auto' }] })
      wf.begin('a1', 'Task')
      wf.landing('a1', 'h1', { anyway: true })
      expect(wf.runs()[0]!.status).toBe('open')
    })

    it('records a push after the review was set aside as pushed anyway, naming that', async () => {
      const { wf, state } = make()
      state.pick = () => pull()
      wf.begin('a1', 'Add a toggle')
      wf.submitPlan('a1', '.agent-world/plan.md', PLAN)
      wf.decide(wf.runs()[0]!.id, 'approved')
      state.reply = async () => ({ text: '{"findings":[{"kind":"out-of-scope","text":"Adds a project key."}]}' })
      await wf.runAudit('a1', 'h1', 'diff --git a/a.ts b/a.ts\n+x\n')
      wf.asideAudit('a1')
      finish(wf, 'a1')
      wf.approveStep(wf.runs()[0]!.id, 'pr', 'approved')
      wf.landing('a1', 'h1')
      expect(wf.runs()[0]!.landed).toMatchObject({ how: 'anyway', held: ['The review was set aside.'] })
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
      expect(held.runs()[0]!.landed).toMatchObject({ head: 'h1', how: 'anyway', held: ['No plan was approved for this task.', '"Pull request" has not been approved.', 'Pushed without the hold: git push --no-verify.'] })
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
    expect(wf.mergeCheck('a1', 'h1')!.audit).toMatchObject({ state: 'running' })
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
    finish(wf, 'a1')
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
    wf.decide(wf.runs()[1]!.id, 'released')
    finish(wf, 'a2')
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
    finish(wf, 'a1')
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
    expect(wf.stepDone('a1')).toMatchObject({ done: 'a' })
    expect(wf.stepDone('a1', 'b')).toMatchObject({ done: 'b', waiting: 'Your review' })
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
    expect(wf.stepDone('a1')).toMatchObject({ done: 'b', waiting: 'Your review' })
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

  it('names the step that waits for the person on the agent\'s latest run, and none when nothing does', () => {
    const { wf, run } = started()
    expect(wf.waitingStep('a1')).toBeNull()
    wf.stepDone('a1')
    wf.stepDone('a1')
    expect(wf.waitingStep('a1')).toEqual({ run, step: 'b', name: 'Second', toRun: false })
    expect(wf.waitingStep('a2')).toBeNull()
    wf.approveStep(run, 'b', 'approved')
    expect(wf.waitingStep('a1')).toEqual({ run, step: 'ok', name: 'Your review', toRun: false })
  })

  it('work the person sends back after the task was finished opens the task again; an approval does not', () => {
    const { wf, run } = started()
    wf.stepDone('a1')
    wf.stepDone('a1')
    wf.approveStep(run, 'b', 'approved')
    finish(wf, 'a1', 'Done.')
    expect(wf.runs()[0]!.status).toBe('done')
    wf.approveStep(run, 'ok', 'approved')
    expect(wf.runs()[0]!.status).toBe('done')
    const again = started()
    again.wf.stepDone('a1')
    again.wf.stepDone('a1')
    again.wf.approveStep(again.run, 'b', 'approved')
    finish(again.wf, 'a1', 'Done.')
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

})

describe('the plan hold follows the workflow', () => {
  const flow = (plan?: { gate?: 'auto' | 'approve' }): RunWorkflow => ({ id: 'f', name: 'F', steps: [...(plan ? [{ id: 'plan', kind: 'plan' as const, name: 'Plan', ...plan }] : []), { id: 'build', kind: 'work', name: 'Build' }, { id: 'land', kind: 'merge', name: 'Land' }] })
  const held = (w: RunWorkflow | undefined) => {
    const { wf, state } = make()
    state.pick = () => w
    wf.begin('a1', 'Task')
    return wf.editBlock('a1', '/w/src/a.ts', '/w') !== null
  }

  it('a plan step holds unless it says auto', () => {
    expect([held(flow({ gate: 'auto' })), held(flow({ gate: 'approve' })), held(flow({}))]).toEqual([false, true, true])
  })

  it('a workflow with no plan step holds nothing, and a run with no workflow is held', () => {
    expect(held(flow())).toBe(false)
    expect(held(undefined)).toBe(true)
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
  const started = (w: RunWorkflow) => {
    const t = make()
    t.state.pick = () => w
    t.wf.begin('a1', 'Task')
    return t
  }

  it('a merge step always holds Land, whatever its file said, and a workflow with no landing step holds nothing', () => {
    expect(started(flow({ merge: { gate: 'auto' } })).wf.mergeCheck('a1', 'h1')).not.toBeNull()
    expect(started(flow({ merge: {} })).wf.mergeCheck('a1', 'h1')).not.toBeNull()
    expect(started(flow({ merge: false })).wf.mergeCheck('a1', 'h1')).toBeNull()
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
    const wanted = (plan: { gate?: 'auto' | 'approve' } | undefined) => {
      const t = started(flow({ merge: {} }))
      t.state.pick = () => ({ ...flow(), steps: [...(plan ? [{ id: 'plan', kind: 'plan' as const, name: 'Plan', ...plan }] : []), ...flow({ plan: false }).steps] })
      t.wf.begin('a2', 'Task')
      return t.wf.planWanted('a2')
    }
    expect([wanted({ gate: 'auto' }), wanted({ gate: 'approve' }), wanted({}), wanted(undefined)]).toEqual([false, true, true, false])
    expect(make().wf.planWanted('a1')).toBe(false)
  })
})

describe('steps are reported in order, and finishing a task never claims a step nobody did', () => {
  const FLOW: RunWorkflow = {
    id: 'h',
    name: 'H',
    steps: [
      { id: 'designs', kind: 'work', name: 'UI design options', optional: true },
      { id: 'build', kind: 'work', name: 'Build' },
      { id: 'commit', kind: 'work', name: 'Commit', start: 'run' },
      { id: 'push', kind: 'work', name: 'Push', start: 'run' }
    ]
  }
  const started = (flow = FLOW) => {
    const t = make()
    t.state.pick = () => flow
    t.wf.begin('a1', 'Task')
    return { ...t, log: () => t.wf.runs()[0]!.rounds.at(-1)!.steps.map((s) => `${s.step}:${s.state}${s.implicit ? '*' : ''}`) }
  }

  it('an optional step the agent skips is marked skipped, not done, and a step that starts on Run is never marked for the person', () => {
    const { wf, log } = started()
    wf.stepDone('a1', 'designs', { skipped: true, why: 'No UI change.' })
    wf.stepDone('a1', 'build')
    expect(() => wf.done('a1', 'Built.')).toThrow()
    expect(log()).toEqual(['designs:skipped', 'build:done'])
  })

  it('refuses to finish while a step that starts on Run still waits for the person, and tells the agent to stop and wait, so the run stays one run', () => {
    const { wf } = started()
    wf.stepDone('a1', 'designs', { skipped: true, why: 'No UI change.' })
    wf.stepDone('a1', 'build')
    expect(() => wf.done('a1', 'Built.')).toThrow('The person has not pressed Run on "Commit" yet: nothing is finished until they do. Stop here and wait; their Run arrives as your next message.')
    expect(wf.runs()[0]!.status).toBe('open')
    wf.startStep(wf.runs()[0]!.id, 'commit')
    wf.stepDone('a1', 'commit')
    wf.startStep(wf.runs()[0]!.id, 'push')
    wf.stepDone('a1', 'push')
    wf.done('a1', 'Shipped.')
    expect(wf.runs()[0]!.status).toBe('done')
  })

  it('finishing with an optional step never reported marks it skipped by the app', () => {
    const { wf, log } = started({ ...FLOW, steps: FLOW.steps.slice(0, 2) })
    wf.stepDone('a1', 'designs', { skipped: true, why: 'No UI change.' })
    wf.stepDone('a1', 'build')
    wf.done('a1')
    const lateSkip = started({ ...FLOW, steps: [FLOW.steps[1]!, FLOW.steps[0]!] })
    lateSkip.wf.stepDone('a1', 'build')
    lateSkip.wf.done('a1')
    expect(lateSkip.log()).toEqual(['build:done', 'designs:skipped*'])
    expect(log()).toEqual(['designs:skipped', 'build:done'])
  })

  it('a required step the person refuses fails and holds the steps after it, and the agent may then close the task; an optional one is skipped instead', () => {
    const { wf, log } = started()
    wf.stepDone('a1', 'designs', { skipped: true, why: 'No UI change.' })
    wf.stepDone('a1', 'build')
    const id = wf.runs()[0]!.id
    expect(() => wf.declineStep(id, 'designs')).toThrow('optional')
    expect(wf.declineStep(id, 'commit')).toBe('Commit')
    expect(wf.runs()[0]!.rounds.at(-1)!.steps.at(-1)).toMatchObject({ step: 'commit', state: 'declined' })
    expect(stepStates(wf.runs()[0]!, { auditOn: false }).map((s) => s.state)).toEqual(['skipped', 'passed', 'failed', 'pending'])
    wf.done('a1', 'Stopped at the commit.')
    expect(wf.runs()[0]!.status).toBe('done')
    expect(log()).toContain('commit:declined')
  })

  it('says which step comes next when one is reported or skipped', () => {
    const { wf } = started()
    expect(wf.stepDone('a1', 'designs', { skipped: true, why: 'x' }).next).toMatchObject({ name: 'Build', optional: false })
    expect(wf.stepDone('a1', 'build').next).toMatchObject({ name: 'Commit', start: true })
  })

  const stateOf = (wf: Workflows) => stepStates(wf.runs()[0]!, { auditOn: false }).map((x) => `${x.id}:${x.state}`)

  it('a step the person refused is asked again when it is reopened, and then waits for their Run like any other', () => {
    const { wf } = started()
    wf.stepDone('a1', 'designs', { skipped: true, why: 'No UI.' })
    wf.stepDone('a1', 'build')
    const id = wf.runs()[0]!.id
    wf.declineStep(id, 'commit')
    expect(stateOf(wf)).toEqual(['designs:skipped', 'build:passed', 'commit:failed', 'push:pending'])
    expect(wf.refusedSteps('a1')).toEqual(['Commit'])
    wf.askAgain(id, 'commit')
    expect(stateOf(wf)).toEqual(['designs:skipped', 'build:passed', 'commit:waiting', 'push:pending'])
    expect(wf.refusedSteps('a1')).toEqual([])
    // The agent reopens it too: the same thing, from its side.
    wf.declineStep(id, 'commit')
    expect(wf.reopenStep('a1', 'commit', 'The new work is ready.')).toBe('Commit')
    expect(stateOf(wf)[2]).toBe('commit:waiting')
  })

  it('a refused step asks nothing once its run is over: an old finished run never raises the card again', () => {
    const { wf } = started()
    wf.stepDone('a1', 'designs', { skipped: true, why: 'No UI.' })
    wf.stepDone('a1', 'build')
    const id = wf.runs()[0]!.id
    wf.declineStep(id, 'commit')
    expect(refusedAsk(wf.runs()[0]!, { auditOn: false })?.id).toBe('commit')
    wf.done('a1', 'Stopped at the commit.')
    expect(wf.runs()[0]!.status).toBe('done')
    expect(refusedAsk(wf.runs()[0]!, { auditOn: false })).toBeUndefined()
  })

  it('a run that did nothing is dropped when no workflow was needed; one with work recorded is not', () => {
    const { wf } = started()
    const id = wf.runs()[0]!.id
    expect(wf.noWorkflowNeeded(id)).toBe(true)
    wf.dropRun(id)
    expect(wf.runs()).toEqual([])
    const second = started()
    second.wf.stepDone('a1', 'designs', { skipped: true, why: 'No UI.' })
    second.wf.stepDone('a1', 'build')
    const id2 = second.wf.runs()[0]!.id
    expect(second.wf.noWorkflowNeeded(id2)).toBe(false)
    expect(() => second.wf.dropRun(id2)).toThrow('work')
  })

  it('a refused step asks what next: skipping it lets the steps after it go on, and later leaves it refused without asking again', () => {
    const { wf } = started()
    wf.stepDone('a1', 'designs', { skipped: true, why: 'No UI.' })
    wf.stepDone('a1', 'build')
    const id = wf.runs()[0]!.id
    wf.declineStep(id, 'commit')
    expect(refusedAsk(wf.runs()[0]!, { auditOn: false })).toEqual({ id: 'commit', name: 'Commit', rest: ['Push'], skippable: true })
    expect(() => wf.skipRefused(id, 'build')).toThrow('not refused')
    expect(wf.deferRefused(id, 'commit')).toBe('Commit')
    expect(stateOf(wf)[2]).toBe('commit:failed')
    expect(refusedAsk(wf.runs()[0]!, { auditOn: false })).toBeUndefined()
    // It can still be asked about again, and refused again.
    wf.askAgain(id, 'commit')
    wf.declineStep(id, 'commit')
    expect(refusedAsk(wf.runs()[0]!, { auditOn: false })?.id).toBe('commit')
    expect(wf.skipRefused(id, 'commit')).toBe('Commit')
    expect(stateOf(wf)).toEqual(['designs:skipped', 'build:passed', 'commit:skipped', 'push:waiting'])
    expect(refusedAsk(wf.runs()[0]!, { auditOn: false })).toBeUndefined()
  })

  it('the agent reopens a step it already reported, and must report it again before it can finish', () => {
    const { wf } = started()
    wf.stepDone('a1', 'designs', { skipped: true, why: 'No UI.' })
    wf.stepDone('a1', 'build')
    expect(wf.reopenStep('a1', 'build', 'More code was added.')).toBe('Build')
    expect(stateOf(wf)[1]).toBe('build:running')
    expect(() => wf.done('a1')).toThrow('Report "Build" first')
    wf.stepDone('a1', 'build')
    expect(stateOf(wf)[1]).toBe('build:passed')
  })

  it('refuses to reopen what does not exist or what is not there to reopen', () => {
    const { wf } = started()
    expect(() => wf.reopenStep('a1', 'nope', 'x')).toThrow('no step "nope"')
    expect(() => wf.reopenStep('a1', 'build', 'x')).toThrow('has not been reported')
  })

  it('the agent asks once to skip steps that are not optional, and nothing is skipped until the person says yes', () => {
    const { wf, log } = started()
    wf.stepDone('a1', 'designs', { skipped: true, why: 'No UI.' })
    wf.stepDone('a1', 'build')
    const id = wf.runs()[0]!.id
    expect(wf.askSkip('a1', ['commit', 'push'], 'Nothing changed, so nothing to ship.')).toEqual(['Commit', 'Push'])
    expect(wf.runs()[0]!.skipAsk).toMatchObject({ steps: ['commit', 'push'], why: 'Nothing changed, so nothing to ship.' })
    expect(stateOf(wf).slice(2)).toEqual(['commit:waiting', 'push:pending'])
    expect(() => wf.askSkip('a1', ['push'], 'again')).toThrow('already waiting')
    expect(wf.answerSkip(id, true)).toMatchObject({ names: ['Commit', 'Push'], why: 'Nothing changed, so nothing to ship.', approved: true })
    expect(wf.runs()[0]!.skipAsk).toBeUndefined()
    expect(stateOf(wf).slice(2)).toEqual(['commit:skipped', 'push:skipped'])
    expect(log()).toContain('commit:skipped')
    wf.done('a1', 'Nothing to ship.')
    expect(wf.runs()[0]!.status).toBe('done')
  })

  it('keeping the steps leaves them as they were', () => {
    const { wf } = started()
    wf.stepDone('a1', 'designs', { skipped: true, why: 'No UI.' })
    wf.stepDone('a1', 'build')
    const id = wf.runs()[0]!.id
    wf.askSkip('a1', ['commit', 'push'], 'Nothing to ship.')
    expect(wf.answerSkip(id, false)).toMatchObject({ approved: false })
    expect(stateOf(wf).slice(2)).toEqual(['commit:waiting', 'push:pending'])
    expect(wf.runs()[0]!.skipAsk).toBeUndefined()
  })

  it('a skip is asked with a reason, for real steps that are not the plan, and not for what is already met', () => {
    const { wf } = started({ ...FLOW, steps: [{ id: 'plan', kind: 'plan', name: 'Plan', gate: 'auto' }, ...FLOW.steps] })
    expect(() => wf.askSkip('a1', ['commit'], '')).toThrow('reason')
    expect(() => wf.askSkip('a1', [], 'x')).toThrow('Name the steps')
    expect(() => wf.askSkip('a1', ['nope'], 'x')).toThrow('no step "nope"')
    expect(() => wf.askSkip('a1', ['plan'], 'x')).toThrow('plan')
    wf.stepDone('a1', 'designs', { skipped: true, why: 'x' })
    wf.stepDone('a1', 'build')
    expect(() => wf.askSkip('a1', ['build'], 'x')).toThrow('already done')
  })

  const SHIP: RunWorkflow = { id: 's', name: 'S', steps: [{ id: 'build', kind: 'work', name: 'Build' }, { id: 'push', kind: 'pr', name: 'Push', start: 'run' }] }

  it('a commit dated before the run began is not attached to it, so an old snapshot cannot join a new run', () => {
    const t = make()
    t.state.pick = () => SHIP
    t.wf.begin('a1', 'First task')
    t.wf.done('a1', 'Done.', { byApp: true })
    t.state.t += 1_000_000
    t.wf.begin('a1', 'New task')
    const second = t.wf.runs()[0]!
    // Dated after the first run ended and before the second began: no run's window holds it.
    t.wf.commit('a1', 'old1', 'chore(ada): work in progress', second.startedAt - 500_000)
    expect(t.wf.runs().flatMap((r) => r.rounds.flatMap((x) => x.commits))).toEqual([])
    t.wf.commit('a1', 'new1', 'feat: real', second.startedAt + 5)
    expect(t.wf.runs()[0]!.rounds[0]!.commits.map((c) => c.sha)).toEqual(['new1'])
  })

  it('snapshot commits made when the app quit are not something to push', () => {
    const { wf } = started(SHIP)
    const began = wf.runs()[0]!.startedAt
    wf.commit('a1', 'snap', 'chore(ada): work in progress', began + 5)
    expect(wf.mergeCheck('a1', 'snap')?.commits).toBe(0)
    wf.commit('a1', 'real', 'feat: real', began + 6)
    expect(wf.mergeCheck('a1', 'real')?.commits).toBe(1)
  })

  it('a run whose push was skipped or refused, or that was ended, is never asked to push', () => {
    const { wf } = started(SHIP)
    const id = wf.runs()[0]!.id
    expect(wf.mayAskPush('a1')).toBe(true)
    wf.stepDone('a1', 'build')
    wf.declineStep(id, 'push')
    expect(wf.mayAskPush('a1')).toBe(false)
    wf.askAgain(id, 'push')
    expect(wf.mayAskPush('a1')).toBe(true)
    wf.askSkip('a1', ['push'], 'Nothing to push.')
    wf.answerSkip(id, true)
    expect(wf.mayAskPush('a1')).toBe(false)
  })

  it('ending a run sets aside what is left with a reason and stops it, so nothing about it is asked again', () => {
    const { wf } = started()
    const id = wf.runs()[0]!.id
    wf.stepDone('a1', 'designs', { skipped: true, why: 'No UI.' })
    wf.stepDone('a1', 'build')
    wf.endRun(id, 'The task needed no commit or push.')
    const run = wf.runs()[0]!
    expect(run.status).toBe('stopped')
    expect(stepStates(run, { auditOn: false }).map((x) => `${x.id}:${x.state}`)).toEqual(['designs:skipped', 'build:passed', 'commit:skipped', 'push:skipped'])
    expect(run.rounds[0]!.steps.find((x) => x.step === 'commit')).toMatchObject({ state: 'skipped', note: 'The task needed no commit or push.' })
    expect(wf.mayAskPush('a1')).toBe(false)
  })

  it('a failed command is recorded against the step the run was at, once, and only while a run is open', () => {
    const { wf } = started()
    wf.stepDone('a1', 'designs', { skipped: true, why: 'No UI.' })
    wf.trouble('a1', { label: 'tests', command: 'pnpm test', error: '3 failed' })
    wf.trouble('a1', { label: 'tests', command: 'pnpm test', error: '3 failed' })
    expect(wf.runs()[0]!.troubles).toEqual([expect.objectContaining({ step: 'build', label: 'tests', command: 'pnpm test', error: '3 failed' })])
    expect(() => wf.trouble('nobody', { label: 'other', command: 'git x', error: 'e' })).not.toThrow()
  })

  it('work added to a run gets its own lane of the steps before the first one that asks the person, and reporting a step goes to the main chain first, then the lane', () => {
    const { wf } = started()
    wf.stepDone('a1', 'designs', { skipped: true, why: 'No UI.' })
    wf.stepDone('a1', 'build')
    wf.addition('a1', 'Also add a CSV export')
    const run = () => wf.runs()[0]!
    const lanes = () => lanesOf(run(), { auditOn: false })
    expect(lanes()).toHaveLength(1)
    expect(lanes()[0]).toMatchObject({ item: 2, title: 'Also add a CSV export', fork: 'build', join: 'commit' })
    expect(lanes()[0]!.steps.map((x) => `${x.id}:${x.state}`)).toEqual(['designs:running', 'build:pending'])
    // The main chain already has both, so these go to the lane; the main chain is not changed.
    wf.stepDone('a1', 'designs', { skipped: true, why: 'No UI either.' })
    expect(lanes()[0]!.steps.map((x) => `${x.id}:${x.state}`)).toEqual(['designs:skipped', 'build:running'])
    expect(stateOf(wf).slice(0, 2)).toEqual(['designs:skipped', 'build:passed'])
    expect(() => wf.done('a1')).toThrow('Report "Build" for item 2 first')
    wf.stepDone('a1', 'build', { item: 2 })
    expect(lanes()[0]!.steps.map((x) => x.state)).toEqual(['skipped', 'passed'])
  })

  it('a step is reported for an item when the agent says so, even if the main chain has not got there', () => {
    const { wf } = started()
    wf.addition('a1', 'Also add a CSV export')
    wf.stepDone('a1', 'designs', { skipped: true, why: 'x', item: 2 })
    const lane = lanesOf(wf.runs()[0]!, { auditOn: false })[0]!
    expect(lane.steps.map((x) => x.state)).toEqual(['skipped', 'running'])
    expect(stateOf(wf)[0]).toBe('designs:running')
    expect(() => wf.stepDone('a1', 'build', { item: 9 })).toThrow('no item 9')
  })

  it('refuses to finish while a step the agent has to do was never reported, and names it', () => {
    const { wf } = started({ ...FLOW, steps: [FLOW.steps[1]!, { id: 'tests', kind: 'work', name: 'Tests' }] })
    wf.stepDone('a1', 'build')
    expect(() => wf.done('a1')).toThrow('Report "Tests" first: it was never done.')
    expect(wf.runs()[0]!.status).toBe('open')
  })

  it('refuses to report a step while an earlier one is neither done nor skipped, and says which', () => {
    const { wf } = started()
    expect(() => wf.stepDone('a1', 'build')).toThrow('"UI design options" comes before "Build": report it, or skip it with step_done("designs", skipped, "<why>"): a step is never passed over without saying so.')
  })

  it('a skip needs a reason, which is kept on the step', () => {
    const { wf } = started()
    expect(() => wf.stepDone('a1', 'designs', { skipped: true })).toThrow('Say why in a few words: a skipped step needs a reason.')
    wf.stepDone('a1', 'designs', { skipped: true, why: '  No UI change.  ' })
    expect(wf.runs()[0]!.rounds[0]!.steps.at(-1)).toMatchObject({ step: 'designs', state: 'skipped', note: 'No UI change.' })
  })

  it('only an optional step can be skipped by the agent', () => {
    const { wf } = started()
    wf.stepDone('a1', 'designs', { skipped: true, why: 'No UI change.' })
    expect(() => wf.stepDone('a1', 'build', { skipped: true, why: 'No UI change.' })).toThrow('"Build" is not optional: do it, or ask the person.')
  })
})

describe('the run ends at the push only when nothing is left after it', () => {
  const FLOW: RunWorkflow = {
    id: 'p',
    name: 'P',
    steps: [
      { id: 'build', kind: 'work', name: 'Build' },
      { id: 'push', kind: 'pr', name: 'Push', start: 'run' },
      { id: 'pr', kind: 'work', name: 'Pull request', start: 'run' }
    ]
  }
  const pushed = (flow = FLOW) => {
    const t = make()
    t.state.pick = () => flow
    t.wf.begin('a1', 'Task')
    t.wf.stepDone('a1', 'build')
    t.wf.approveStep(t.wf.runs()[0]!.id, 'push', 'approved')
    t.wf.landing('a1', 'h1')
    return t
  }

  it('a step of the agent after the pushing step keeps the run open: the agent opens the pull request and reports it', () => {
    const { wf } = pushed()
    expect(wf.runs()[0]!.status).toBe('open')
    wf.startStep(wf.runs()[0]!.id, 'pr')
    wf.stepDone('a1', 'pr')
    wf.done('a1', 'Pushed and opened.')
    expect(wf.runs()[0]!.status).toBe('done')
  })

  it('with nothing after the pushing step the run ends at the push, as before', () => {
    const { wf } = pushed({ ...FLOW, steps: FLOW.steps.slice(0, 2) })
    expect(wf.runs()[0]!.status).toBe('done')
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
    finish(passing.wf, 'a1', 'Done.')
    await passing.wf.runChecks('a1', 'h1')
    expect(passing.wf.runs()[0]!.status).toBe('done')
    const { wf, state } = started()
    finish(wf, 'a1', 'Done.')
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
    finish(wf, 'a1', 'Done.')
    expect(wf.runs()[0]!.status).toBe('done')
    release()
    expect((await running).sendBack).toContain('failed (try 1 of 3)')
    expect(wf.runs()[0]!.status).toBe('open')
    expect(wf.stepDone('a1').done).toBe('build')
  })

  it('a finished task opened again by a failing check stays open while the check keeps failing, and the person is asked when it runs out of tries', async () => {
    const { wf, state } = started()
    state.results = [{ exit: 1, tail: 'a' }, { exit: 1, tail: 'b' }, { exit: 1, tail: 'c' }]
    finish(wf, 'a1', 'Done.')
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
    finish(wf, 'a1', 'all done')
    expect(wf.runs()[0]!.status).toBe('done')
    expect(wf.stepDone('a1', 'build')).toMatchObject({ done: 'build', checking: true })
    expect(wf.runs()[0]!.status).toBe('open')
    // With nothing sent back, a closed task stays closed.
    await wf.runChecks('a1', 'h2')
    finish(wf, 'a1')
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
    expect(started(false).wf.stepDone('a1', 'build')).toMatchObject({ done: 'build', checking: true })
    const none = make()
    none.state.pick = () => ({ id: 'n', name: 'N', steps: [{ id: 'build', kind: 'work', name: 'Build' }] })
    none.wf.begin('a1', 'Task')
    expect(none.wf.stepDone('a1')).toMatchObject({ done: 'build' })
  })

  it('after a check failed and the agent fixed it, reporting again is accepted and has the checks run once more, rather than refused as already done', async () => {
    const { wf, state } = started()
    state.results = [{ exit: 1, tail: 'FAIL' }]
    await wf.runChecks('a1', 'h1')
    expect(wf.stepDone('a1')).toMatchObject({ done: 'build', checking: true })
    expect((await wf.runChecks('a1', 'h2')).ran).toBe(2)
    expect(() => wf.stepDone('a1')).toThrow('Every step you do is already reported done.')
  })

  it('a pull request that does not ask turns off the plan and audit rules but not a check that must pass or a step the person must approve', async () => {
    const t = started()
    t.state.pick = () => ({ ...FLOW, steps: FLOW.steps.filter((s) => s.id !== 'lint').map((s) => (s.kind === 'merge' ? { ...s, kind: 'pr' as const, gate: 'auto' as const } : s)) })
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

describe('a pull request step waits for the person\'s approval before the push', () => {
  const PR: RunWorkflow = { id: 'pr', name: 'PR', steps: [{ id: 'plan', kind: 'plan', name: 'Plan' }, { id: 'build', kind: 'work', name: 'Build' }, { id: 'review', kind: 'audit', name: 'Audit' }, { id: 'pr', kind: 'pr', name: 'Pull request' }] }
  const audited = async (o: { gate?: 'approve' | 'auto' } = {}) => {
    const { wf, state } = make()
    state.pick = () => ({ ...PR, steps: PR.steps.map((s) => (s.kind === 'pr' ? { ...s, gate: o.gate ?? 'approve' } : s)) })
    wf.begin('a1', 'Add a toggle')
    wf.submitPlan('a1', '.agent-world/plan.md', PLAN)
    wf.decide(wf.runs()[0]!.id, 'approved')
    wf.commit('a1', 'h1', 'work')
    finish(wf, 'a1')
    await wf.runAudit('a1', 'h1', 'diff --git a/a.ts b/a.ts\n+x\n')
    return { wf, id: wf.runs()[0]!.id }
  }

  it('holds the push until the person approves the step, and lets it through after', async () => {
    const { wf, id } = await audited()
    expect(wf.landingHold('a1', 'h1')).toEqual(['"Pull request" has not been approved.'])
    wf.approveStep(id, 'pr', 'approved')
    expect(wf.landingHold('a1', 'h1')).toBeNull()
    expect(() => wf.approveStep(id, 'pr', 'approved')).toThrow('Nothing is waiting for approval there.')
  })

  it('asks again when the branch changes after the approval', async () => {
    const { wf, id } = await audited()
    wf.approveStep(id, 'pr', 'approved')
    wf.commit('a1', 'h2', 'more work')
    expect(wf.landingHold('a1', 'h2')).toContain('"Pull request" has not been approved.')
  })

  it('asks for nothing when the gate is auto, and asks when it says approve', async () => {
    expect((await audited({ gate: 'auto' })).wf.landingHold('a1', 'h1')).toBeNull()
    expect((await audited({ gate: 'approve' })).wf.landingHold('a1', 'h1')).toEqual(['"Pull request" has not been approved.'])
  })
})

describe('a check or an audit that starts when the person presses Run', () => {
  const STEPS: RunWorkflow = { id: 'r', name: 'R', hash: 'h1', scope: 'project', steps: [{ id: 'plan', kind: 'plan', name: 'Plan' }, { id: 'build', kind: 'work', name: 'Build' }, { id: 'tests', kind: 'check', name: 'Tests', run: 'npm test', start: 'run' }, { id: 'review', kind: 'audit', name: 'Audit', start: 'run' }, { id: 'land', kind: 'merge', name: 'Land' }] }
  const built = () => {
    const o = make()
    o.state.pick = () => STEPS
    o.wf.begin('a1', 'Task')
    o.wf.submitPlan('a1', '.agent-world/plan.md', PLAN)
    o.wf.decide(o.wf.runs()[0]!.id, 'approved')
    o.wf.stepDone('a1', 'build')
    return o
  }
  const at = (wf: Workflows, id: string) => stepStates(wf.runs()[0]!, { auditOn: true, head: 'h1' }).find((s) => s.id === id)!

  it('does not run the check by itself: it waits for Run, and nothing after it starts', async () => {
    const { wf, state } = built()
    expect(await wf.runChecks('a1', 'h1')).toEqual({ ran: 0 })
    expect(state.ran).toEqual([])
    expect(at(wf, 'tests')).toMatchObject({ state: 'waiting', toRun: true })
    expect(wf.auditDue('a1', 'h1')).toBe(false)
  })

  it('runs the check when Run is pressed for it, and only that one', async () => {
    const { wf, state } = built()
    const r = await wf.runChecks('a1', 'h1', { only: 'tests' })
    expect(r.ran).toBe(1)
    expect(state.ran).toEqual(['npm test @ /w'])
    expect(at(wf, 'tests').state).toBe('passed')
  })

  it('refuses to run, by Run, a step that is not a check waiting for it', async () => {
    const { wf } = built()
    expect(await wf.runChecks('a1', 'h1', { only: 'build' })).toEqual({ ran: 0 })
    expect(await wf.runChecks('a1', 'h1', { only: 'nope' })).toEqual({ ran: 0 })
  })

  it('does not start the audit by itself once its checks have passed: it waits for Run, and the person\'s Run audits', async () => {
    const { wf } = built()
    await wf.runChecks('a1', 'h1', { only: 'tests' })
    expect(at(wf, 'review')).toMatchObject({ state: 'waiting', toRun: true })
    expect(wf.auditDue('a1', 'h1')).toBe(false)
    await wf.runAudit('a1', 'h1', 'diff --git a/a.ts b/a.ts\n+x\n')
    expect(wf.mergeCheck('a1', 'h1')!.audit.state).toBe('done')
    expect(at(wf, 'review').toRun).toBeUndefined()
  })

  it('an audit that starts by itself is still due by itself', async () => {
    const o = make()
    o.state.pick = () => ({ ...STEPS, steps: STEPS.steps.map((s) => (s.id === 'review' ? { ...s, start: 'auto' as const } : s.id === 'tests' ? { ...s, start: 'auto' as const } : s)) })
    o.wf.begin('a1', 'Task')
    o.wf.submitPlan('a1', '.agent-world/plan.md', PLAN)
    o.wf.decide(o.wf.runs()[0]!.id, 'approved')
    o.wf.stepDone('a1', 'build')
    await o.wf.runChecks('a1', 'h1')
    expect(o.wf.auditDue('a1', 'h1')).toBe(true)
  })
})

describe('skipping an optional step', () => {
  const FLOW: RunWorkflow = { id: 'o', name: 'O', hash: 'h1', scope: 'project', steps: [{ id: 'build', kind: 'work', name: 'Build' }, { id: 'extra', kind: 'work', name: 'Extra', optional: true }, { id: 'ok', kind: 'approve', name: 'Your look', optional: true }, { id: 'tests', kind: 'check', name: 'Tests', run: 'x', optional: true }] }
  const open = () => {
    const o = make()
    o.state.pick = () => FLOW
    o.wf.begin('a1', 'Task')
    o.wf.stepDone('a1', 'build')
    return o
  }
  const state = (wf: Workflows, id: string) => stepStates(wf.runs()[0]!, { auditOn: false, approved: true }).find((s) => s.id === id)!.state

  it('records the skip, and the step after it goes on', () => {
    const { wf } = open()
    expect(state(wf, 'extra')).toBe('running')
    expect(wf.skipStep(wf.runs()[0]!.id, 'extra')).toBe('Extra')
    expect(state(wf, 'extra')).toBe('skipped')
    expect(state(wf, 'ok')).toBe('waiting')
    wf.skipStep(wf.runs()[0]!.id, 'ok')
    expect(state(wf, 'ok')).toBe('skipped')
  })
  it('skips a step marked skippable though it is not optional, and the agent may only ask for steps that are skippable or optional', () => {
    const t = make()
    t.state.pick = () => ({ id: 'k', name: 'K', steps: [{ id: 'plan', kind: 'plan', name: 'Plan', gate: 'auto' }, { id: 'build', kind: 'work', name: 'Build' }, { id: 'mine', kind: 'work', name: 'Mine', skippable: true }, { id: 'commit', kind: 'work', name: 'Commit', start: 'run' }, { id: 'held', kind: 'work', name: 'Held', start: 'run', skippable: false }] } as RunWorkflow)
    t.wf.begin('a1', 'Task')
    t.wf.stepDone('a1', 'build')
    const id = t.wf.runs()[0]!.id
    expect(() => t.wf.askSkip('a1', ['held'], 'x')).toThrow('required')
    expect(() => t.wf.askSkip('a1', ['build'], 'x')).toThrow('already done')
    expect(t.wf.askSkip('a1', ['mine', 'commit'], 'Nothing to do.')).toEqual(['Mine', 'Commit'])
    t.wf.answerSkip(id, false)
    expect(t.wf.skipStep(id, 'mine')).toBe('Mine')
    expect(() => t.wf.skipStep(id, 'held')).toThrow('cannot be skipped')
  })

  it('refuses a step that is not optional, one the check or audit way skips, and one that is not there', () => {
    const { wf } = open()
    const id = wf.runs()[0]!.id
    expect(() => wf.skipStep(id, 'build')).toThrow('That step cannot be skipped.')
    expect(() => wf.skipStep(id, 'tests')).toThrow('That step cannot be skipped.')
    expect(() => wf.skipStep(id, 'nope')).toThrow('No such step.')
    expect(() => wf.skipStep('nope', 'extra')).toThrow('No such run.')
  })
})

describe('a plan or a build that starts when the person presses Run', () => {
  const FLOW: RunWorkflow = { id: 'g', name: 'G', hash: 'h1', scope: 'project', steps: [{ id: 'plan', kind: 'plan', name: 'Generate plan', start: 'run', gate: 'approve' }, { id: 'build', kind: 'work', name: 'Build', start: 'run' }] }
  const open = () => {
    const o = make()
    o.state.pick = () => FLOW
    o.wf.begin('a1', 'Task')
    return o
  }
  const rid = (wf: Workflows) => wf.runs()[0]!.id
  const state = (wf: Workflows, id: string) => stepStates(wf.runs()[0]!, { auditOn: false }).find((s) => s.id === id)!

  it('holds every edit and commit from the start until Run is pressed, and says on which step', () => {
    const { wf } = open()
    expect(state(wf, 'plan')).toMatchObject({ state: 'waiting', toRun: true })
    expect(wf.editBlock('a1', '/w/src/a.ts', '/w')).toBe('Not yet: the person has not pressed Run on "Generate plan". Wait until you are told to start it.')
    expect(wf.commitBlock('a1', '/w', ['src/a.ts'])).toContain('has not pressed Run')
  })

  it('Run starts the plan: the hold is then the plan\'s own, until it is approved; the build then waits for its own Run', () => {
    const { wf } = open()
    expect(wf.startStep(rid(wf), 'plan')).toBe('Generate plan')
    expect(state(wf, 'plan').state).toBe('running')
    expect(wf.editBlock('a1', '/w/src/a.ts', '/w')).toContain('wants your plan approved first')
    wf.submitPlan('a1', '.agent-world/plan.md', PLAN)
    wf.decide(rid(wf), 'approved')
    expect(state(wf, 'build')).toMatchObject({ state: 'waiting', toRun: true })
    expect(wf.editBlock('a1', '/w/src/a.ts', '/w')).toContain('has not pressed Run on "Build"')
    wf.startStep(rid(wf), 'build')
    expect(wf.editBlock('a1', '/w/src/a.ts', '/w')).toBeNull()
  })

  it('refuses the agent\'s step_done for a build the person has not started', () => {
    const { wf } = open()
    wf.startStep(rid(wf), 'plan')
    wf.submitPlan('a1', '.agent-world/plan.md', PLAN)
    wf.decide(rid(wf), 'approved')
    expect(() => wf.stepDone('a1', 'build')).toThrow('The person has not pressed Run on "Build" yet.')
    wf.startStep(rid(wf), 'build')
    expect(wf.stepDone('a1', 'build').done).toBe('build')
  })

  it('refuses a Run for a step that does not wait for it, one that is not its turn, one already started, and a run that is not there', () => {
    const { wf } = open()
    expect(() => wf.startStep(rid(wf), 'build')).toThrow('That step is not waiting for Run.')
    expect(() => wf.startStep(rid(wf), 'nope')).toThrow('No such step.')
    expect(() => wf.startStep('nope', 'plan')).toThrow('No such run.')
    wf.startStep(rid(wf), 'plan')
    expect(() => wf.startStep(rid(wf), 'plan')).toThrow('That step is not waiting for Run.')
    const plain = make()
    plain.state.pick = () => ({ ...FLOW, steps: [{ id: 'plan', kind: 'plan', name: 'Plan' }, FLOW.steps[1]!] })
    plain.wf.begin('a1', 'Task')
    expect(() => plain.wf.startStep(plain.wf.runs()[0]!.id, 'plan')).toThrow('That step does not wait for Run.')
  })

  it('a step that starts by itself is held by nothing but the plan gate, as before', () => {
    const o = make()
    o.state.pick = () => ({ ...FLOW, steps: [{ id: 'plan', kind: 'plan', name: 'Plan', gate: 'auto' }, { id: 'build', kind: 'work', name: 'Build' }] })
    o.wf.begin('a1', 'Task')
    expect(o.wf.editBlock('a1', '/w/src/a.ts', '/w')).toBeNull()
  })
})
