import { describe, expect, it } from 'vitest'
import { DIALS, dialSummary, windingDown, workflowCost, workflowsShown } from './workflows'

describe('what workflows add to a task, per dial', () => {
  it('economy adds only the step briefs: five of 150 tokens', () => {
    const c = workflowCost('economy')
    expect(c.perTask).toBe(750)
    expect(c.parts).toEqual([{ label: 'Step briefs', detail: '5 steps of about 150 tokens', tokens: 750 }])
  })
  it('balanced adds the plan read-back and the merge audit', () => {
    const c = workflowCost('balanced')
    expect(c.perTask).toBe(4000)
    expect(c.parts.map((p) => p.label)).toEqual(['Step briefs', 'Plan read-back', 'Merge audit'])
  })
  it('max adds a separate intent check on top', () => {
    const c = workflowCost('max')
    expect(c.perTask).toBe(6000)
    expect(c.parts.map((p) => p.label)).toEqual(['Step briefs', 'Plan read-back', 'Merge audit', 'Intent check'])
  })
  it('the parts always add up to the total, and the dials are listed cheapest first', () => {
    for (const d of DIALS) {
      const c = workflowCost(d)
      expect(c.parts.reduce((n, p) => n + p.tokens, 0)).toBe(c.perTask)
    }
    expect(DIALS).toEqual(['economy', 'balanced', 'max'])
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
