import { describe, expect, it } from 'vitest'
import { type RunEvent, reduceRuns, runLabel } from './runs'

const begin = (run: string, t: number, title = 'Fix the login redirect', agent = 'a1'): Extract<RunEvent, { k: 'begin' }> => ({ k: 'begin', t, run, agent, name: 'ada', project: '/p', title })

describe('what a run is, read from its log', () => {
  it('a begun task is an open run with one round', () => {
    const [r] = reduceRuns([begin('r1', 100)])
    expect(r).toMatchObject({ id: 'r1', agent: 'a1', name: 'ada', title: 'Fix the login redirect', status: 'open', startedAt: 100 })
    expect(r!.rounds).toEqual([{ n: 1, startedAt: 100, commits: [] }])
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

  it('a stopped run is closed as stopped, and runs come out oldest first', () => {
    const rs = reduceRuns([begin('r1', 100), begin('r2', 150, 'Import CSV', 'a2'), { k: 'stop', t: 300, run: 'r2' }])
    expect(rs.map((r) => [r.id, r.status])).toEqual([['r1', 'open'], ['r2', 'stopped']])
    expect(rs[1]!.endedAt).toBe(300)
  })

  it('ignores events for a run that was never begun', () => {
    expect(reduceRuns([{ k: 'done', t: 1, run: 'ghost' }, { k: 'commit', t: 2, run: 'ghost', sha: 'x', subject: 'y' }])).toEqual([])
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
