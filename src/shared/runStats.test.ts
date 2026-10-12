import { describe, expect, it } from 'vitest'
import type { LedgerEvent } from './ledger'
import { type RunEvent, reduceRuns } from './runs'
import { agentCounts, auditText, checkText, landedText, formatCost, spendText, formatDuration, formatTokens, howRunsBegan, runSpend, runStats, runsThisWeek } from './runStats'

const MIN = 60_000
// Wednesday 2026-10-14 12:00 local; the week began Monday 2026-10-12.
const NOW = new Date(2026, 9, 14, 12).getTime()
const day = (d: number, h = 10) => new Date(2026, 9, d, h).getTime()
const begin = (run: string, t: number, agent: string, name: string, extra: object = {}): RunEvent => ({ k: 'begin', t, run, agent, name, project: '/p', title: `task ${run}`, ...extra }) as RunEvent
const commit = (run: string, t: number, sha: string, flagged = false): RunEvent => ({ k: 'commit', t, run, sha, subject: sha, ...(flagged && { flagged }) })

const events: RunEvent[] = [
  begin('old', day(5), 'a1', 'ada'),
  { k: 'done', t: day(5, 11), run: 'old' },
  begin('r1', day(12), 'a1', 'ada'),
  commit('r1', day(12, 11), 'c1'),
  { k: 'done', t: day(12, 12), run: 'r1' },
  { k: 'round', t: day(13, 0), run: 'r1' },
  commit('r1', day(13, 1), 'c2', true),
  { k: 'done', t: day(13, 2), run: 'r1' },
  begin('r2', day(13), 'a2', 'bo'),
  commit('r2', day(13, 5), 'c3'),
  begin('r3', day(14, 9), 'a1', 'ada', { auto: true }),
  { k: 'done', t: day(14, 9), run: 'r3' }
]
const runs = reduceRuns(events)

describe('which runs belong to this week', () => {
  it('keeps a run that overlaps the week, including one still open, and drops last week\'s', () => {
    expect(runsThisWeek(runs, NOW).map((r) => r.id)).toEqual(['r1', 'r2', 'r3'])
  })
})

describe('the numbers over a set of runs', () => {
  it('counts runs, rounds, open ones, commits and flagged commits, and the ones the app started', () => {
    const s = runStats(runsThisWeek(runs, NOW), NOW)
    expect(s).toMatchObject({ runs: 3, rounds: 4, open: 1, commits: 3, flagged: 1, byApp: 1 })
  })
  it('adds up the time of the runs the agent announced, an open one counting until now, and leaves out those whose start the app cannot know', () => {
    // r1: round 1 is 10:00-12:00 on the 12th (2 h) and round 2 is 00:00-02:00 on the 13th (2 h), so 4 h; the time between them is nobody's.
    // r2: open from the 13th 10:00 to now (the 14th 12:00) = 26 h.
    expect(runStats(runsThisWeek(runs, NOW), NOW).ms).toBe((4 + 26) * 60 * MIN)
  })
})

describe('breakdowns', () => {
  it('counts runs per agent, most first, and how runs began', () => {
    const week = runsThisWeek(runs, NOW)
    expect(agentCounts(week)).toEqual([{ name: 'ada', n: 2 }, { name: 'bo', n: 1 }])
    expect(howRunsBegan(week)).toEqual({ announced: 2, byApp: 1 })
  })
})

describe('what a run cost, from the ledger', () => {
  const ledger: LedgerEvent[] = [
    { k: 'cost', t: day(12, 11), agent: 'a1', project: '/p', model: 'sonnet', usd: 0.5 },
    { k: 'cost', t: day(12, 20), agent: 'a1', project: '/p', model: 'sonnet', usd: 9 }, // between rounds: nobody's
    { k: 'cost', t: day(13, 1), agent: 'a1', project: '/p', model: 'sonnet', usd: 0.25 },
    { k: 'cost', t: day(13, 11), agent: 'a2', project: '/p', model: 'sonnet', usd: 2 },
    { k: 'tokens', t: day(13, 11), agent: 'a2', project: '/p', model: 'gem', input: 1000, output: 500 }
  ]
  it('adds what the agent spent inside each round\'s window, and not between rounds', () => {
    const r1 = runs.find((r) => r.id === 'r1')!
    expect(runSpend(r1, ledger, NOW).rounds).toEqual([{ usd: 0.5, tokens: 0 }, { usd: 0.25, tokens: 0 }])
    expect(runSpend(r1, ledger, NOW)).toMatchObject({ usd: 0.75, tokens: 0 })
  })
  it('counts tokens for a program that reports them, and an open run until now', () => {
    expect(runSpend(runs.find((r) => r.id === 'r2')!, ledger, NOW)).toMatchObject({ usd: 2, tokens: 1500 })
  })
  it('is nothing for a run the app started, whose start it cannot know', () => {
    expect(runSpend(runs.find((r) => r.id === 'r3')!, ledger, NOW)).toMatchObject({ usd: 0, tokens: 0, known: false })
  })
})

describe('writing numbers for people', () => {
  it('durations, cost and tokens', () => {
    expect(formatDuration(9 * MIN)).toBe('9m')
    expect(formatDuration(200 * MIN)).toBe('3 h 20 m')
    expect(formatDuration(120 * MIN)).toBe('2 h')
    expect(formatDuration(0)).toBe('under 1m')
    expect(formatCost(0.841)).toBe('$0.84')
    expect(formatCost(0)).toBe('$0')
    expect(formatTokens(38_400)).toBe('38k')
    expect(formatTokens(1500)).toBe('1.5k')
    expect(formatTokens(420)).toBe('420')
  })
})

describe('the cost cell of a run', () => {
  it('shows money, or tokens for a program that reports no price, or a dash where the app cannot know', () => {
    expect(spendText({ usd: 0.75, tokens: 0, known: true })).toBe('$0.75')
    expect(spendText({ usd: 0, tokens: 1500, known: true })).toBe('1.5k tokens')
    expect(spendText({ usd: 0, tokens: 0, known: true })).toBe('$0')
    expect(spendText({ usd: 0, tokens: 0, known: false })).toBe('—')
    expect(spendText(undefined)).toBe('—')
  })
})

describe('what the Workflow tab says about the audit and the landing', () => {
  const audited = (...extra: RunEvent[]) => reduceRuns([begin('r1', 1000, 'a1', 'ada'), { k: 'audit', t: 2000, run: 'r1', head: 'h1', state: 'done', findings: [{ kind: 'out-of-scope', text: 'x' }, { kind: 'guess-wrong', text: 'y' }], files: 3, lines: 120, truncated: false, cost: 0.004, model: 'claude-haiku-5-5' }, ...extra])[0]!

  it('the audit line counts findings and the unseen ones, with the model and cost', () => {
    expect(auditText(audited())).toBe('Audit: 2 findings, 2 unseen · claude-haiku-5-5 · $0.0040')
    expect(auditText(audited({ k: 'seen', t: 2100, run: 'r1', head: 'h1', which: [0, 1] }))).toBe('Audit: 2 findings, all seen · claude-haiku-5-5 · $0.0040')
    expect(auditText(reduceRuns([begin('r1', 1000, 'a1', 'ada'), { k: 'audit', t: 2000, run: 'r1', head: 'h1', state: 'done', findings: [], files: 1, lines: 4, truncated: false }])[0]!)).toBe('Audit: nothing found')
    expect(auditText(reduceRuns([begin('r1', 1000, 'a1', 'ada'), { k: 'audit', t: 2000, run: 'r1', head: 'h1', state: 'failed', reason: 'timed out' }])[0]!)).toBe('Audit failed: timed out')
    expect(auditText(reduceRuns([begin('r1', 1000, 'a1', 'ada')])[0]!)).toBeUndefined()
  })

  it('the landing line says it was checked, or what was still holding it when the person landed anyway', () => {
    const run = (how: 'checked' | 'anyway', held: string[]) => reduceRuns([begin('r1', 1000, 'a1', 'ada'), { k: 'merge', t: 3000, run: 'r1', head: 'h1', how, held }])[0]!
    expect(landedText(run('checked', []))).toBe('Landed after the checks')
    expect(landedText(run('anyway', ['No plan was approved for this task.', '2 audit findings have not been seen.']))).toBe('Landed anyway: No plan was approved for this task. 2 audit findings have not been seen.')
    expect(landedText(reduceRuns([begin('r1', 1000, 'a1', 'ada')])[0]!)).toBeUndefined()
  })
})

describe('what the plan panel says about the intent check', () => {
  it('says how many questions it added with the model and cost, or that it found nothing, or why it failed, and nothing when none ran', () => {
    expect(checkText({ added: 2, cost: 0.0006, model: 'claude-haiku-5-5' })).toBe('The intent check added 2 questions · claude-haiku-5-5 · $0.0006')
    expect(checkText({ added: 1 })).toBe('The intent check added 1 question')
    expect(checkText({ added: 0, cost: 0.0004, model: 'claude-haiku-5-5' })).toBe('The intent check found nothing to add · claude-haiku-5-5 · $0.0004')
    expect(checkText({ failed: 'claude timed out' })).toBe('The intent check failed: claude timed out. This is the plan as the agent wrote it.')
    expect(checkText(undefined)).toBeUndefined()
  })
})
