import { describe, expect, it } from 'vitest'
import { addStep, duplicateStep, insertStepAt, kindFor, moveAfter, moveStep, moveStepTo, removeStep, roleOf, setStep, whoCan, whoOf, withBy, withRole, withWho } from './stepEdit'
import { STEPS_MAX, type Workflow } from './workflow'

const wf = (): Workflow => ({ version: 1, id: 'journey', name: 'Journey', steps: [{ id: 'plan', kind: 'plan', gate: 'approve' }, { id: 'build', kind: 'work', name: 'Build', skills: ['tdd'] }, { id: 'land', kind: 'merge' }] })

describe('editing the steps of a workflow draft', () => {
  it('moves a step up or down and leaves the end of the list where it is', () => {
    expect(moveStep(wf(), 1, -1).steps.map((s) => s.id)).toEqual(['build', 'plan', 'land'])
    expect(moveStep(wf(), 1, 1).steps.map((s) => s.id)).toEqual(['plan', 'land', 'build'])
    expect(moveStep(wf(), 0, -1).steps.map((s) => s.id)).toEqual(['plan', 'build', 'land'])
    expect(moveStep(wf(), 2, 1).steps.map((s) => s.id)).toEqual(['plan', 'build', 'land'])
  })

  it('moves a step to any place, as when it is dragged there', () => {
    expect(moveStepTo(wf(), 0, 2).steps.map((s) => s.id)).toEqual(['build', 'land', 'plan'])
    expect(moveStepTo(wf(), 2, 0).steps.map((s) => s.id)).toEqual(['land', 'plan', 'build'])
    expect(moveStepTo(wf(), 1, 1)).toEqual(wf())
    expect(moveStepTo(wf(), 1, 9).steps.map((s) => s.id)).toEqual(['plan', 'land', 'build'])
    expect(moveStepTo(wf(), 7, 0)).toEqual(wf())
  })

  it('puts a step right after another, as when an arrow is drawn from one to the other', () => {
    const w = { ...wf(), steps: [...wf().steps, { id: 'review', kind: 'audit' as const }] }
    expect(moveAfter(w, 'plan', 'land').steps.map((s) => s.id)).toEqual(['plan', 'land', 'build', 'review'])
    expect(moveAfter(w, 'land', 'plan').steps.map((s) => s.id)).toEqual(['build', 'land', 'plan', 'review'])
    expect(moveAfter(w, 'build', 'land').steps.map((s) => s.id)).toEqual(['plan', 'build', 'land', 'review'])
    // Already there, the same step, or one that is not in the workflow: nothing moves.
    expect(moveAfter(w, 'plan', 'build')).toBe(w)
    expect(moveAfter(w, 'plan', 'plan')).toBe(w)
    expect(moveAfter(w, 'plan', 'nope')).toBe(w)
  })

  it('adds a step at a chosen place, with an id nobody has used, and not past the limit', () => {
    const w = wf()
    expect(insertStepAt(w, 1, 'check').steps.map((s) => `${s.id}:${s.kind}`)).toEqual(['plan:plan', 'check:check', 'build:work', 'land:merge'])
    expect(insertStepAt(w, 1, 'check').steps[1]).toEqual({ id: 'check', kind: 'check', run: '' })
    expect(insertStepAt(w, 0, 'work').steps.map((s) => s.id)).toEqual(['work', 'plan', 'build', 'land'])
    expect(insertStepAt(w, 99, 'audit').steps.at(-1)!.id).toBe('audit')
    const full = { ...w, steps: Array.from({ length: STEPS_MAX }, (_, i) => ({ id: `s${i}`, kind: 'work' as const })) }
    expect(insertStepAt(full, 2, 'work')).toBe(full)
  })

  it('copies a step right after itself, with a name and an id of its own', () => {
    const w = wf()
    const copy = duplicateStep(w, 1)
    expect(copy.steps.map((s) => s.id)).toEqual(['plan', 'build', 'build-2', 'land'])
    expect(copy.steps[2]).toEqual({ id: 'build-2', kind: 'work', name: 'Build copy', skills: ['tdd'] })
    expect(duplicateStep(w, 9)).toBe(w)
  })

  it('removes a step, but not the last one', () => {
    expect(removeStep(wf(), 1).steps.map((s) => s.id)).toEqual(['plan', 'land'])
    const one: Workflow = { ...wf(), steps: [{ id: 'build', kind: 'work' }] }
    expect(removeStep(one, 0).steps).toHaveLength(1)
  })

  it('adds a step of a kind with an id nobody has used, before the landing step when there is one, and not past the limit', () => {
    const a = addStep(wf(), 'check')
    expect(a.steps.map((s) => s.id)).toEqual(['plan', 'build', 'check', 'land'])
    expect(a.steps[2]).toMatchObject({ kind: 'check', run: '' })
    expect(addStep(a, 'check').steps.map((s) => s.id)).toEqual(['plan', 'build', 'check', 'check-2', 'land'])
    expect(addStep({ ...wf(), steps: [{ id: 'build', kind: 'work' }] }, 'approve').steps.map((s) => s.id)).toEqual(['build', 'approve'])
    const full: Workflow = { ...wf(), steps: Array.from({ length: STEPS_MAX }, (_, i) => ({ id: `s${i}`, kind: 'work' as const })) }
    expect(addStep(full, 'work').steps).toHaveLength(STEPS_MAX)
  })

  it('sets a field of a step, and takes it away when it is emptied', () => {
    expect(setStep(wf(), 1, { name: 'Build, test first' }).steps[1]!.name).toBe('Build, test first')
    expect('name' in setStep(wf(), 1, { name: '' }).steps[1]!).toBe(false)
    expect('skills' in setStep(wf(), 1, { skills: [] }).steps[1]!).toBe(false)
    expect(setStep(wf(), 1, { skills: ['tdd', 'commit-style'] }).steps[1]!.skills).toEqual(['tdd', 'commit-style'])
    expect(setStep(wf(), 0, { gate: 'auto' }).steps[0]!.gate).toBe('auto')
  })

  it('sets when a step starts and which model a review uses, and takes them away when emptied', () => {
    const w = { ...wf(), steps: [...wf().steps, { id: 'review', kind: 'audit' as const }] }
    const set = setStep(w, 3, { start: 'run', model: 'sonnet' })
    expect(set.steps[3]).toEqual({ id: 'review', kind: 'audit', start: 'run', model: 'sonnet' })
    expect(setStep(set, 3, { start: undefined, model: '' }).steps[3]).toEqual({ id: 'review', kind: 'audit' })
  })

  it('does not change the workflow it was given', () => {
    const w = wf()
    setStep(w, 1, { name: 'x' })
    moveStep(w, 1, 1)
    removeStep(w, 0)
    addStep(w, 'work')
    expect(w).toEqual(wf())
  })
})

describe('a step is who does it, and what part of the run it plays', () => {
  it('maps each kind to who does it and its role, and back', () => {
    expect((['plan', 'work', 'check', 'audit', 'approve', 'pr', 'merge'] as const).map((k) => `${k}:${whoOf(k)}:${roleOf(k)}`)).toEqual(['plan:agent:plan', 'work:agent:none', 'check:command:none', 'audit:reviewer:none', 'approve:you:none', 'pr:agent:pr', 'merge:you:land'])
    expect(kindFor('agent', 'plan')).toBe('plan')
    expect(kindFor('agent', 'pr')).toBe('pr')
    expect(kindFor('agent', 'none')).toBe('work')
    expect(kindFor('you', 'land')).toBe('merge')
    expect(kindFor('you', 'none')).toBe('approve')
    expect(kindFor('command', 'none')).toBe('check')
    expect(kindFor('reviewer', 'none')).toBe('audit')
    // A role the one who does it cannot play is not a step.
    expect(kindFor('command', 'plan')).toBeUndefined()
    expect(kindFor('reviewer', 'land')).toBeUndefined()
    expect(kindFor('you', 'pr')).toBeUndefined()
  })

  const base = (): Workflow => ({ version: 1, id: 'w', name: 'W', steps: [{ id: 'build', kind: 'work', name: 'Build', brief: 'Do it.', skills: ['tdd'], gate: 'approve', optional: true }] })
  it('changing who does a step keeps what still fits and drops what does not', () => {
    const reviewer = withWho(base(), 0, 'reviewer').steps[0]!
    expect(reviewer).toEqual({ id: 'build', kind: 'audit', name: 'Build', brief: 'Do it.', gate: 'approve', optional: true })
    const command = withWho(base(), 0, 'command').steps[0]!
    // A command needs one, which the checker asks for; an approval gate stays, a command's own gate is the person's too.
    expect(command).toEqual({ id: 'build', kind: 'check', name: 'Build', brief: 'Do it.', run: '', gate: 'approve', optional: true })
    const you = withWho(base(), 0, 'you').steps[0]!
    expect(you).toEqual({ id: 'build', kind: 'approve', name: 'Build', brief: 'Do it.', gate: 'approve', optional: true })
  })
  it('keeps the same step when it is already done by that one', () => {
    const w = base()
    expect(withWho(w, 0, 'agent')).toBe(w)
  })
  it('gives a role to an agent step or to a step of yours, and takes it away again', () => {
    const plan = withRole(base(), 0, 'plan').steps[0]!
    expect(plan).toMatchObject({ kind: 'plan', skills: ['tdd'], brief: 'Do it.' })
    expect(plan.optional).toBeUndefined()
    const pr = withRole(base(), 0, 'pr').steps[0]!
    expect(pr).toMatchObject({ kind: 'pr', skills: ['tdd'], gate: 'approve' })
    expect(withRole(withRole(base(), 0, 'pr'), 0, 'none').steps[0]!.kind).toBe('work')
    // A step of a command cannot be the plan: nothing changes.
    const cmd = withWho(base(), 0, 'command')
    expect(withRole(cmd, 0, 'plan')).toBe(cmd)
  })
  it('a step that starts when you press Run keeps that for whoever can wait for it, and not for you', () => {
    const w: Workflow = { ...base(), steps: [{ id: 'r', kind: 'audit', start: 'run' }] }
    expect(withWho(w, 0, 'command').steps[0]).toMatchObject({ kind: 'check', start: 'run' })
    expect(withWho(w, 0, 'agent').steps[0]).toMatchObject({ kind: 'work', start: 'run' })
    expect(withWho(w, 0, 'you').steps[0]!.start).toBeUndefined()
  })
})

describe('who finishes a step: the agent, or the person', () => {
  const base = (): Workflow => ({ version: 1, id: 'w', name: 'W', steps: [{ id: 'build', kind: 'work' }, { id: 'verify', kind: 'work', name: 'Verify', start: 'run', skippable: true }] })
  it('makes it the person\'s: it is not asked before it starts, since their answer comes after', () => {
    const w = withBy(base(), 1, 'person')
    expect(w.steps[1]).toEqual({ id: 'verify', kind: 'work', name: 'Verify', skippable: true, by: 'person' })
  })
  it('gives the person\'s step words for its buttons, and takes them away with the person', () => {
    const w = setStep(withBy(base(), 1, 'person'), 1, { confirm: 'Tested, looks good', reject: 'Needs work' })
    expect(w.steps[1]).toMatchObject({ by: 'person', confirm: 'Tested, looks good', reject: 'Needs work' })
    expect(withBy(w, 1, 'agent').steps[1]).toEqual({ id: 'verify', kind: 'work', name: 'Verify', skippable: true })
  })
  it('keeps who finishes a step when it changes in the ways a work step can, and drops it when it is not a work step any more', () => {
    const w = setStep(withBy(base(), 1, 'person'), 1, { confirm: 'Yes' })
    expect(withWho(w, 1, 'agent').steps[1]).toMatchObject({ by: 'person', confirm: 'Yes' })
    expect('by' in withWho(w, 1, 'command').steps[1]!).toBe(false)
  })
  it('leaves a step that is not work alone', () => {
    const plan: Workflow = { version: 1, id: 'w', name: 'W', steps: [{ id: 'p', kind: 'plan' }] }
    expect(withBy(plan, 0, 'person')).toBe(plan)
  })
})

describe('who can do a step, as the app reads it', () => {
  it('only those whose kind stays what it is: a check, an audit and an approval are read as work, so choosing them would turn back at once', () => {
    expect(whoCan('agent', 'none')).toBe(true)
    expect(whoCan('agent', 'plan')).toBe(true)
    expect(whoCan('agent', 'pr')).toBe(true)
    expect(whoCan('you', 'land')).toBe(true)
    expect(whoCan('command', 'none')).toBe(false)
    expect(whoCan('reviewer', 'none')).toBe(false)
    expect(whoCan('you', 'none')).toBe(false)
    expect(whoCan('command', 'plan')).toBe(false)
  })
})
