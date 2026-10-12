import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Workflows } from './service'

function make(opts: { enabled?: boolean } = {}) {
  const file = join(mkdtempSync(join(tmpdir(), 'aw-runs-')), 'runs.jsonl')
  const state = { enabled: opts.enabled ?? true, t: 1000, n: 0 }
  const open = () =>
    new Workflows(file, {
      enabled: () => state.enabled,
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

  it('an agent that never began a task has nothing to attach to, and with workflows off only open runs take commits', () => {
    const { wf, state } = make()
    wf.commit('a2', 'aaa111', 'whatever')
    expect(wf.runs()).toEqual([])
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
