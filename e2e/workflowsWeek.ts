import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const MIN = 60_000
const H = 3_600_000
const step = (id: string, kind: string, name: string, extra: object = {}) => ({ id, kind, name, ...extra })
const JOURNEY = { id: 'journey', name: 'Journey', hash: 'f2db04f0', scope: 'project', steps: [step('plan', 'plan', 'Plan', { gate: 'approve' }), step('build', 'work', 'Build'), step('tests', 'check', 'Project check', { run: 'node check.js', retries: 2 }), step('review', 'audit', 'Review'), step('land', 'merge', 'Land', { gate: 'approve' })] }
const BUGFIX = { id: 'bug-fix', name: 'Bug fix', hash: 'c1', scope: 'project', steps: [step('build', 'work', 'Build'), step('tests', 'check', 'Project check', { run: 'npm test', retries: 2 }), step('land', 'merge', 'Land', { gate: 'auto' })] }
const QUICK = { id: 'quick-change', name: 'Quick change', hash: 'q1', scope: 'project', steps: [step('quick', 'work', 'Build'), step('land', 'merge', 'Land', { gate: 'auto' })] }
const readback = (goal: string) => ({ goal, assumptions: [{ kind: 'given', text: 'as asked' }], outOfScope: [], questions: [] })

/**
 * A week of eight runs of three agents, as the log would hold them: a check failed once, a plan sent back, a hold lifted and a landing anyway, a run begun from a commit,
 * one still waiting on a plan. With `old`, a ninth run from twenty days ago. Written for the agent `ada` (a real one, so her tab has runs) and two that are only names.
 */
export function seedWeek(home: string, o: { ada: string; project: string; now?: number; old?: boolean }) {
  const n = o.now ?? Date.now()
  const t = (hoursAgo: number, plusMin = 0) => n - hoursAgo * H + plusMin * MIN
  const ev: object[] = []
  const begin = (id: string, agent: string, name: string, title: string, wf: object | undefined, h: number, extra: object = {}) => ev.push({ k: 'begin', t: t(h), run: id, agent, name, project: o.project, title, ...(wf && { workflow: wf }), ...extra })
  const check = (id: string, at: number, attempt: number, ok: boolean, ms: number, head: string) => ev.push({ k: 'check', t: at, run: id, round: 1, step: 'tests', head, attempt, ok, exit: ok ? 0 : 1, timedOut: false, ms, tail: ok ? '' : 'x' })
  const commit = (id: string, at: number, sha: string, subject: string, round = 1) => ev.push({ k: 'commit', t: at, run: id, round, sha, subject })
  const done = (id: string, at: number, summary?: string) => ev.push({ k: 'done', t: at, run: id, ...(summary && { summary }) })
  // ada: the dark-mode toggle, a check that failed once, two findings that were seen
  begin('r1', o.ada, 'ada', 'Add a dark-mode toggle', JOURNEY, 52)
  ev.push({ k: 'plan', t: t(52, 4), run: 'r1', round: 1, state: 'submitted', path: 'p.md', readback: readback('Add a toggle to Settings') }, { k: 'plan', t: t(52, 7), run: 'r1', round: 1, state: 'approved' })
  commit('r1', t(51.5), 'a41f9c2aaa', 'feat(settings): dark-mode toggle')
  ev.push({ k: 'step', t: t(51.4), run: 'r1', round: 1, step: 'build', state: 'done' })
  check('r1', t(51.4, 1), 1, false, 3100, 'a41f9c2aaa')
  commit('r1', t(51.2), 'b72e0d1bbb', 'fix(settings): persist the choice')
  check('r1', t(51.1), 2, true, 2900, 'b72e0d1bbb')
  ev.push({ k: 'audit', t: t(51), run: 'r1', head: 'b72e0d1bbb', state: 'done', findings: [{ kind: 'out-of-scope', file: 'theme.ts', text: 'Renamed a colour token.' }, { kind: 'guess-wrong', text: 'Assumed light is the default.' }], files: 4, lines: 61, truncated: false, cost: 0.03, model: 'haiku' }, { k: 'seen', t: t(50.9), run: 'r1', head: 'b72e0d1bbb', which: [0, 1] }, { k: 'merge', t: t(50.8), run: 'r1', head: 'b72e0d1bbb', how: 'checked', held: [] })
  done('r1', t(50.8), 'Toggle added to Settings.')
  // ada: wordCount, the plan sent back once
  begin('r2', o.ada, 'ada', 'Add wordCount', JOURNEY, 30)
  ev.push({ k: 'plan', t: t(30, 3), run: 'r2', round: 1, state: 'submitted', path: 'p.md', readback: readback('wordCount in words.js') }, { k: 'plan', t: t(30, 9), run: 'r2', round: 1, state: 'changes', note: 'Also handle null' }, { k: 'plan', t: t(30, 12), run: 'r2', round: 1, state: 'submitted', path: 'p.md', readback: readback('wordCount, null safe') }, { k: 'plan', t: t(30, 14), run: 'r2', round: 1, state: 'approved' })
  commit('r2', t(29.7), 'c93d11cccc', 'feat(words): wordCount')
  ev.push({ k: 'step', t: t(29.7), run: 'r2', round: 1, step: 'build', state: 'done' })
  check('r2', t(29.6), 1, true, 900, 'c93d11cccc')
  ev.push({ k: 'audit', t: t(29.5), run: 'r2', head: 'c93d11cccc', state: 'done', findings: [], files: 2, lines: 22, truncated: false, cost: 0.02, model: 'haiku' }, { k: 'merge', t: t(29.4), run: 'r2', head: 'c93d11cccc', how: 'checked', held: [] })
  done('r2', t(29.4), 'wordCount added.')
  // bo: a bug fix with no plan
  begin('r3', 'x-bo', 'bo', 'Fix the login redirect', BUGFIX, 26)
  commit('r3', t(25.8), 'd01aa22dddd', 'fix(auth): keep the return url')
  ev.push({ k: 'step', t: t(25.8), run: 'r3', round: 1, step: 'build', state: 'done' })
  check('r3', t(25.7), 1, true, 5200, 'd01aa22dddd')
  ev.push({ k: 'merge', t: t(25.6), run: 'r3', head: 'd01aa22dddd', how: 'checked', held: [] })
  done('r3', t(25.6), 'Redirect keeps the return url.')
  // bo: the hold lifted, a check that failed once, a finding never seen, landed anyway
  begin('r4', 'x-bo', 'bo', 'Billing export', JOURNEY, 20)
  ev.push({ k: 'plan', t: t(20, 5), run: 'r4', round: 1, state: 'submitted', path: 'p.md', readback: readback('CSV export') }, { k: 'plan', t: t(20, 30), run: 'r4', round: 1, state: 'released' })
  commit('r4', t(19), 'e11bb33eeee', 'feat(billing): csv export')
  ev.push({ k: 'step', t: t(19), run: 'r4', round: 1, step: 'build', state: 'done' })
  check('r4', t(18.9), 1, false, 4000, 'e11bb33eeee')
  commit('r4', t(18.75), 'f22cc44ffff', 'fix(billing): quote commas')
  check('r4', t(18.7), 2, true, 4100, 'f22cc44ffff')
  ev.push({ k: 'audit', t: t(18.6), run: 'r4', head: 'f22cc44ffff', state: 'done', findings: [{ kind: 'goal-unmet', text: 'No test for empty export.' }], files: 3, lines: 74, truncated: false, cost: 0.04, model: 'haiku' }, { k: 'merge', t: t(18.5), run: 'r4', head: 'f22cc44ffff', how: 'anyway', held: ['review'] })
  done('r4', t(18.5), 'CSV export added.')
  // ada: a quick change
  begin('r5', o.ada, 'ada', 'README: how to run the tests', QUICK, 12)
  commit('r5', t(11.9), '1a2b3c4d5e', 'docs: how to run the tests')
  ev.push({ k: 'step', t: t(11.9), run: 'r5', round: 1, step: 'quick', state: 'done' }, { k: 'merge', t: t(11.8), run: 'r5', head: '1a2b3c4d5e', how: 'checked', held: [] })
  done('r5', t(11.8), 'README updated.')
  // cy: begun from a commit
  begin('r6', 'x-cy', 'cy', 'add csv import', undefined, 9, { auto: true })
  commit('r6', t(9), '9f8e7d6c5b', 'add csv import')
  done('r6', t(9))
  // cy: titleCase, with a follow-up round
  begin('r7', 'x-cy', 'cy', 'Add titleCase', JOURNEY, 6)
  ev.push({ k: 'plan', t: t(6, 3), run: 'r7', round: 1, state: 'submitted', path: 'p.md', readback: readback('titleCase') }, { k: 'plan', t: t(6, 5), run: 'r7', round: 1, state: 'approved' })
  commit('r7', t(5.8), '2b3c4d5e6f', 'feat(slug): titleCase')
  ev.push({ k: 'step', t: t(5.8), run: 'r7', round: 1, step: 'build', state: 'done' })
  check('r7', t(5.7), 1, true, 1100, '2b3c4d5e6f')
  done('r7', t(5.6), 'titleCase added.')
  ev.push({ k: 'round', t: t(5), run: 'r7' })
  commit('r7', t(4.9), '3c4d5e6f7a', 'fix(slug): null input', 2)
  done('r7', t(4.8))
  // ada: open, the plan waiting
  begin('r8', o.ada, 'ada', 'Add a slug length limit', JOURNEY, 0.4)
  ev.push({ k: 'plan', t: n - 21 * MIN, run: 'r8', round: 1, state: 'submitted', path: 'p.md', readback: readback('Limit slugs to 60 characters') })
  if (o.old) {
    begin('r9', 'x-bo', 'bo', 'Old export', JOURNEY, 20 * 24)
    done('r9', t(20 * 24, 30))
  }
  writeFileSync(join(home, 'runs.jsonl'), ev.map((e) => JSON.stringify(e)).join('\n') + '\n')
}
