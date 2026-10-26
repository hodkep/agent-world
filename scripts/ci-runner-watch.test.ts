import { describe, expect, it } from 'vitest'
// @ts-expect-error a plain .mjs script, run by CI
import { notice, waiting } from './ci-runner-watch.mjs'

const MIN = 60_000
const t0 = Date.parse('2026-10-26T10:00:00Z')
const job = (name: string, status: string, o: Record<string, string | null> = {}) => ({ name, status, created_at: '2026-10-26T10:00:00Z', started_at: null, conclusion: null, ...o })

describe('e2e jobs no Mac has picked up', () => {
  it('names the queued e2e jobs that have waited the grace time', () => {
    const jobs = [job('e2e (1)', 'queued'), job('e2e (2)', 'queued'), job('checks', 'completed', { started_at: '2026-10-26T10:00:05Z' })]
    expect(waiting(jobs, t0 + 5 * MIN, 5 * MIN)).toEqual(['e2e (1)', 'e2e (2)'])
  })

  it('says nothing before the grace time, and nothing for a job that started or finished', () => {
    const jobs = [job('e2e (1)', 'queued'), job('e2e (2)', 'in_progress', { started_at: '2026-10-26T10:00:40Z' }), job('e2e (3)', 'completed', { started_at: '2026-10-26T10:01:00Z', conclusion: 'success' })]
    expect(waiting(jobs, t0 + 4 * MIN, 5 * MIN)).toEqual([])
    expect(waiting(jobs, t0 + 6 * MIN, 5 * MIN)).toEqual(['e2e (1)'])
  })

  it('leaves out jobs that are not the end-to-end shards, and a job cancelled without starting is not waiting', () => {
    const jobs = [job('test (macos-latest)', 'queued'), job('e2e (4)', 'completed', { conclusion: 'cancelled' })]
    expect(waiting(jobs, t0 + 20 * MIN, 5 * MIN)).toEqual([])
  })
})

describe('what the pull request is told', () => {
  const md = notice({ names: ['e2e (1)', 'e2e (3)'], minutes: 5, runUrl: 'https://github.com/o/r/actions/runs/1', sha: 'abc1234' })

  it('says which shards wait, for how long, and the command to run on a Mac of your own', () => {
    expect(md).toContain('e2e (1), e2e (3)')
    expect(md).toContain('5 minutes')
    expect(md).toContain('pnpm verify:local --comment')
    expect(md).toContain('abc1234')
    expect(md).toContain('https://github.com/o/r/actions/runs/1')
  })

  it('leaves the merge to the owner, and keeps a marker so one comment is updated, not a new one each time', () => {
    expect(md).toMatch(/owner/i)
    expect(md).toContain('<!-- e2e-no-mac -->')
  })
})
