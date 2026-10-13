import { describe, expect, it } from 'vitest'
import { type RunEvent, type RunWorkflow, reduceRuns } from './runs'
import { checkFailed, checkGaveUp, checkPanels, stepReply, stepStates, waitingSteps } from './steps'

const STANDARD: RunWorkflow = { id: 'standard', name: 'Standard', steps: [{ id: 'plan', kind: 'plan', name: 'Plan' }, { id: 'build', kind: 'work', name: 'Build' }, { id: 'review', kind: 'audit', name: 'Audit' }, { id: 'land', kind: 'merge', name: 'Land' }] }
const REVIEWED: RunWorkflow = { id: 'reviewed', name: 'Reviewed', steps: [{ id: 'plan', kind: 'plan', name: 'Plan' }, { id: 'fix', kind: 'work', name: 'Fix' }, { id: 'ok', kind: 'approve', name: 'Your review', gate: 'approve' }, { id: 'land', kind: 'merge', name: 'Land' }] }
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

describe('a plan the workflow does not ask for', () => {
  const flow = (gate?: 'auto' | 'approve'): RunWorkflow => ({ id: 'f', name: 'F', steps: [{ id: 'plan', kind: 'plan', name: 'Plan', ...(gate && { gate }) }, { id: 'build', kind: 'work', name: 'Build' }] })
  const first = (w: RunWorkflow, planGate: boolean) => stepStates(reduceRuns([begin(w)])[0]!, { auditOn: true, planGate }).map((s) => `${s.id}:${s.state}`)

  it('is not needed from the start when the step says auto, or says nothing and the Settings switch is off; one the step asks for is in progress whatever the switch says', () => {
    expect(first(flow('auto'), true)).toEqual(['plan:skipped', 'build:running'])
    expect(first(flow(), false)).toEqual(['plan:skipped', 'build:running'])
    expect(first(flow(), true)).toEqual(['plan:running', 'build:pending'])
    expect(first(flow('approve'), false)).toEqual(['plan:running', 'build:pending'])
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

  it('passed when the last run passed, however many tries it took', () => {
    expect(at([...built, ran(1, false), ran(2, true)])).toBe('passed')
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
