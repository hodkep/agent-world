import { describe, expect, it } from 'vitest'
import type { WorkflowEntry } from './workflow'
import { STANDARD, checkCommands, commandDiff, isLanding, isSkippable, parseWorkflow, pickEntry, stepChips, toRunWorkflow } from './workflow'

const BUG_FIX = {
  version: 1,
  id: 'bug-fix',
  name: 'Bug fix',
  when: 'A defect with a known symptom.',
  steps: [
    { id: 'plan', kind: 'plan', gate: 'approve', brief: 'Name the symptom and the likely cause.' },
    { id: 'fix', kind: 'work', name: 'Fix, test first', skills: ['tdd'], brief: 'Write a failing test, then make it pass.' },
    { id: 'tests', kind: 'check', name: 'Tests pass', run: 'npm test', gate: 'pass', retries: 3 },
    { id: 'review', kind: 'audit' },
    { id: 'land', kind: 'merge', gate: 'approve' }
  ]
}

describe('reading a workflow file', () => {
  it('a valid file comes back as the app follows it: a check and an audit are agent steps, and only the plan keeps a gate', () => {
    expect(parseWorkflow(JSON.stringify(BUG_FIX))).toEqual({
      ok: true,
      workflow: {
        ...BUG_FIX,
        steps: [
          { id: 'plan', kind: 'plan', gate: 'approve', brief: 'Name the symptom and the likely cause.' },
          { id: 'fix', kind: 'work', name: 'Fix, test first', skills: ['tdd'], brief: 'Write a failing test, then make it pass.' },
          { id: 'tests', kind: 'work', name: 'Tests pass' },
          { id: 'review', kind: 'work' },
          { id: 'land', kind: 'merge' }
        ]
      }
    })
  })

  const problems = (o: unknown) => {
    const r = parseWorkflow(typeof o === 'string' ? o : JSON.stringify(o))
    return r.ok ? [] : r.problems
  }

  it('says when the text is not JSON, or not an object', () => {
    expect(problems('{ "id": ')[0]).toMatch(/^Not valid JSON/)
    expect(problems('[1, 2]')).toEqual(['The file must be one JSON object.'])
  })

  it('names every top-level problem at once: version, id, name, when, an unknown field and the steps list', () => {
    expect(problems({ version: 2, id: 'Bug Fix!', name: '', when: 7, extra: true, steps: 'none' })).toEqual([
      '"version" must be 1.',
      '"id" must be lowercase letters, digits and dashes (like "bug-fix"), up to 40 characters.',
      '"name" is required: a short title, up to 60 characters.',
      '"when" must be text of up to 300 characters.',
      'Unknown field "extra". Allowed: version, id, name, when, steps.',
      '"steps" must be a list of 1 to 12 steps.'
    ])
  })

  const withSteps = (steps: unknown[]) => problems({ ...BUG_FIX, steps })

  it('names each step problem with the step\'s place and id: not an object, a bad or repeated id, an unknown kind, an unknown field', () => {
    expect(withSteps(['plan', { id: 'Bad Id', kind: 'plan' }, { id: 'a', kind: 'dance' }, { id: 'a', kind: 'plan', colour: 'red' }])).toEqual([
      'Step 1 must be an object.',
      'Step 2: "id" must be lowercase letters, digits and dashes, up to 30 characters.',
      'Step 3 ("a"): "kind" must be one of plan, work, check, audit, approve, pr, merge.',
      'Step 4 ("a"): the id is already used by step 3.',
      'Step 4 ("a"): unknown field "colour". Allowed: id, kind, name, gate, brief, start, optional, skippable, skills, run, retries, model.'
    ])
  })

  it('holds each kind to its own fields: a gate must fit the kind, and a field a kind has no use for is refused', () => {
    expect(
      withSteps([
        { id: 'a', kind: 'check' },
        { id: 'b', kind: 'check', run: 'npm test', gate: 'nope', retries: 9 },
        { id: 'c', kind: 'work', gate: 'pass', run: 'ls', retries: 1, model: 'haiku' },
        { id: 'd', kind: 'approve', gate: 'auto', skills: ['tdd'] },
        { id: 'e', kind: 'merge', brief: 'Land it.', skills: ['tdd'], start: 'run' },
        { id: 'f', kind: 'audit', model: 'haiku', gate: 'approve' },
        { id: 'g', kind: 'work', name: '', skills: ['tdd', 7], brief: 'x'.repeat(601) }
      ])
    ).toEqual([
      'Step 2 ("b"): "gate" for a check step must be auto, pass or approve.',
      'Step 2 ("b"): "retries" must be a whole number from 0 to 5.',
      'Step 3 ("c"): "gate" for a work step must be auto or approve.',
      'Step 3 ("c"): "run" only belongs on a check step.',
      'Step 3 ("c"): "retries" only belongs on a check step.',
      'Step 3 ("c"): "model" only belongs on an audit step.',
      'Step 4 ("d"): "gate" for an approve step must be approve.',
      'Step 4 ("d"): "skills" only belongs on a plan, work or pr step.',
      'Step 5 ("e"): "start" only belongs on a plan, work, check, audit or pr step.',
      'Step 5 ("e"): "skills" only belongs on a plan, work or pr step.',
      'Step 7 ("g"): "name" must be text of up to 40 characters.',
      'Step 7 ("g"): "brief" must be text of up to 600 characters.',
      'Step 7 ("g"): "skills" must be a list of up to 8 names, each up to 60 characters.'
    ])
  })

  it('lets any step carry a brief, and a check, an audit or a pull request start when the person presses Run', () => {
    expect(
      withSteps([
        { id: 'a', kind: 'check', run: 'npm test', brief: 'Only the unit tests.', start: 'run' },
        { id: 'b', kind: 'audit', brief: 'Look hard at the billing code.', start: 'run' },
        { id: 'c', kind: 'pr', brief: 'Put the audit in the description.', start: 'auto' },
        { id: 'd', kind: 'merge', brief: 'Squash it.' }
      ])
    ).toEqual([])
  })
  it('gives every step the same settings where they make sense: skills on what the agent does, an approval after a check, optional on what can be skipped', () => {
    expect(
      withSteps([
        { id: 'a', kind: 'plan', skills: ['tdd'] },
        { id: 'b', kind: 'work', skills: ['tdd'], optional: true },
        { id: 'c', kind: 'check', run: 'npm test', gate: 'approve', optional: true },
        { id: 'd', kind: 'audit', gate: 'approve', optional: true },
        { id: 'e', kind: 'approve', optional: true },
        { id: 'f', kind: 'pr', skills: ['tdd'] }
      ])
    ).toEqual([])
  })
  it('a step is skippable when its workflow says so, and by default when it starts on Run; the plan and a merge never are', () => {
    expect(isSkippable({ kind: 'work', start: 'run' })).toBe(true)
    expect(isSkippable({ kind: 'work' })).toBe(false)
    expect(isSkippable({ kind: 'work', start: 'run', skippable: false })).toBe(false)
    expect(isSkippable({ kind: 'work', skippable: true })).toBe(true)
    expect(isSkippable({ kind: 'pr', start: 'run' })).toBe(true)
    expect(isSkippable({ kind: 'plan', skippable: true })).toBe(false)
    expect(isSkippable({ kind: 'merge', skippable: true })).toBe(false)
  })

  it('keeps skippable to the steps that can be skipped, and says it must be true or false', () => {
    expect(withSteps([{ id: 'a', kind: 'work', skippable: true }, { id: 'b', kind: 'pr', skippable: false }, { id: 'c', kind: 'plan', skippable: true }, { id: 'd', kind: 'merge', skippable: true }, { id: 'e', kind: 'work', skippable: 'yes' }])).toEqual([
      'Step 3 ("c"): "skippable" only belongs on a work, check, audit, approve or pr step.',
      'Step 4 ("d"): "skippable" only belongs on a work, check, audit, approve or pr step.',
      'Step 5 ("e"): "skippable" must be true or false.'
    ])
  })

  it('keeps optional to the steps that can be passed over, and says it must be true or false', () => {
    expect(withSteps([{ id: 'a', kind: 'merge', optional: true }, { id: 'b', kind: 'pr', optional: true }, { id: 'c', kind: 'plan', optional: true }, { id: 'd', kind: 'work', optional: 'yes' }])).toEqual([
      'Step 1 ("a"): "optional" only belongs on a work, check, audit or approve step.',
      'Step 2 ("b"): "optional" only belongs on a work, check, audit or approve step.',
      'Step 3 ("c"): "optional" only belongs on a work, check, audit or approve step.',
      'Step 4 ("d"): "optional" must be true or false.'
    ])
  })
  it('lets the agent\'s own steps, a plan or a build, wait for the person to press Run before they start', () => {
    expect(withSteps([{ id: 'plan', kind: 'plan', start: 'run' }, { id: 'build', kind: 'work', start: 'run' }])).toEqual([])
    expect(withSteps([{ id: 'ok', kind: 'approve', start: 'run' }])).toEqual(['Step 1 ("ok"): "start" only belongs on a plan, work, check, audit or pr step.'])
  })
  it('refuses a start that is not auto or run', () => {
    expect(withSteps([{ id: 'a', kind: 'audit', start: 'later' }])).toEqual(['Step 1 ("a"): "start" must be auto or run.'])
  })
})

describe('the built-in Standard workflow', () => {
  it('is itself a valid workflow, and is the pipeline of a pull request: plan, build, review, pull request', () => {
    expect(parseWorkflow(JSON.stringify(STANDARD))).toEqual({ ok: true, workflow: STANDARD })
    expect(STANDARD.id).toBe('standard')
    // An agent that reads "when" must not prefer it to a workflow the project made for its work.
    expect(STANDARD.when).toMatch(/fallback/i)
    expect(STANDARD.when).not.toMatch(/anything/i)
    expect(STANDARD.steps.map((s) => s.kind)).toEqual(['plan', 'work', 'work', 'pr'])
    expect(STANDARD.steps.at(-1)!.name).toBe('Pull request')
    expect(isLanding('pr')).toBe(true)
    expect(isLanding('merge')).toBe(true)
    expect(isLanding('audit')).toBe(false)
  })
})

describe('the chips a workflow is drawn with', () => {
  it('a step is called by its name, else by what its kind is called, and carries the colour of its kind', () => {
    expect(stepChips(parseOk(BUG_FIX))).toEqual([
      { id: 'plan', kind: 'plan', label: 'Plan', stops: true },
      { id: 'fix', kind: 'work', label: 'Fix, test first', stops: false },
      { id: 'tests', kind: 'work', label: 'Tests pass', stops: false },
      { id: 'review', kind: 'work', label: 'Build', stops: false },
      { id: 'land', kind: 'merge', label: 'Land', stops: true }
    ])
  })

  it('a plan asks unless it says auto, a merge is the person\'s own click, a step asks when it starts on Run, and a pull request that says nothing asks nothing', () => {
    const wf = parseOk({ ...BUG_FIX, steps: [{ id: 'plan', kind: 'plan' }, { id: 'land', kind: 'merge' }, { id: 'tests', kind: 'check', run: 'x', gate: 'pass' }, { id: 'ok', kind: 'approve' }, { id: 'rev', kind: 'audit', gate: 'approve' }, { id: 'pr', kind: 'pr' }] })
    expect(stepChips(wf).map((c) => c.stops)).toEqual([true, true, false, true, true, false])
    expect(stepChips(parseOk({ ...BUG_FIX, steps: [{ id: 'plan', kind: 'plan', gate: 'auto' }] })).map((c) => c.stops)).toEqual([false])
  })
})

function parseOk(o: unknown) {
  const r = parseWorkflow(JSON.stringify(o))
  if (!r.ok) throw new Error(r.problems.join('; '))
  return r.workflow
}

describe('the copy of a workflow a run keeps', () => {
  it('has every step with a name (the kind\'s when the file gives none), and what the agent was told, and the hash of the file', () => {
    const rw = toRunWorkflow(parseOk(BUG_FIX), 'abc123')
    expect(rw).toEqual({
      id: 'bug-fix',
      name: 'Bug fix',
      hash: 'abc123',
      steps: [
        { id: 'plan', kind: 'plan', name: 'Plan', gate: 'approve', brief: 'Name the symptom and the likely cause.' },
        { id: 'fix', kind: 'work', name: 'Fix, test first', skills: ['tdd'], brief: 'Write a failing test, then make it pass.' },
        { id: 'tests', kind: 'work', name: 'Tests pass' },
        { id: 'review', kind: 'work', name: 'Build' },
        { id: 'land', kind: 'merge', name: 'Land' }
      ]
    })
    expect(toRunWorkflow(STANDARD).hash).toBeUndefined()
  })
})

describe('the commands a workflow runs', () => {
  it('are none now: a check step is an agent step, and no command of a file is kept or run', () => {
    const rw = toRunWorkflow(parseOk({ ...BUG_FIX, steps: [{ id: 'a', kind: 'check', run: 'npm test' }, { id: 'b', kind: 'work' }, { id: 'c', kind: 'check', run: 'npm run lint' }, { id: 'd', kind: 'check', run: 'npm test' }] }), 'h', 'project')
    expect(checkCommands(rw)).toEqual([])
    expect(checkCommands(toRunWorkflow(STANDARD))).toEqual([])
  })

  it('a run\'s copy says which place the file came from, so commands from the repository can be told from the rest', () => {
    expect(toRunWorkflow(parseOk(BUG_FIX), 'abc', 'project').scope).toBe('project')
    expect(toRunWorkflow(STANDARD).scope).toBeUndefined()
  })

  it('compared with an older version: what is new, what is gone and what stayed, new ones first', () => {
    expect(commandDiff(['npm test', 'npm run lint'], ['npm test && ./up.sh', 'npm run lint'])).toEqual([
      { change: 'added', text: 'npm test && ./up.sh' },
      { change: 'removed', text: 'npm test' },
      { change: 'same', text: 'npm run lint' }
    ])
    expect(commandDiff([], ['make'])).toEqual([{ change: 'added', text: 'make' }])
  })
})

describe('which workflow a new task follows', () => {
  const entry = (id: string): WorkflowEntry => ({ id, scope: id === 'standard' ? 'built-in' : 'project', workflow: { version: 1, id, name: id, steps: [{ id: 'build', kind: 'work' }] } })
  const list = [entry('standard'), entry('bug-fix'), { id: 'broken', scope: 'project' as const, problems: ['x'] }]
  it('is the one asked for, else the project\'s default, else Standard; a file with problems is never picked', () => {
    expect(pickEntry(list, 'bug-fix', 'standard')?.id).toBe('bug-fix')
    expect(pickEntry(list, 'broken', 'standard')?.id).toBe('standard')
    expect(pickEntry(list, undefined, 'bug-fix')?.id).toBe('bug-fix')
    expect(pickEntry(list, 'nope', 'gone')?.id).toBe('standard')
  })
  it('is none when the project uses no workflow, unless the task asks for one that is there', () => {
    expect(pickEntry(list, undefined, 'none')).toBeUndefined()
    expect(pickEntry(list, 'nope', 'none')).toBeUndefined()
    expect(pickEntry(list, 'bug-fix', 'none')?.id).toBe('bug-fix')
  })
})

describe('a workflow file says what to do, and where the person is asked: nothing runs by itself and nothing asks twice', () => {
  const read = (steps: unknown[]) => {
    const r = parseWorkflow(JSON.stringify({ version: 1, id: 'x', name: 'X', steps }))
    if (!r.ok) throw new Error(r.problems.join('; '))
    return r.workflow.steps
  }

  it('a check or an audit step is an agent step now: the agent runs the tests and does the review itself, and no command or model is kept', () => {
    expect(read([{ id: 't', kind: 'check', name: 'Tests pass', run: 'pnpm test', gate: 'pass', retries: 2, brief: 'Run the tests.' }, { id: 'r', kind: 'audit', model: 'sonnet', brief: 'Review the branch.' }])).toEqual([
      { id: 't', kind: 'work', name: 'Tests pass', brief: 'Run the tests.' },
      { id: 'r', kind: 'work', brief: 'Review the branch.' }
    ])
  })

  it('a check needs no command any more', () => {
    expect(read([{ id: 't', kind: 'check' }])).toEqual([{ id: 't', kind: 'work' }])
  })

  it('asking the person is one thing: a step that gates on approval, or starts on Run, asks once, before it starts', () => {
    expect(read([{ id: 'a', kind: 'work', gate: 'approve' }, { id: 'gap', kind: 'work' }, { id: 'b', kind: 'pr', gate: 'approve' }, { id: 'c', kind: 'merge', gate: 'approve' }, { id: 'd', kind: 'work', start: 'run', gate: 'auto' }])).toEqual([
      { id: 'a', kind: 'work', start: 'run' },
      { id: 'gap', kind: 'work' },
      { id: 'b', kind: 'pr', start: 'run' },
      { id: 'c', kind: 'merge' },
      { id: 'd', kind: 'work', start: 'run' }
    ])
  })

  it('a step that never asks keeps no gate, and an approve step is a step that asks', () => {
    expect(read([{ id: 'a', kind: 'work', gate: 'auto' }, { id: 'ok', kind: 'approve', name: 'Your review', brief: 'Read it.' }])).toEqual([
      { id: 'a', kind: 'work' },
      { id: 'ok', kind: 'work', name: 'Your review', brief: 'Read it.', start: 'run' }
    ])
  })

  it('a plan keeps its gate: it is the one step the person answers after it is written', () => {
    expect(read([{ id: 'p', kind: 'plan', gate: 'approve' }, { id: 'q', kind: 'plan', gate: 'auto' }].slice(0, 1))).toEqual([{ id: 'p', kind: 'plan', gate: 'approve' }])
  })
})

describe('a Push step before a pull request step', () => {
  const read = (steps: unknown[]) => {
    const r = parseWorkflow(JSON.stringify({ version: 1, id: 'x', name: 'X', steps }))
    if (!r.ok) throw new Error(r.problems.join('; '))
    return r.workflow.steps
  }

  it('is the step that pushes, and asks: the pull request step after it is the agent opening the pull request, so each is asked once and the run does not end at the push', () => {
    expect(read([{ id: 'push', kind: 'work', name: 'Push', start: 'run', gate: 'approve' }, { id: 'pr', kind: 'pr', name: 'Pull request', start: 'run' }])).toEqual([
      { id: 'push', kind: 'pr', name: 'Push', start: 'run' },
      { id: 'pr', kind: 'work', name: 'Pull request', start: 'run' }
    ])
  })

  it('leaves a pull request step alone when no asking step of the agent comes right before it', () => {
    expect(read([{ id: 'build', kind: 'work' }, { id: 'pr', kind: 'pr', gate: 'approve' }])).toEqual([{ id: 'build', kind: 'work' }, { id: 'pr', kind: 'pr', start: 'run' }])
    expect(read([{ id: 'ask', kind: 'work', start: 'run' }, { id: 'x', kind: 'work' }, { id: 'pr', kind: 'pr' }])[2]).toMatchObject({ kind: 'pr' })
  })
})
