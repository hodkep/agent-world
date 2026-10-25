import { describe, expect, it } from 'vitest'
import type { Step } from '../../../shared/workflow'
import { ACTOR, PITCH, chipsOf, dropIndex, loopsOf, positionOf } from './stepFlow'

const step = (kind: Step['kind'], over: Partial<Step> = {}): Step => ({ id: kind, kind, ...over })

describe('who does a step', () => {
  it('is the agent, a command, a reviewer or the person, by its kind', () => {
    expect(ACTOR).toEqual({ plan: 'agent', work: 'agent', check: 'command', audit: 'reviewer', approve: 'you', pr: 'agent', merge: 'you' })
  })
})

describe('where the steps sit', () => {
  it('runs top to bottom, one pitch apart', () => {
    expect([0, 1, 4].map((i) => positionOf(i).y)).toEqual([0, PITCH, 4 * PITCH])
    expect(positionOf(3).x).toBe(0)
  })
  it('puts a step dropped at a height at the place nearest to it, never outside the list', () => {
    expect(dropIndex(0, 5)).toBe(0)
    expect(dropIndex(PITCH * 2.4, 5)).toBe(2)
    expect(dropIndex(PITCH * 2.6, 5)).toBe(3)
    expect(dropIndex(-500, 5)).toBe(0)
    expect(dropIndex(99999, 5)).toBe(4)
  })
})

describe('the loops drawn back up the flow', () => {
  const standard = [step('plan', { gate: 'approve' }), step('work'), step('check', { gate: 'pass' }), step('audit', { gate: 'approve' }), step('pr')]
  it('send the work back from a step the person approves, and from a check that must pass, to the work before it', () => {
    expect(loopsOf(standard)).toEqual([
      { from: 2, to: 1, kind: 'retry' },
      { from: 3, to: 1, kind: 'back' }
    ])
  })
  it('go to the nearest work step before, not one after', () => {
    const steps = [step('work', { id: 'a' }), step('audit', { gate: 'approve' }), step('work', { id: 'b' }), step('pr', { gate: 'approve' })]
    expect(loopsOf(steps)).toEqual([
      { from: 1, to: 0, kind: 'back' },
      { from: 3, to: 2, kind: 'back' }
    ])
  })
  it('are not drawn when there is no work step to go back to, or the step stops for nobody', () => {
    expect(loopsOf([step('plan', { gate: 'approve' })])).toEqual([])
    expect(loopsOf([step('work'), step('audit'), step('check')])).toEqual([])
  })
})

describe('the chips on a step', () => {
  const words = (s: Step) => chipsOf(s).map((c) => c.text)
  it('say who has to act: approving, confirming, passing', () => {
    expect(words(step('plan', { gate: 'approve' }))).toEqual(['you approve'])
    expect(words(step('check', { run: 'npm test', gate: 'pass' }))).toEqual(['must pass', '2 retries'])
    expect(words(step('pr', { gate: 'approve' }))).toEqual(['you confirm'])
  })
  it('say nothing for a step that just goes on', () => {
    expect(words(step('work'))).toEqual([])
    expect(words(step('audit'))).toEqual([])
  })
  it('use the Settings switches, when they are known, for a plan or a landing step that names no gate', () => {
    const on = { planGate: true, mergeGate: true }
    const off = { planGate: false, mergeGate: false }
    expect(chipsOf(step('plan'), {}, on).map((c) => c.text)).toEqual(['you approve'])
    expect(chipsOf(step('plan'), {}, off).map((c) => c.text)).toEqual([])
    expect(chipsOf(step('plan', { gate: 'auto' }), {}, on).map((c) => c.text)).toEqual([])
    expect(chipsOf(step('pr'), {}, on).map((c) => c.text)).toEqual(['you confirm'])
    expect(chipsOf(step('merge'), {}, off).map((c) => c.text)).toEqual([])
    expect(chipsOf(step('pr', { gate: 'auto' }), {}, on).map((c) => c.text)).toEqual([])
  })
  it('say a landing step with no gate of its own follows the Settings switch', () => {
    expect(words(step('pr'))).toEqual(['follows the switch'])
    expect(words(step('merge'))).toEqual(['follows the switch'])
  })
  it('flag a skill that is not simply ready, so the card shows it before the step is opened', () => {
    const chips = chipsOf(step('work', { skills: ['tdd', 'review', 'old'] }), { tdd: 'ready', review: 'granted', old: 'gone' })
    expect(chips.map((c) => c.skill)).toEqual([undefined, 'granted', 'gone'])
  })
  it('say a check, an audit or a pull request starts when the person presses Run', () => {
    expect(words(step('audit', { start: 'run' }))).toEqual(['starts when you press Run'])
    expect(words(step('check', { run: 'x', gate: 'pass', start: 'run' }))).toEqual(['must pass', '2 retries', 'starts when you press Run'])
    expect(words(step('pr', { start: 'run' }))).toEqual(['follows the switch', 'starts when you press Run'])
    expect(chipsOf(step('audit', { start: 'run' }))[0]!.tone).toBe('run')
    expect(words(step('audit', { start: 'auto' }))).toEqual([])
  })
  it('say a check you approve must pass first, and that a step can be skipped', () => {
    expect(words(step('check', { run: 'x', gate: 'approve' }))).toEqual(['you approve', 'must pass', '2 retries'])
    expect(words(step('work', { optional: true }))).toEqual(['optional'])
    expect(words(step('approve', { optional: true }))).toEqual(['you approve', 'optional'])
    expect(chipsOf(step('work', { optional: true }))[0]!.tone).toBe('plain')
  })
  it('name the skills of a plan, a work or a pull request step, and how often a failed check is sent back', () => {
    expect(words(step('plan', { gate: 'approve', skills: ['tdd'] }))).toEqual(['you approve', 'skill: tdd'])
    expect(words(step('pr', { gate: 'auto', skills: ['tdd'] }))).toEqual(['skill: tdd'])
  })
  it('name the skills of a work step and how often a failed check is sent back', () => {
    expect(words(step('work', { skills: ['tdd', 'ponytail'] }))).toEqual(['skill: tdd', 'skill: ponytail'])
    expect(words(step('check', { run: 'x', retries: 4 }))).toEqual(['4 retries'])
    expect(words(step('check', { run: 'x', retries: 1 }))).toEqual(['1 retry'])
  })
})
