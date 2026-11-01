import { describe, expect, it } from 'vitest'
import { type RunEvent, type RunWorkflow, reduceRuns } from './runs'
import { checkFailed, checkGaveUp, checkPanels, checkPassed, finishable, needsApproval, readyForAudit, stepFinished, stepReply, stepSkipped, stepStarted, stepStates, toRunSteps, waitingSteps } from './steps'

const STANDARD: RunWorkflow = { id: 'standard', name: 'Standard', steps: [{ id: 'plan', kind: 'plan', name: 'Plan' }, { id: 'build', kind: 'work', name: 'Build' }, { id: 'review', kind: 'audit', name: 'Audit' }, { id: 'land', kind: 'merge', name: 'Land' }] }
const REVIEWED: RunWorkflow = { id: 'reviewed', name: 'Reviewed', steps: [{ id: 'plan', kind: 'plan', name: 'Plan' }, { id: 'fix', kind: 'work', name: 'Fix' }, { id: 'ok', kind: 'approve', name: 'Your review', gate: 'approve' }, { id: 'land', kind: 'merge', name: 'Land' }] }
const PULL: RunWorkflow = { id: 'pull', name: 'Pull', steps: [{ id: 'plan', kind: 'plan', name: 'Plan' }, { id: 'build', kind: 'work', name: 'Build' }, { id: 'review', kind: 'audit', name: 'Audit' }, { id: 'pr', kind: 'pr', name: 'Pull request' }] }
const begin = (workflow?: RunWorkflow): RunEvent => ({ k: 'begin', t: 100, run: 'r1', agent: 'a1', name: 'ada', project: '/p', title: 'Task', ...(workflow && { workflow }) })
const readback = { goal: 'g', assumptions: [], outOfScope: [], questions: [] }
const submitted = (t = 200): RunEvent => ({ k: 'plan', t, run: 'r1', round: 1, state: 'submitted', path: 'p.md', readback })
const decided = (state: 'approved' | 'changes' | 'released', t = 300): RunEvent => ({ k: 'plan', t, run: 'r1', round: 1, state })
const step = (id: string, state: 'done' | 'approved' | 'changes' | 'skipped' | 'declined' | 'rerun', t = 400, round = 1): RunEvent => ({ k: 'step', t, run: 'r1', round, step: id, state })
const states = (events: RunEvent[], ctx = { auditOn: true }) => stepStates(reduceRuns(events)[0]!, ctx).map((s) => `${s.id}:${s.state}`)

describe('where a run stands in its workflow', () => {
  it('has no steps for a run that follows no workflow', () => {
    expect(states([begin()])).toEqual([])
  })

  it('a fresh run is at its plan, and everything after waits', () => {
    expect(states([begin(STANDARD)])).toEqual(['plan:running', 'build:pending', 'review:pending', 'land:pending'])
  })

  it('a plan handed in waits for the person; sent back, it is the agent\'s again; approved, the build is next', () => {
    expect(states([begin(STANDARD), submitted()])).toEqual(['plan:waiting', 'build:pending', 'review:pending', 'land:pending'])
    expect(states([begin(STANDARD), submitted(), decided('changes')])[0]).toBe('plan:running')
    expect(states([begin(STANDARD), submitted(), decided('approved')])).toEqual(['plan:passed', 'build:running', 'review:pending', 'land:pending'])
    expect(states([begin(STANDARD), decided('released')])[0]).toBe('plan:passed')
  })
})

describe('the audit and the landing, which the app and the person do', () => {
  const audit = (head = 'h1', t = 500): RunEvent => ({ k: 'audit', t, run: 'r1', head, state: 'done', findings: [{ kind: 'out-of-scope', text: 'x' }], files: 1, lines: 4, truncated: false })
  const seen = (t = 520): RunEvent => ({ k: 'seen', t, run: 'r1', head: 'h1', which: [0] })
  const landed = (t = 600): RunEvent => ({ k: 'merge', t, run: 'r1', head: 'h1', how: 'checked', held: [] })
  const built = [begin(STANDARD), decided('released'), step('build', 'done')]

  it('they are never "running": until the build is done they wait their turn, and after it the audit waits to be asked for at Finish', () => {
    expect(states([begin(STANDARD), decided('released')])).toEqual(['plan:passed', 'build:running', 'review:pending', 'land:pending'])
    expect(states(built)).toEqual(['plan:passed', 'build:passed', 'review:pending', 'land:pending'])
  })

  it('an audit with findings not yet seen waits for the person; once seen it has passed and landing is the person\'s to do', () => {
    expect(states([...built, audit()])).toEqual(['plan:passed', 'build:passed', 'review:waiting', 'land:pending'])
    expect(states([...built, audit(), seen()])).toEqual(['plan:passed', 'build:passed', 'review:passed', 'land:waiting'])
    expect(states([...built, audit(), seen(), landed()])).toEqual(['plan:passed', 'build:passed', 'review:passed', 'land:passed'])
  })

  it('a pull request step is the landing too: the person\'s to do once the audit is seen, and passed when the push was let through', () => {
    const pulled = [begin(PULL), decided('released'), step('build', 'done')]
    expect(states([...pulled, audit(), seen()])).toEqual(['plan:passed', 'build:passed', 'review:passed', 'pr:waiting'])
    expect(states([...pulled, audit(), seen(), landed()])).toEqual(['plan:passed', 'build:passed', 'review:passed', 'pr:passed'])
    expect(states([...pulled, audit()])).toEqual(['plan:passed', 'build:passed', 'review:waiting', 'pr:pending'])
  })

  it('an audit the person set aside is skipped, so landing is theirs to do, and asking for it again brings the findings back', () => {
    expect(states([...built, audit(), step('review', 'skipped', 530)])).toEqual(['plan:passed', 'build:passed', 'review:skipped', 'land:waiting'])
    expect(states([...built, audit(), step('review', 'skipped', 530), step('review', 'rerun', 540)])).toEqual(['plan:passed', 'build:passed', 'review:waiting', 'land:pending'])
  })

  it('with no audit to run (the economy dial, or a program that cannot) the audit is skipped and the landing follows the build', () => {
    expect(states(built, { auditOn: false })).toEqual(['plan:passed', 'build:passed', 'review:skipped', 'land:waiting'])
  })
})

describe('steps the person approves', () => {
  const REVIEW_GATE: RunWorkflow = { id: 'g', name: 'G', steps: [{ id: 'fix', kind: 'work', name: 'Fix', gate: 'approve' }, { id: 'land', kind: 'merge', name: 'Land' }] }

  it('an approve step waits for the person once the steps before it are done, and passes when they approve', () => {
    const base = [begin(REVIEWED), decided('released'), step('fix', 'done')]
    expect(states(base)).toEqual(['plan:passed', 'fix:passed', 'ok:waiting', 'land:pending'])
    expect(states([...base, step('ok', 'approved')])).toEqual(['plan:passed', 'fix:passed', 'ok:passed', 'land:waiting'])
  })

  it('sent back, it is the agent\'s again until the agent says it has done the work again, and then it waits for the person once more', () => {
    const sentBack = [begin(REVIEWED), decided('released'), step('fix', 'done', 400), step('ok', 'changes', 500)]
    expect(states(sentBack)).toEqual(['plan:passed', 'fix:passed', 'ok:running', 'land:pending'])
    expect(states([...sentBack, step('fix', 'done', 600)])).toEqual(['plan:passed', 'fix:passed', 'ok:waiting', 'land:pending'])
  })

  it('a work step with gate approve is done when the agent says so but passes only when the person has approved it', () => {
    expect(states([begin(REVIEW_GATE), step('fix', 'done')])).toEqual(['fix:waiting', 'land:pending'])
    expect(states([begin(REVIEW_GATE), step('fix', 'done', 400), step('fix', 'approved', 500)])).toEqual(['fix:passed', 'land:waiting'])
    expect(states([begin(REVIEW_GATE), step('fix', 'done', 400), step('fix', 'changes', 500)])).toEqual(['fix:running', 'land:pending'])
  })
})

describe('a plan nobody needed, and follow-up rounds', () => {
  it('the plan is skipped when the work went ahead without one, or when the run ended without one', () => {
    expect(states([begin(STANDARD), step('build', 'done')])[0]).toBe('plan:skipped')
    expect(states([begin(STANDARD), { k: 'done', t: 900, run: 'r1' }])[0]).toBe('plan:skipped')
  })

  it('a follow-up round starts over for the steps the agent does, skips the plan it was not asked for, and does not count an earlier audit or landing', () => {
    const audit: RunEvent = { k: 'audit', t: 500, run: 'r1', head: 'h1', state: 'done', findings: [], files: 1, lines: 4, truncated: false }
    const landed: RunEvent = { k: 'merge', t: 600, run: 'r1', head: 'h1', how: 'checked', held: [] }
    const first = [begin(STANDARD), submitted(), decided('approved'), step('build', 'done', 400), audit, landed, { k: 'done', t: 700, run: 'r1' } as RunEvent]
    expect(states(first)).toEqual(['plan:passed', 'build:passed', 'review:passed', 'land:passed'])
    const second = [...first, { k: 'round', t: 800, run: 'r1' } as RunEvent]
    expect(states(second)).toEqual(['plan:skipped', 'build:running', 'review:pending', 'land:pending'])
    const run = reduceRuns(second)[0]!
    expect(stepStates(run, { auditOn: true }, 1).map((s) => s.state)).toEqual(['passed', 'passed', 'passed', 'passed'])
  })
})

describe('what the person\'s answer to a step says to the agent', () => {
  it('approved: the step passed and the work can go on; sent back: what to change and to report again', () => {
    expect(stepReply('Your review', 'approved')).toBe('Your step "Your review" was approved.')
    expect(stepReply('Your review', 'approved', 'Looks good.')).toBe('Your step "Your review" was approved. They said: Looks good.')
    expect(stepReply('Your review', 'changes', 'Make it smaller.')).toBe('Your step "Your review" was sent back: Make it smaller. Make the change, then call step_done again.')
    expect(stepReply('Your review', 'changes')).toBe('Your step "Your review" was sent back. Make the change, then call step_done again.')
  })

  it('a pull request or merge that is sent back may mean not needed or a change: the agent is told to ask to skip it, or to commit the change', () => {
    const t = stepReply('Pull request', 'changes', 'not needed', 'pr')
    expect(t).toContain('Your step "Pull request" was sent back: not needed.')
    expect(t).toContain('If that means the step is not needed, ask the person to skip it with skip_steps.')
    expect(t).toContain('If it means a change, make it and commit it on your own branch')
    expect(stepReply('Land', 'changes', undefined, 'merge')).toContain('skip_steps')
  })
  it('an audit that is sent back is still a change to commit, and the audit and the approval come again', () => {
    expect(stepReply('Audit', 'changes', undefined, 'audit')).toBe('Your step "Audit" was sent back. Make the change and commit it on your own branch; the audit runs again and the person is asked again. Do not push until they approve.')
  })
})

describe('the steps waiting for the person across runs', () => {
  it('lists each step of a run that waits for an approval, with its brief, and not a plan, an audit or a landing', () => {
    const wf: RunWorkflow = { id: 'r', name: 'R', steps: [{ id: 'plan', kind: 'plan', name: 'Plan' }, { id: 'fix', kind: 'work', name: 'Fix' }, { id: 'ok', kind: 'approve', name: 'Your review', brief: 'Look at the diff.' }, { id: 'land', kind: 'merge', name: 'Land' }] }
    const events = [begin(wf), decided('released'), step('fix', 'done')]
    const waiting = waitingSteps(reduceRuns(events), { auditOn: true })
    expect(waiting.map((w) => [w.run.id, w.step.id, w.step.brief])).toEqual([['r1', 'ok', 'Look at the diff.']])
    expect(waitingSteps(reduceRuns([...events, step('ok', 'approved', 500)]), { auditOn: true })).toEqual([])
    // The agent finishing its work does not take the person's approval away: landing still waits for it.
    expect(waitingSteps(reduceRuns([...events, { k: 'done', t: 900, run: 'r1' }]), { auditOn: true }).map((w) => w.step.id)).toEqual(['ok'])
    expect(waitingSteps(reduceRuns([...events, { k: 'stop', t: 900, run: 'r1' }]), { auditOn: true })).toEqual([])
    expect(waitingSteps(reduceRuns([begin(STANDARD), submitted()]), { auditOn: true })).toEqual([])
  })
})

describe('a step that starts when the person presses Run', () => {
  const COMMIT: RunWorkflow = { id: 'c', name: 'C', steps: [{ id: 'plan', kind: 'plan', name: 'Plan', gate: 'auto' }, { id: 'build', kind: 'work', name: 'Build' }, { id: 'commit', kind: 'work', name: 'Commit', start: 'run' }] }
  const waits = [begin(COMMIT), decided('released'), step('build', 'done')]

  it('waits for Run only: it has a Run card and no approval card for the same step', () => {
    expect(toRunSteps(reduceRuns(waits), () => ({ auditOn: true })).map((x) => x.step.id)).toEqual(['commit'])
    expect(waitingSteps(reduceRuns(waits), { auditOn: true })).toEqual([])
  })

  it('once the agent has done it, it waits for approval if its gate asks, and has no Run card', () => {
    const asks: RunWorkflow = { ...COMMIT, steps: COMMIT.steps.map((x) => (x.id === 'commit' ? { ...x, gate: 'approve' as const } : x)) }
    const done = [begin(asks), decided('released'), step('build', 'done'), { k: 'start', t: 450, run: 'r1', round: 1, step: 'commit' } as RunEvent, step('commit', 'done', 500)]
    expect(toRunSteps(reduceRuns(done), () => ({ auditOn: true }))).toEqual([])
    expect(waitingSteps(reduceRuns(done), { auditOn: true }).map((w) => w.step.id)).toEqual(['commit'])
  })
})

describe('a plan the workflow does not ask for', () => {
  const flow = (gate?: 'auto' | 'approve'): RunWorkflow => ({ id: 'f', name: 'F', steps: [{ id: 'plan', kind: 'plan', name: 'Plan', ...(gate && { gate }) }, { id: 'build', kind: 'work', name: 'Build' }] })
  const first = (w: RunWorkflow) => stepStates(reduceRuns([begin(w)])[0]!, { auditOn: true }).map((s) => `${s.id}:${s.state}`)

  it('is not needed from the start when the step says auto; one that says approve, or says nothing, is in progress', () => {
    expect(first(flow('auto'))).toEqual(['plan:skipped', 'build:running'])
    expect(first(flow())).toEqual(['plan:running', 'build:pending'])
    expect(first(flow('approve'))).toEqual(['plan:running', 'build:pending'])
  })
})

describe('a check step', () => {
  const CHECKED: RunWorkflow = { id: 'c', name: 'C', steps: [{ id: 'plan', kind: 'plan', name: 'Plan', gate: 'auto' }, { id: 'build', kind: 'work', name: 'Build' }, { id: 'tests', kind: 'check', name: 'Tests pass', run: 'npm test', gate: 'pass', retries: 2 }, { id: 'land', kind: 'merge', name: 'Land' }] }
  const built: RunEvent[] = [begin(CHECKED), step('build', 'done', 300)]
  const ran = (attempt: number, ok: boolean, t = 400 + attempt, head = 'h1'): RunEvent => ({ k: 'check', t, run: 'r1', round: 1, step: 'tests', head, attempt, ok, exit: ok ? 0 : 1, timedOut: false, ms: 900, tail: 'x' })
  const chk = (events: RunEvent[], ctx: { auditOn: boolean; planGate?: boolean; approved?: boolean; head?: string } = { auditOn: false }) => stepStates(reduceRuns(events)[0]!, ctx).find((s) => s.id === 'tests')!
  const at = (events: RunEvent[], ctx?: { auditOn: boolean; approved?: boolean; head?: string }) => {
    const s = chk(events, ctx)
    return `${s.state}${s.tries ? ` after ${s.tries}` : ''}`
  }

  it('waits its turn until the work before it is done, then is running: the app runs it', () => {
    expect(at([begin(CHECKED)])).toBe('pending')
    expect(at(built)).toBe('running')
  })

  it('waits for the person when its file\'s commands are not approved, and does not run before', () => {
    expect(at(built, { auditOn: false, approved: false })).toBe('waiting')
    expect(at([...built, ran(1, true)], { auditOn: false, approved: false })).toBe('passed')
  })

  it('passed when the last run passed, however many tries it took, and keeps how often it failed on the way', () => {
    expect(at([...built, ran(1, false), ran(2, true)])).toBe('passed after 1')
    expect(at([...built, ran(1, false), ran(2, false), ran(3, true)])).toBe('passed after 2')
    expect(at([...built, ran(1, true)])).toBe('passed')
  })

  it('failed once or twice it is still the agent\'s to fix, and failed on every try it has failed', () => {
    expect(at([...built, ran(1, false)])).toBe('running after 1')
    expect(at([...built, ran(1, false), ran(2, false)])).toBe('running after 2')
    expect(at([...built, ran(1, false), ran(2, false), ran(3, false)])).toBe('failed after 3')
  })

  it('a result for another head of the branch is stale: the check is due again', () => {
    expect(at([...built, ran(1, true, 410, 'old')], { auditOn: false, head: 'new' })).toBe('running')
    expect(at([...built, ran(1, true, 410, 'new')], { auditOn: false, head: 'new' })).toBe('passed')
  })

  it('the person can skip it, decline its commands (which is failed), or ask for it again, which gives it its tries back', () => {
    expect(at([...built, ran(1, false), ran(2, false), ran(3, false), step('tests', 'skipped', 500)])).toBe('skipped')
    expect(at([...built, step('tests', 'declined', 450)])).toBe('failed')
    expect(at([...built, ran(1, false), ran(2, false), ran(3, false), step('tests', 'rerun', 500)])).toBe('running')
    expect(at([...built, ran(1, false), ran(2, false), ran(3, false), step('tests', 'rerun', 500), ran(1, false, 510)])).toBe('running after 1')
  })

  it('a step after a check that has not passed waits for it, whether it is running, waiting or failed', () => {
    const land = (events: RunEvent[]) => stepStates(reduceRuns(events)[0]!, { auditOn: false }).find((s) => s.id === 'land')!.state
    expect([land(built), land([...built, ran(1, false), ran(2, false), ran(3, false)])]).toEqual(['pending', 'pending'])
    expect(land([...built, ran(1, true)])).toBe('waiting')
  })
})

describe('what the agent is told when a check fails', () => {
  it('says which check, which try, what the command did and what it printed, and what to do next', () => {
    expect(checkFailed({ name: 'Tests pass', run: 'npm test', try: 1, of: 3, result: { exit: 1, timedOut: false, tail: 'FAIL src/a.test.ts\n  expected 1', ms: 1200 } })).toBe(
      'The check "Tests pass" failed (try 1 of 3): `npm test` exited with 1. What it printed last:\nFAIL src/a.test.ts\n  expected 1\nFix it, commit, then call step_done again. This is still the same task, so do not call task_begin again.'
    )
  })

  it('says a command that did not finish in time was stopped, and that it printed nothing when it did not', () => {
    expect(checkFailed({ name: 'Lint', run: 'npm run lint', try: 2, of: 3, result: { exit: null, timedOut: true, tail: '', ms: 300000 } })).toBe('The check "Lint" failed (try 2 of 3): `npm run lint` did not finish in 5 minutes and was stopped. It printed nothing.\nFix it, commit, then call step_done again. This is still the same task, so do not call task_begin again.')
  })

  it('when it will not be sent back again, says the person has been asked and that nothing more should change', () => {
    expect(checkGaveUp({ name: 'Tests pass', tries: 3 })).toBe('The check "Tests pass" still fails after 3 tries. The person has been asked what to do; change nothing more until they answer.')
  })
})

describe('what the agent is told when the person approves a check and it passes', () => {
  it('says the check passed, with its command and time, and that nothing more is needed for it', () => {
    expect(checkPassed({ name: 'Tests pass', run: 'npm test', ms: 1234 })).toBe('The person approved the commands and the check "Tests pass" passed (`npm test`, 1.2 s). Nothing more is needed from you for it.')
    expect(checkPassed({ name: 'Lint', run: 'npm run lint', ms: 23 })).toBe('The person approved the commands and the check "Lint" passed (`npm run lint`, 23 ms). Nothing more is needed from you for it.')
  })
})

describe('the checks that need the person', () => {
  const CHECKED: RunWorkflow = { id: 'c', name: 'C', steps: [{ id: 'build', kind: 'work', name: 'Build' }, { id: 'tests', kind: 'check', name: 'Tests pass', run: 'npm test', retries: 1 }] }
  const ran = (attempt: number, ok: boolean, tail = 'FAIL'): RunEvent => ({ k: 'check', t: 400 + attempt, run: 'r1', round: 1, step: 'tests', head: 'h' + attempt, attempt, ok, exit: ok ? 0 : 1, timedOut: false, ms: 900, tail })
  const base: RunEvent[] = [begin(CHECKED), step('build', 'done', 300)]
  const panels = (events: RunEvent[], approved = true) => checkPanels(reduceRuns(events), () => ({ auditOn: false, approved })).map((p) => `${p.kind}:${p.step.id}${p.tail ? ` (${p.tail})` : ''}`)

  it('are the commands that wait for approval, the commands that were declined, and a check that failed every try with what it printed last', () => {
    expect(panels(base, false)).toEqual(['approval:tests'])
    expect(panels([...base, step('tests', 'declined', 350)], false)).toEqual(['declined:tests'])
    expect(panels([...base, ran(1, false, 'FAIL one'), ran(2, false, 'FAIL two')])).toEqual(['failed:tests (FAIL two)'])
  })

  it('are none while a check is running, still has tries, passed, was skipped, or the run was stopped', () => {
    expect(panels(base)).toEqual([])
    expect(panels([...base, ran(1, false)])).toEqual([])
    expect(panels([...base, ran(1, true)])).toEqual([])
    expect(panels([...base, ran(1, false), ran(2, false), step('tests', 'skipped', 500)])).toEqual([])
    expect(panels([...base, ran(1, false), ran(2, false), { k: 'stop', t: 900, run: 'r1' }])).toEqual([])
  })
})

describe('when the app starts the audit by itself', () => {
  const ready = (events: RunEvent[], ctx = { auditOn: true }) => readyForAudit(reduceRuns(events)[0]!, ctx)
  it('once every step before the audit is passed or skipped, and not while the plan or the build is still open', () => {
    expect(ready([begin(STANDARD)])).toBe(false)
    expect(ready([begin(STANDARD), submitted()])).toBe(false)
    expect(ready([begin(STANDARD), decided('released')])).toBe(false)
    expect(ready([begin(STANDARD), decided('released'), step('build', 'done')])).toBe(true)
    // A plan nobody needed is skipped.
    expect(ready([begin(STANDARD), step('build', 'done')])).toBe(true)
  })
  it('not when the audit is off, the run has no audit step, or a check before it has not passed', () => {
    const done = [begin(STANDARD), decided('released'), step('build', 'done')]
    expect(ready(done, { auditOn: false })).toBe(false)
    expect(ready([begin(REVIEWED), decided('released'), step('fix', 'done')])).toBe(false)
    const CHECKED: RunWorkflow = { id: 'c', name: 'C', steps: [{ id: 'build', kind: 'work', name: 'Build' }, { id: 'tests', kind: 'check', name: 'Tests', run: 'x' }, { id: 'review', kind: 'audit', name: 'Audit' }, { id: 'land', kind: 'merge', name: 'Land' }] }
    expect(ready([begin(CHECKED), step('build', 'done')])).toBe(false)
  })
})

describe('a step that needs the person\'s own approval: the audit, the pull request and the merge', () => {
  const audit = (t = 500): RunEvent => ({ k: 'audit', t, run: 'r1', head: 'h1', state: 'done', findings: [], files: 1, lines: 4, truncated: false })
  const commit = (t: number): RunEvent => ({ k: 'commit', t, run: 'r1', sha: `c${t}`, subject: 's' })
  const landed = (t = 900): RunEvent => ({ k: 'merge', t, run: 'r1', head: 'h1', how: 'checked', held: [] })
  const gated = (gate?: 'approve' | 'auto'): RunWorkflow => ({ ...PULL, steps: PULL.steps.map((s) => (s.kind === 'pr' ? { ...s, ...(gate && { gate }) } : s)) })
  const flow = (wf: RunWorkflow, extra: RunEvent[] = []) => [begin(wf), decided('released'), step('build', 'done'), audit(), ...extra]
  const last = (events: RunEvent[], ctx: Parameters<typeof stepStates>[1] = { auditOn: true }) => stepStates(reduceRuns(events)[0]!, ctx).at(-1)!

  it('a pull request with gate approve waits for the person once the audit is met, and does not wait with gate auto', () => {
    expect(last(flow(gated('approve')))).toMatchObject({ id: 'pr', state: 'waiting', awaiting: true })
    expect(last(flow(gated('auto')))).toMatchObject({ id: 'pr', state: 'waiting' })
    expect(last(flow(gated('auto'))).awaiting).toBeUndefined()
  })

  it('with no gate and no start on Run it asks for nothing: a pull request asks when its file says so', () => {
    expect(last(flow(gated())).awaiting).toBeUndefined()
    expect(last(flow(gated('approve'))).awaiting).toBe(true)
  })

  it('once approved it no longer waits, and says so; a commit made after the approval takes the approval away', () => {
    const ok = [commit(450), step('pr', 'approved', 700)]
    expect(last(flow(gated('approve'), ok))).toMatchObject({ state: 'waiting', approved: true })
    expect(last(flow(gated('approve'), ok)).awaiting).toBeUndefined()
    expect(last(flow(gated('approve'), [...ok, commit(800)]))).toMatchObject({ state: 'waiting', awaiting: true })
    expect(last(flow(gated('approve'), [...ok, commit(800)])).approved).toBeUndefined()
  })

  it('is gated before its turn too, so a push made while the build is still open is held', () => {
    const open = [begin(gated('approve')), decided('released')]
    expect(last(open)).toMatchObject({ id: 'pr', state: 'pending', gated: true })
    expect(last(open).awaiting).toBeUndefined()
    expect(last(flow(gated('approve'), [step('pr', 'approved', 700)])).gated).toBeUndefined()
    expect(last(flow(gated('auto'))).gated).toBeUndefined()
  })

  it('met when it landed; a merge never asks for a second approval, since the person\'s click on Land is the approval', () => {
    expect(last(flow(gated('approve'), [step('pr', 'approved', 700), landed()])).state).toBe('passed')
    const merge: RunWorkflow = { ...STANDARD, steps: STANDARD.steps.map((s) => (s.kind === 'merge' ? { ...s, gate: 'approve' as const } : s)) }
    expect(last(flow(merge), { auditOn: true })).toMatchObject({ id: 'land', state: 'waiting' })
    expect(last(flow(merge), { auditOn: true }).awaiting).toBeUndefined()
  })

  it('an audit with gate approve waits for approval after its findings are looked at, and is met after it; with gate auto it is met at once', () => {
    const wf = (gate?: 'approve' | 'auto'): RunWorkflow => ({ ...PULL, steps: PULL.steps.map((s) => (s.kind === 'audit' ? { ...s, ...(gate && { gate }) } : s)) })
    const at = (g: 'approve' | 'auto' | undefined, extra: RunEvent[] = []) => stepStates(reduceRuns(flow(wf(g), extra))[0]!, { auditOn: true }).find((s) => s.kind === 'audit')!
    expect(at('approve')).toMatchObject({ state: 'waiting', awaiting: true })
    expect(at('approve', [step('review', 'approved', 700)]).state).toBe('passed')
    expect(at('auto').state).toBe('passed')
    expect(at(undefined).state).toBe('passed')
  })

  it('every step that waits for the person by approval is listed with the steps waiting for the person', () => {
    const waiting = (events: RunEvent[], ctx = { auditOn: true }) => waitingSteps(reduceRuns(events), ctx).map((w) => w.step.id)
    expect(waiting(flow(gated('approve')))).toEqual(['pr'])
    expect(waiting(flow(gated('approve'), [step('pr', 'approved', 700)]))).toEqual([])
    expect(waiting(flow(gated('auto')))).toEqual([])
  })
})

describe('a step that starts when the person presses Run', () => {
  const RUNNING: RunWorkflow = {
    id: 'r',
    name: 'R',
    steps: [{ id: 'build', kind: 'work', name: 'Build' }, { id: 'tests', kind: 'check', name: 'Tests', run: 'npm test', start: 'run' }, { id: 'review', kind: 'audit', name: 'Audit', start: 'run' }, { id: 'pr', kind: 'pr', name: 'Pull request', start: 'run' }]
  }
  const built: RunEvent[] = [begin(RUNNING), step('build', 'done', 300)]
  const ran = (ok: boolean, t = 400): RunEvent => ({ k: 'check', t, run: 'r1', round: 1, step: 'tests', head: 'h1', attempt: 1, ok, exit: ok ? 0 : 1, timedOut: false, ms: 900, tail: '' })
  const audit: RunEvent = { k: 'audit', t: 500, run: 'r1', head: 'h1', state: 'done', findings: [], files: 1, lines: 4, truncated: false }
  const all = (events: RunEvent[], ctx: { auditOn: boolean; approved?: boolean; mergeGate?: boolean } = { auditOn: true }) => stepStates(reduceRuns(events)[0]!, ctx)
  const of = (events: RunEvent[], id: string, ctx?: { auditOn: boolean; approved?: boolean; mergeGate?: boolean }) => all(events, ctx).find((x) => x.id === id)!

  it('a check waits for Run once the work before it is done, and not before', () => {
    expect(of([begin(RUNNING)], 'tests')).toMatchObject({ state: 'pending' })
    expect(of([begin(RUNNING)], 'tests').toRun).toBeUndefined()
    expect(of(built, 'tests')).toMatchObject({ state: 'waiting', toRun: true })
  })

  it('a check that was run is not waiting for Run any more: its result decides', () => {
    expect(of([...built, ran(true)], 'tests')).toMatchObject({ state: 'passed' })
    expect(of([...built, ran(false)], 'tests').toRun).toBeUndefined()
    expect(of([...built, ran(false)], 'tests').state).toBe('running')
  })

  it('a check whose commands are not approved waits for that first, not for Run', () => {
    const s = of(built, 'tests', { auditOn: true, approved: false })
    expect(s.state).toBe('waiting')
    expect(s.toRun).toBeUndefined()
  })

  it('an audit waits for Run once the steps before it have passed, and holds the steps after it back', () => {
    const states = all([...built, ran(true)])
    expect(states.map((x) => `${x.id}:${x.state}${x.toRun ? '+run' : ''}`)).toEqual(['build:passed', 'tests:passed', 'review:waiting+run', 'pr:pending'])
    // Not before: a step ahead of it that is not passed holds it as pending, with no Run to press.
    expect(of(built, 'review')).toMatchObject({ state: 'pending' })
    expect(of(built, 'review').toRun).toBeUndefined()
  })

  it('an audit that has run is not waiting for Run: its findings decide', () => {
    expect(of([...built, ran(true), audit], 'review')).toMatchObject({ state: 'passed' })
    expect(of([...built, ran(true), audit], 'review').toRun).toBeUndefined()
  })

  it('an audit that starts by itself never waits for Run, and neither does one with the audit off', () => {
    const auto: RunWorkflow = { ...RUNNING, steps: RUNNING.steps.map((x) => (x.id === 'review' ? { ...x, start: 'auto' as const } : x)) }
    expect(of([begin(auto), step('build', 'done', 300), ran(true)], 'review').toRun).toBeUndefined()
    expect(of([...built, ran(true)], 'review', { auditOn: false }).state).toBe('skipped')
  })

  it('a pull request that starts on Run waits for the person like one with gate approve, whatever the Settings switch says', () => {
    expect(needsApproval({ kind: 'pr', start: 'run' }, { auditOn: true })).toBe(true)
    expect(needsApproval({ kind: 'pr', gate: 'auto', start: 'run' }, { auditOn: true })).toBe(true)
    expect(needsApproval({ kind: 'pr', start: 'auto' }, { auditOn: true })).toBe(false)
    expect(needsApproval({ kind: 'work', start: 'run' } as never, { auditOn: true })).toBe(false)
  })

  it('a check waiting for Run is not one of the checks that need the person\'s approval of commands', () => {
    expect(checkPanels(reduceRuns(built), () => ({ auditOn: true })).map((p) => p.kind)).toEqual([])
  })
})

describe('the steps waiting for the person to press Run, across runs', () => {
  const RUNS: RunWorkflow = { id: 'r', name: 'R', steps: [{ id: 'build', kind: 'work', name: 'Build' }, { id: 'tests', kind: 'check', name: 'Tests', run: 'npm test', start: 'run' }, { id: 'review', kind: 'audit', name: 'Audit', start: 'run' }] }
  const ran: RunEvent = { k: 'check', t: 450, run: 'r1', round: 1, step: 'tests', head: 'h1', attempt: 1, ok: true, exit: 0, timedOut: false, ms: 900, tail: '' }
  const list = (events: RunEvent[]) => toRunSteps(reduceRuns(events), () => ({ auditOn: true })).map((x) => `${x.run.id}:${x.step.id}`)
  it('lists the check that waits for Run, and then the audit once the check has passed', () => {
    expect(list([begin(RUNS), step('build', 'done', 300)])).toEqual(['r1:tests'])
    expect(list([begin(RUNS), step('build', 'done', 300), ran])).toEqual(['r1:review'])
  })
  it('lists nothing while the work before is not done, for a step that starts by itself, or for a stopped run', () => {
    expect(list([begin(RUNS)])).toEqual([])
    expect(list([begin(STANDARD), step('build', 'done', 300)])).toEqual([])
    expect(list([begin(RUNS), step('build', 'done', 300), { k: 'stop', t: 900, run: 'r1' }])).toEqual([])
  })
})


describe('the same settings on every kind of step', () => {
  const APPROVED_CHECK: RunWorkflow = { id: 'a', name: 'A', steps: [{ id: 'build', kind: 'work', name: 'Build' }, { id: 'tests', kind: 'check', name: 'Tests', run: 'npm test', gate: 'approve' }, { id: 'land', kind: 'merge', name: 'Land' }] }
  const built: RunEvent[] = [begin(APPROVED_CHECK), step('build', 'done', 300)]
  const ran = (ok: boolean, t = 400, head = 'h1'): RunEvent => ({ k: 'check', t, run: 'r1', round: 1, step: 'tests', head, attempt: 1, ok, exit: ok ? 0 : 1, timedOut: false, ms: 900, tail: '' })
  const of = (events: RunEvent[], id: string) => stepStates(reduceRuns(events)[0]!, { auditOn: false }).find((s) => s.id === id)!

  it('a check with gate approve waits for the person once it has passed, and passes when they approve', () => {
    expect(needsApproval({ kind: 'check', gate: 'approve' }, { auditOn: false })).toBe(true)
    expect(needsApproval({ kind: 'check', gate: 'pass' }, { auditOn: false })).toBe(false)
    expect(of(built, 'tests').state).toBe('running')
    expect(of([...built, ran(true)], 'tests')).toMatchObject({ state: 'waiting', awaiting: true })
    expect(of([...built, ran(true), step('tests', 'approved', 500)], 'tests').state).toBe('passed')
  })
  it('a check that failed is not asked about: it is the agent\'s to fix first', () => {
    expect(of([...built, ran(false)], 'tests')).toMatchObject({ state: 'running' })
    expect(of([...built, ran(false)], 'tests').awaiting).toBeUndefined()
  })
  it('a check sent back by the person runs again, with its tries given back', () => {
    const sent = [...built, ran(true), step('tests', 'changes', 500)]
    expect(of(sent, 'tests').state).toBe('running')
    expect(of([...sent, ran(true, 600, 'h2')], 'tests')).toMatchObject({ state: 'waiting', awaiting: true })
  })
  it('a check that waits for approval after passing is not one that needs its commands approved', () => {
    expect(checkPanels(reduceRuns([...built, ran(true)]), () => ({ auditOn: false })).map((p) => p.kind)).toEqual([])
    expect(waitingSteps(reduceRuns([...built, ran(true)]), { auditOn: false }).map((w) => w.step.id)).toEqual(['tests'])
  })

  const OPTIONAL: RunWorkflow = { id: 'o', name: 'O', steps: [{ id: 'build', kind: 'work', name: 'Build' }, { id: 'extra', kind: 'work', name: 'Extra', optional: true }, { id: 'ok', kind: 'approve', name: 'Your look', optional: true }, { id: 'land', kind: 'merge', name: 'Land' }] }
  const opt = (events: RunEvent[]) => stepStates(reduceRuns(events)[0]!, { auditOn: false }).map((s) => `${s.id}:${s.state}`)
  it('an optional step the person skipped is skipped, and the steps after it go on', () => {
    expect(opt([begin(OPTIONAL), step('build', 'done', 300)])).toEqual(['build:passed', 'extra:running', 'ok:pending', 'land:pending'])
    expect(opt([begin(OPTIONAL), step('build', 'done', 300), step('extra', 'skipped', 350)])).toEqual(['build:passed', 'extra:skipped', 'ok:waiting', 'land:pending'])
    expect(opt([begin(OPTIONAL), step('build', 'done', 300), step('extra', 'skipped', 350), step('ok', 'skipped', 360)])).toEqual(['build:passed', 'extra:skipped', 'ok:skipped', 'land:waiting'])
  })
  it('a step that is not optional is skipped when a skip was logged for it: only the person approving a question to skip writes one', () => {
    expect(opt([begin(OPTIONAL), step('build', 'skipped', 300)])[0]).toBe('build:skipped')
  })

  it('what a check sent back says to the agent, and what a skipped step says', () => {
    expect(stepReply('Tests', 'changes', 'cover the edge', 'check')).toContain('was sent back: cover the edge')
    expect(stepReply('Tests', 'changes', 'cover the edge', 'check')).toContain('the check runs again')
    expect(stepSkipped('Extra')).toBe('Your step "Extra" was skipped by the person. Go on with the next step.')
  })
})

describe('a plan or a build that starts when the person presses Run', () => {
  const GATED: RunWorkflow = { id: 'g', name: 'G', steps: [{ id: 'plan', kind: 'plan', name: 'Generate plan', start: 'run', gate: 'approve' }, { id: 'build', kind: 'work', name: 'Build', start: 'run' }, { id: 'tests', kind: 'check', name: 'Tests', run: 'npm test' }] }
  const start = (id: string, t = 150): RunEvent => ({ k: 'start', t, run: 'r1', round: 1, step: id })
  const of = (events: RunEvent[]) => stepStates(reduceRuns(events)[0]!, { auditOn: false }).map((s) => `${s.id}:${s.state}${s.toRun ? '+run' : ''}`)

  it('waits for Run before it begins, and the steps after it wait behind it', () => {
    expect(of([begin(GATED)])).toEqual(['plan:waiting+run', 'build:pending', 'tests:pending'])
  })
  it('begins once Run was pressed: the plan is the agent\'s to write, and waits for approval when handed in', () => {
    expect(of([begin(GATED), start('plan')])).toEqual(['plan:running', 'build:pending', 'tests:pending'])
    expect(of([begin(GATED), start('plan'), submitted(200)])).toEqual(['plan:waiting', 'build:pending', 'tests:pending'])
  })
  it('a build that starts on Run waits for it once the plan is approved, and runs after it', () => {
    const planned = [begin(GATED), start('plan'), submitted(200), decided('approved', 300)]
    expect(of(planned)).toEqual(['plan:passed', 'build:waiting+run', 'tests:pending'])
    expect(of([...planned, start('build', 350)])).toEqual(['plan:passed', 'build:running', 'tests:pending'])
  })
  it('is listed among the steps waiting for Run', () => {
    expect(toRunSteps(reduceRuns([begin(GATED)]), () => ({ auditOn: false })).map((x) => x.step.id)).toEqual(['plan'])
  })
  it('a step that starts by itself, or a plan nobody needs, never waits for Run', () => {
    const quiet: RunWorkflow = { ...GATED, steps: GATED.steps.map((s) => (s.id === 'plan' ? { ...s, gate: 'auto' as const, start: 'run' as const } : s)) }
    expect(of([begin(quiet), { k: 'plan', t: 160, run: 'r1', round: 1, state: 'released' }])[0]).toBe('plan:passed')
    expect(of([begin(STANDARD)])).toEqual(['plan:running', 'build:pending', 'review:skipped', 'land:pending'])
  })
  it('says what the agent is told when the person presses Run', () => {
    expect(stepStarted('Generate plan')).toBe('The person pressed Run: start your step "Generate plan" now. If nothing in it is for you to do (it is theirs, like trying the change), tell them in the chat, once, that they mark it done on their card; do not report it yourself.')
  })
})

describe('a step the person started with Run and the agent has left running', () => {
  const VERIFY: RunWorkflow = { id: 'v', name: 'V', steps: [{ id: 'plan', kind: 'plan', name: 'Plan', gate: 'auto' }, { id: 'build', kind: 'work', name: 'Build' }, { id: 'verify', kind: 'work', name: 'Verify', start: 'run' }, { id: 'commit', kind: 'work', name: 'Commit', start: 'run' }] }
  const press = (id: string, t = 450): RunEvent => ({ k: 'start', t, run: 'r1', round: 1, step: id })
  const base = [begin(VERIFY), decided('released'), step('build', 'done')]
  const ids = (events: RunEvent[]) => finishable(reduceRuns(events), () => ({ auditOn: true })).map((x) => x.step.id)

  it('is finishable by the person once Run was pressed, and not before, and not once done', () => {
    expect(ids(base)).toEqual([])
    expect(ids([...base, press('verify')])).toEqual(['verify'])
    expect(ids([...base, press('verify'), step('verify', 'done', 500)])).toEqual([])
  })
  it('is never a step the agent does in the ordinary way, a plan, or a stopped run\'s', () => {
    expect(ids([begin(VERIFY), decided('released')])).toEqual([])
    expect(ids([...base, press('verify'), { k: 'stop', t: 900, run: 'r1' }])).toEqual([])
  })
  it('tells the agent the step is reported done and what follows, with the person\'s words', () => {
    const next = { id: 'commit', name: 'Commit', optional: false, start: true }
    expect(stepFinished('Verify', next, 'looks good')).toBe('The person finished your step "Verify": it is reported done.' + ' Next step: "Commit"; it starts when the person presses Run, so change nothing until you are told. They said: looks good')
    expect(stepFinished('Verify', undefined)).toContain('That was the last step.')
  })
})
