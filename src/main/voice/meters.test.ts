import { describe, expect, it } from 'vitest'
import type { Overview } from '../../shared/ledger'
import type { AgentStats, LimitWindow } from '../../shared/types'
import type { Run } from '../../shared/runs'
import { summarizeAgentStats, summarizeLimits, summarizeRuns, summarizeUsage } from './meters'

const now = Date.parse('2026-11-03T10:00:00Z')
const win = (o: Partial<LimitWindow>): LimitWindow => ({ provider: 'claude', group: 'Claude', kind: 'five_hour', remainingPct: 80, resetsAt: '2026-11-03T12:30:00Z', account: '', ...o })

describe('what is left of the limits, in words', () => {
  it('says how much is left and when it resets, the tightest first', () => {
    const out = summarizeLimits([win({ kind: 'weekly', remainingPct: 40, resetsAt: '2026-11-06T10:00:00Z' }), win({ remainingPct: 12 })], now, () => 'Work')
    expect(out).toEqual([
      { provider: 'claude', login: 'Work', group: 'Claude', window: '5-hour', leftPct: 12, resetsIn: '2h 30m' },
      { provider: 'claude', login: 'Work', group: 'Claude', window: 'weekly', leftPct: 40, resetsIn: '3d 0h' }
    ])
  })
  it('says a reset is due when its time has passed', () => {
    expect(summarizeLimits([win({ resetsAt: '2026-11-03T09:00:00Z' })], now, () => 'Work')[0]!.resetsIn).toBe('due now')
  })
  it('keeps to a dozen windows', () => {
    expect(summarizeLimits(Array.from({ length: 30 }, (_, i) => win({ group: `g${i}` })), now, () => 'x')).toHaveLength(12)
  })
})

const spend = (usd: number, tokens = 0) => ({ usd, tokens })
const ov = {
  days: [
    ...Array.from({ length: 6 }, (_, i) => ({ date: `2026-10-${28 + i}`, by: { claude: spend(1) }, byAccount: {} })),
    { date: '2026-11-03', by: { claude: spend(2), agy: spend(0.5, 1000) }, byAccount: {} }
  ],
  total: spend(8.5, 1000),
  before: spend(6),
  providers: [],
  projects: [
    { project: 'shop', lastAt: 0, by: {}, byAccount: {}, agents: [{ agent: 'voice', name: 'Voice', usd: 0.4, tokens: 0 }, { agent: 'a1', name: 'ada', usd: 3, tokens: 500 }], usd: 3.4, tokens: 500 },
    { project: 'secret-other', lastAt: 0, by: {}, byAccount: {}, agents: [], usd: 5, tokens: 0 }
  ],
  models: [{ model: 'sonnet', provider: 'claude', usd: 6, tokens: 0 }, { model: 'haiku', provider: 'claude', usd: 2, tokens: 0 }],
  accounts: [],
  month: { spent: spend(40), projected: spend(120), day: 3, of: 30 }
} as unknown as Overview

describe('what has been spent, in words', () => {
  it('gives today, the whole window, and the month so far with where it is heading', () => {
    const u = summarizeUsage(ov, 'shop', 7)
    expect(u.today).toEqual({ usd: 2.5, tokens: 1000 })
    expect(u.lastDays).toEqual({ days: 7, usd: 8.5, tokens: 1000, before: 6 })
    expect(u.month).toEqual({ spentUsd: 40, projectedUsd: 120, day: 3, of: 30 })
  })
  it('names the top models', () => {
    expect(summarizeUsage(ov, 'shop', 7).topModels.map((m) => m.model)).toEqual(['sonnet', 'haiku'])
  })
  it('tells only this workspace\'s project, with the voice\'s own share, and leaves other projects out', () => {
    const u = summarizeUsage(ov, 'shop', 7)
    expect(u.thisProject).toEqual({ name: 'shop', usd: 3.4, voiceUsd: 0.4 })
    expect(JSON.stringify(u)).not.toContain('secret-other')
  })
  it('has no project when this one has not spent anything yet', () => {
    expect(summarizeUsage(ov, 'new-one', 7).thisProject).toBeNull()
  })
  it('rounds small amounts to a tenth of a cent and larger to a cent', () => {
    expect(summarizeUsage({ ...ov, total: spend(0.0123456) } as Overview, 'shop', 7).lastDays.usd).toBe(0.012)
    expect(summarizeUsage({ ...ov, total: spend(12.3456) } as Overview, 'shop', 7).lastDays.usd).toBe(12.35)
  })
})

const stats = (o: Partial<AgentStats>): AgentStats => ({ sessionId: 's', model: 'sonnet', contextPct: 41, costUsd: 1.234, linesAdded: 30, linesRemoved: 4, effort: null, fast: false, limits: {} as AgentStats['limits'], ...o })

describe('what each agent has done so far, in numbers', () => {
  it('gives the model, the context used, the spend and the lines', () => {
    expect(summarizeAgentStats([{ name: 'ada', stats: stats({}) }])).toEqual([{ name: 'ada', model: 'sonnet', contextPct: 41, spentUsd: 1.23, linesAdded: 30, linesRemoved: 4 }])
  })
  it('gives just the name of an agent that has reported nothing yet', () => {
    expect(summarizeAgentStats([{ name: 'hai' }])).toEqual([{ name: 'hai' }])
  })
})

const run = (o: Partial<Run> & { id: string }): Run => ({ agent: 'a1', name: 'ada', project: 'shop', title: 'Add discount codes', status: 'open', startedAt: now - 12 * 60_000, rounds: [], ...o }) as Run
const wf = { id: 'standard', name: 'Standard', steps: [{ id: 'plan', kind: 'plan', name: 'Plan' }, { id: 'build', kind: 'work', name: 'Build' }, { id: 'review', kind: 'check', name: 'Review' }] } as unknown as NonNullable<Run['workflow']>

describe('what the workflow runs of this workspace are doing', () => {
  it('names the open runs with the step each is at, counted from what the round has done', () => {
    const r = run({ id: 'r1', workflow: wf, rounds: [{ n: 1, startedAt: 0, commits: [], steps: [{ step: 'plan', state: 'approved', t: 1 }], checks: [] }] as unknown as Run['rounds'] })
    expect(summarizeRuns([r], 'shop', now).open).toEqual([{ agent: 'ada', title: 'Add discount codes', workflow: 'Standard', step: 'Build', startedMinutesAgo: 12, reopened: 0 }])
  })
  it('has no step for a run that follows no workflow', () => {
    expect(summarizeRuns([run({ id: 'r2' })], 'shop', now).open[0]).toMatchObject({ workflow: null, step: null })
  })
  it('lists the last few that ended, newest first, with how they ended', () => {
    const ended = Array.from({ length: 7 }, (_, i) => run({ id: `e${i}`, status: i % 2 ? 'stopped' : 'done', endedAt: now - (7 - i) * 3_600_000, title: `Task ${i}`, summary: 'x'.repeat(300) }))
    const r = summarizeRuns(ended, 'shop', now).recent
    expect(r).toHaveLength(5)
    expect(r[0]).toMatchObject({ title: 'Task 6', status: 'done' })
    expect(r[0]!.summary!.length).toBeLessThanOrEqual(161)
  })
  it('leaves out runs of other projects', () => {
    const out = summarizeRuns([run({ id: 'x', project: 'other', title: 'secret' }), run({ id: 'y' })], 'shop', now)
    expect(JSON.stringify(out)).not.toContain('secret')
  })
})
