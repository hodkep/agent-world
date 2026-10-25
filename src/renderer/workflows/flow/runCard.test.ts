import { describe, expect, it } from 'vitest'
import type { RunStep } from '../../../shared/runs'
import type { StepState } from '../../../shared/steps'
import { actionOf, skipOf, wordOf } from './runCard'

const step = (kind: RunStep['kind'], over: Partial<RunStep> = {}): RunStep => ({ id: kind, kind, name: kind, ...over })
const st = (kind: StepState['kind'], state: StepState['state'], over: Partial<StepState> = {}): StepState => ({ id: kind, kind, name: kind, state, ...over })

describe('what the person can press on a step of a run', () => {
  it('Run, for a check that starts that way, and Run audit for an audit', () => {
    expect(actionOf(st('check', 'waiting', { toRun: true }), step('check'))).toEqual({ kind: 'run', label: 'Run', call: 'check' })
    expect(actionOf(st('audit', 'waiting', { toRun: true }), step('audit'))).toEqual({ kind: 'run', label: 'Run audit', call: 'audit' })
  })
  it('Approve and Send back, for a plan, an approval step, a build or an audit, a pull request or a merge that asks', () => {
    expect(actionOf(st('plan', 'waiting'), step('plan'))).toEqual({ kind: 'approve', label: 'Approve plan', plan: true })
    expect(actionOf(st('approve', 'waiting'), step('approve'))).toEqual({ kind: 'approve', label: 'Approve' })
    expect(actionOf(st('work', 'waiting'), step('work', { gate: 'approve' }))).toEqual({ kind: 'approve', label: 'Approve' })
    expect(actionOf(st('audit', 'waiting', { awaiting: true }), step('audit', { gate: 'approve' }))).toEqual({ kind: 'approve', label: 'Approve' })
    expect(actionOf(st('pr', 'waiting', { awaiting: true }), step('pr', { gate: 'approve' }))).toEqual({ kind: 'approve', label: 'Approve' })
  })
  it('says Run, not Approve, on a pull request that starts when the person presses Run', () => {
    expect(actionOf(st('pr', 'waiting', { awaiting: true }), step('pr', { start: 'run' }))).toEqual({ kind: 'approve', label: 'Run' })
  })
  it('nothing, for a step that is working, done, later, failed, or waits on something that is not a press', () => {
    for (const state of ['running', 'passed', 'pending', 'skipped', 'failed'] as const) expect(actionOf(st('work', state), step('work'))).toBeNull()
    expect(actionOf(st('check', 'waiting'), step('check'))).toBeNull()
    expect(actionOf(st('merge', 'waiting'), step('merge'))).toBeNull()
    expect(actionOf(st('audit', 'waiting'), step('audit'))).toBeNull()
  })
})

describe('what a step of a run says it is doing', () => {
  it('in a word', () => {
    expect(wordOf(st('work', 'passed'))).toBe('done')
    expect(wordOf(st('work', 'running'))).toBe('working')
    expect(wordOf(st('work', 'pending'))).toBe('later')
    expect(wordOf(st('audit', 'skipped'))).toBe('not asked')
    expect(wordOf(st('check', 'failed'))).toBe('failed')
  })
  it('what a waiting step waits for', () => {
    expect(wordOf(st('check', 'waiting', { toRun: true }))).toBe('press Run')
    expect(wordOf(st('plan', 'waiting'))).toBe('needs you')
    expect(wordOf(st('pr', 'waiting', { awaiting: true }))).toBe('needs you')
    expect(wordOf(st('check', 'waiting'))).toBe('its commands need your approval')
    expect(wordOf(st('audit', 'waiting'))).toBe('findings to look at')
    expect(wordOf(st('merge', 'waiting'))).toBe('ready to land')
    expect(wordOf(st('pr', 'waiting'))).toBe('ready to push')
  })
  it('how often a check failed or a plan was sent back on the way', () => {
    expect(wordOf(st('check', 'passed', { tries: 2 }))).toBe('done after 2 failures')
    expect(wordOf(st('check', 'passed', { tries: 1 }))).toBe('done after 1 failure')
  })
})

describe('whether the person can skip a step of a run', () => {
  it('an optional step that is working or waiting can be skipped, the way its kind is skipped', () => {
    expect(skipOf(st('work', 'running'), step('work', { optional: true }))).toBe('step')
    expect(skipOf(st('approve', 'waiting'), step('approve', { optional: true }))).toBe('step')
    expect(skipOf(st('check', 'waiting', { toRun: true }), step('check', { optional: true }))).toBe('check')
    expect(skipOf(st('audit', 'waiting', { toRun: true }), step('audit', { optional: true }))).toBe('audit')
  })
  it('not a step that is required, done, later or already skipped', () => {
    expect(skipOf(st('work', 'running'), step('work'))).toBeUndefined()
    for (const state of ['passed', 'pending', 'skipped', 'failed'] as const) expect(skipOf(st('work', state), step('work', { optional: true }))).toBeUndefined()
  })
  it('a check that waits for its commands to be approved is not skipped this way', () => {
    expect(skipOf(st('check', 'waiting'), step('check', { optional: true }))).toBe('check')
  })
})

describe('an approval a check asks for after it passed', () => {
  it('is Approve, like any step that asks', () => {
    expect(actionOf(st('check', 'waiting', { awaiting: true }), step('check', { gate: 'approve' }))).toEqual({ kind: 'approve', label: 'Approve' })
    expect(wordOf(st('check', 'waiting', { awaiting: true }))).toBe('needs you')
  })
})

