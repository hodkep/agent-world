import { describe, expect, it } from 'vitest'
import { addStep, moveStep, moveStepTo, removeStep, setStep } from './stepEdit'
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
