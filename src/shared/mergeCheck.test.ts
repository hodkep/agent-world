import { describe, expect, it } from 'vitest'
import { type AuditState, auditSettled } from './mergeCheck'

describe('when the agent can be told to push', () => {
  const done: AuditState = { state: 'done', t: 1, findings: [], files: 1, lines: 1, truncated: false }

  it('after an audit that answered, or when the workflow has no audit step at all: the person\'s yes is then all there is to wait for', () => {
    expect(auditSettled(done)).toBe(true)
    expect(auditSettled({ state: 'off', reason: 'workflow' })).toBe(true)
  })

  it('not while an audit is running, failed or never ran, and not when it is off for another reason', () => {
    expect(auditSettled({ state: 'running', since: 1 })).toBe(false)
    expect(auditSettled({ state: 'not-run' })).toBe(false)
    expect(auditSettled({ state: 'failed', reason: 'x' })).toBe(false)
    expect(auditSettled({ state: 'off', reason: 'economy' })).toBe(false)
  })
})
