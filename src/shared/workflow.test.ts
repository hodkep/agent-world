import { describe, expect, it } from 'vitest'
import { STANDARD, parseWorkflow, stepChips } from './workflow'

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
  it('a valid file comes back as it was written', () => {
    expect(parseWorkflow(JSON.stringify(BUG_FIX))).toEqual({ ok: true, workflow: BUG_FIX })
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
      'Step 3 ("a"): "kind" must be one of plan, work, check, audit, approve, merge.',
      'Step 4 ("a"): the id is already used by step 3.',
      'Step 4 ("a"): unknown field "colour". Allowed: id, kind, name, gate, brief, skills, run, retries, model.'
    ])
  })

  it('holds each kind to its own fields: a check needs a command, a gate must fit the kind, and a field a kind has no use for is refused', () => {
    expect(
      withSteps([
        { id: 'a', kind: 'check' },
        { id: 'b', kind: 'check', run: 'npm test', gate: 'approve', retries: 9 },
        { id: 'c', kind: 'work', gate: 'pass', run: 'ls', retries: 1, model: 'haiku' },
        { id: 'd', kind: 'approve', gate: 'auto', skills: ['tdd'] },
        { id: 'e', kind: 'merge', brief: 'Land it.', skills: ['tdd'] },
        { id: 'f', kind: 'audit', model: 'haiku', gate: 'approve' },
        { id: 'g', kind: 'work', name: '', skills: ['tdd', 7], brief: 'x'.repeat(601) }
      ])
    ).toEqual([
      'Step 1 ("a"): a check step needs "run", the command to run.',
      'Step 2 ("b"): "gate" for a check step must be auto or pass.',
      'Step 2 ("b"): "retries" must be a whole number from 0 to 5.',
      'Step 3 ("c"): "gate" for a work step must be auto or approve.',
      'Step 3 ("c"): "run" only belongs on a check step.',
      'Step 3 ("c"): "retries" only belongs on a check step.',
      'Step 3 ("c"): "model" only belongs on an audit step.',
      'Step 4 ("d"): "gate" for an approve step must be approve.',
      'Step 4 ("d"): "skills" only belongs on a work step.',
      'Step 5 ("e"): "brief" does not belong on a merge step.',
      'Step 5 ("e"): "skills" only belongs on a work step.',
      'Step 7 ("g"): "name" must be text of up to 40 characters.',
      'Step 7 ("g"): "brief" must be text of up to 600 characters.',
      'Step 7 ("g"): "skills" must be a list of up to 8 names, each up to 60 characters.'
    ])
  })
})

describe('the built-in Standard workflow', () => {
  it('is itself a valid workflow, and is today\'s pipeline: plan, build, audit, land', () => {
    expect(parseWorkflow(JSON.stringify(STANDARD))).toEqual({ ok: true, workflow: STANDARD })
    expect(STANDARD.id).toBe('standard')
    expect(STANDARD.steps.map((s) => s.kind)).toEqual(['plan', 'work', 'audit', 'merge'])
  })
})

describe('the chips a workflow is drawn with', () => {
  it('a step is called by its name, else by what its kind is called, and carries the colour of its kind', () => {
    expect(stepChips(parseOk(BUG_FIX), { planGate: true, mergeGate: true })).toEqual([
      { id: 'plan', kind: 'plan', label: 'Plan', stops: true },
      { id: 'fix', kind: 'work', label: 'Fix, test first', stops: false },
      { id: 'tests', kind: 'check', label: 'Tests pass', stops: false },
      { id: 'review', kind: 'audit', label: 'Audit', stops: false },
      { id: 'land', kind: 'merge', label: 'Land', stops: true }
    ])
  })

  it('a step with no gate of its own follows the Settings switch for its kind, and one with a gate does not', () => {
    const wf = parseOk({ ...BUG_FIX, steps: [{ id: 'plan', kind: 'plan' }, { id: 'land', kind: 'merge' }, { id: 'tests', kind: 'check', run: 'x', gate: 'pass' }, { id: 'ok', kind: 'approve' }, { id: 'rev', kind: 'audit', gate: 'approve' }] })
    expect(stepChips(wf, { planGate: true, mergeGate: true }).map((c) => c.stops)).toEqual([true, true, false, true, true])
    expect(stepChips(wf, { planGate: false, mergeGate: false }).map((c) => c.stops)).toEqual([false, false, false, true, true])
    const set = parseOk({ ...BUG_FIX, steps: [{ id: 'plan', kind: 'plan', gate: 'approve' }, { id: 'land', kind: 'merge', gate: 'auto' }] })
    expect(stepChips(set, { planGate: false, mergeGate: true }).map((c) => c.stops)).toEqual([true, false])
  })
})

function parseOk(o: unknown) {
  const r = parseWorkflow(JSON.stringify(o))
  if (!r.ok) throw new Error(r.problems.join('; '))
  return r.workflow
}
