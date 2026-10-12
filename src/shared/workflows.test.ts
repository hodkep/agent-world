import { describe, expect, it } from 'vitest'
import { DIALS, auditModel, dialDoes, dialSummary, switchWorkflows, windingDown, workflowCost, workflowsShown } from './workflows'

describe('what workflows add to a task, per dial', () => {
  it('economy adds only the step briefs to the agent: five of 150 tokens, and makes no separate call', () => {
    const c = workflowCost('economy')
    expect({ context: c.context, calls: c.calls }).toEqual({ context: 750, calls: 0 })
    expect(c.parts).toEqual([{ label: 'Step briefs', detail: '5 steps of about 150 tokens', tokens: 750, where: 'agent' }])
  })
  it('balanced adds the plan read-back to the agent, and a merge audit that is a separate call of about 4,000 tokens', () => {
    const c = workflowCost('balanced')
    expect({ context: c.context, calls: c.calls }).toEqual({ context: 1000, calls: 4000 })
    expect(c.parts.map((p) => [p.label, p.where])).toEqual([['Step briefs', 'agent'], ['Plan read-back', 'agent'], ['Merge audit', 'separate']])
    expect(c.parts[2]).toMatchObject({ tokens: 4000, usd: 0.0004 })
  })
  it('max adds a separate intent check on haiku, measured like the audit, and gives no price for the audit since it moves to a larger model', () => {
    const c = workflowCost('max')
    expect({ context: c.context, calls: c.calls }).toEqual({ context: 1000, calls: 8000 })
    expect(c.parts.find((p) => p.label === 'Intent check')).toMatchObject({ tokens: 4000, usd: 0.0002, where: 'separate' })
    expect(c.parts.map((p) => p.label)).toEqual(['Step briefs', 'Plan read-back', 'Merge audit', 'Intent check'])
    expect(c.parts.find((p) => p.label === 'Merge audit')!.usd).toBeUndefined()
  })
  it('the parts add up to the two totals, and the dials are listed cheapest first', () => {
    for (const d of DIALS) {
      const c = workflowCost(d)
      expect(c.parts.filter((p) => p.where === 'agent').reduce((n, p) => n + p.tokens, 0)).toBe(c.context)
      expect(c.parts.filter((p) => p.where === 'separate').reduce((n, p) => n + p.tokens, 0)).toBe(c.calls)
    }
    expect(DIALS).toEqual(['economy', 'balanced', 'max'])
  })
})

describe('what each dial does, in a sentence', () => {
  it('says what the plan, the audit and the intent check do at each level', () => {
    expect(dialDoes('economy')).toBe('A plan only when the task is more than one sentence. No audit, no intent check.')
    expect(dialDoes('balanced')).toBe('A plan every time. A small model (haiku) audits the branch against it.')
    expect(dialDoes('max')).toBe('A plan every time, audited by a larger model (sonnet), and a second model checks the plan against your request.')
  })
})

describe('the one-line description of what a dial adds', () => {
  it('names only what is new at each level', () => {
    expect(dialSummary('economy')).toBe('step briefs only')
    expect(dialSummary('balanced')).toBe('+ plan read-back, merge audit')
    expect(dialSummary('max')).toBe('+ intent check')
  })
})

describe('when the Workflows button and window are shown', () => {
  it('on: always; off: only while runs are still open, and then they say so', () => {
    expect(workflowsShown(true, 0)).toBe(true)
    expect(workflowsShown(false, 0)).toBe(false)
    expect(workflowsShown(false, 2)).toBe(true)
    expect(windingDown(false, 2)).toBe(true)
    expect(windingDown(true, 2)).toBe(false)
    expect(windingDown(false, 0)).toBe(false)
  })
})

describe('switching workflows on or off', () => {
  it('records when it was switched on, and keeps that when only the dial changes or it goes off', () => {
    const off = { enabled: false, dial: 'balanced' as const, since: 0, planGate: true, mergeGate: true }
    const on = switchWorkflows(off, true, 5000)
    expect(on).toEqual({ enabled: true, dial: 'balanced', since: 5000, planGate: true, mergeGate: true })
    expect(switchWorkflows(on, true, 9000)).toEqual(on)
    expect(switchWorkflows(on, false, 9000)).toEqual({ enabled: false, dial: 'balanced', since: 5000, planGate: true, mergeGate: true })
  })
})

describe('which model the app asks for its own checks', () => {
  it('a small model at balanced, a stronger one at max, and none at economy where no check runs', () => {
    expect([auditModel('economy'), auditModel('balanced'), auditModel('max')]).toEqual([undefined, 'haiku', 'sonnet'])
  })
})
