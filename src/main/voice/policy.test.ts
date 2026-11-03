import { describe, expect, it } from 'vitest'
import { decide, type Alert } from './policy'

const alert = (kind: Alert['kind']): Alert => ({ kind, agent: 'ada', text: 'x' })
const quiet = { state: 'listening' as const, sinceTalkMs: 60_000, sinceSpokeMs: 600_000, muted: false }

describe('when the voice may speak up about an agent', () => {
  it('never in silent mode', () => {
    expect(decide({ alert: alert('failed'), mode: 'silent', ...quiet })).toBe('silent')
  })
  it('on milestones it speaks of a finish, a request for the person and a failure, and tells itself the rest silently', () => {
    for (const k of ['finished', 'needs-you', 'failed'] as const) expect(decide({ alert: alert(k), mode: 'milestones', ...quiet })).toBe('speak')
    expect(decide({ alert: alert('started'), mode: 'milestones', ...quiet })).toBe('silent')
  })
  it('chatty speaks of everything', () => {
    expect(decide({ alert: alert('started'), mode: 'chatty', ...quiet })).toBe('speak')
  })
  it('waits for a pause while it is talking, thinking or the person is mid-sentence', () => {
    expect(decide({ alert: alert('finished'), mode: 'milestones', ...quiet, state: 'speaking' })).toBe('later')
    expect(decide({ alert: alert('finished'), mode: 'milestones', ...quiet, state: 'thinking' })).toBe('later')
    expect(decide({ alert: alert('finished'), mode: 'milestones', ...quiet, sinceTalkMs: 1500 })).toBe('later')
  })
  it('keeps to a minute between spoken updates, but a request for the person gets through after twenty seconds', () => {
    expect(decide({ alert: alert('finished'), mode: 'milestones', ...quiet, sinceSpokeMs: 30_000 })).toBe('silent')
    expect(decide({ alert: alert('needs-you'), mode: 'milestones', ...quiet, sinceSpokeMs: 30_000 })).toBe('speak')
    expect(decide({ alert: alert('needs-you'), mode: 'milestones', ...quiet, sinceSpokeMs: 10_000 })).toBe('silent')
  })
  it('does not speak to someone who muted the microphone', () => {
    expect(decide({ alert: alert('finished'), mode: 'milestones', ...quiet, muted: true })).toBe('silent')
  })
})
