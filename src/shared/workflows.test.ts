import { describe, expect, it } from 'vitest'
import { DIALS, NO_WORKFLOW, usesNoWorkflow, askModel, auditModel, pickAsker, defaultWorkflow, dialDoes, withDefault, dialSummary, switchWorkflows, windingDown, workflowCost, workflowsShown } from './workflows'

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
    const off = { enabled: false, dial: 'balanced' as const, since: 0, planGate: true, mergeGate: true, defaults: {} }
    const on = switchWorkflows(off, true, 5000)
    expect(on).toEqual({ enabled: true, dial: 'balanced', since: 5000, planGate: true, mergeGate: true, defaults: {} })
    expect(switchWorkflows(on, true, 9000)).toEqual(on)
    expect(switchWorkflows(on, false, 9000)).toEqual({ enabled: false, dial: 'balanced', since: 5000, planGate: true, mergeGate: true, defaults: {} })
  })
})

describe('which model the app asks for its own checks', () => {
  it('a small model at balanced, a stronger one at max, and none at economy where no check runs', () => {
    expect([auditModel('economy'), auditModel('balanced'), auditModel('max')]).toEqual([undefined, 'haiku', 'sonnet'])
  })
})

describe('which workflow a project uses by default', () => {
  const w = { enabled: true, dial: 'balanced' as const, since: 0, planGate: true, mergeGate: true, defaults: { '/p/shop': 'bug-fix' } }
  it('is the one chosen for that project, else Standard', () => {
    expect(defaultWorkflow(w, '/p/shop')).toBe('bug-fix')
    expect(defaultWorkflow(w, '/p/other')).toBe('standard')
    expect(defaultWorkflow(w, null)).toBe('standard')
  })
  it('choosing one sets it for that project only; choosing Standard clears the choice', () => {
    expect(withDefault(w, '/p/other', 'quick-change').defaults).toEqual({ '/p/shop': 'bug-fix', '/p/other': 'quick-change' })
    expect(withDefault(w, '/p/shop', 'standard').defaults).toEqual({})
    expect(w.defaults).toEqual({ '/p/shop': 'bug-fix' })
  })
})

describe('a project that uses no workflow', () => {
  const w = { enabled: true, dial: 'balanced' as const, since: 0, planGate: true, mergeGate: true, defaults: { '/p/shop': 'bug-fix' } }
  it('is a choice kept per project like any other default, and choosing Standard again brings it back', () => {
    const none = withDefault(w, '/p/shop', NO_WORKFLOW)
    expect(defaultWorkflow(none, '/p/shop')).toBe('none')
    expect([usesNoWorkflow(none, '/p/shop'), usesNoWorkflow(none, '/p/other'), usesNoWorkflow(none, null), usesNoWorkflow(w, '/p/shop')]).toEqual([true, false, false, false])
    expect(withDefault(none, '/p/shop', 'standard').defaults).toEqual({})
  })
})

describe('which model answers the app\'s own questions', () => {
  it('is claude\'s haiku at balanced and sonnet at max, and the step\'s own choice when it names one', () => {
    expect([askModel('claude', 'economy'), askModel('claude', 'balanced'), askModel('claude', 'max')]).toEqual([undefined, 'haiku', 'sonnet'])
    expect(askModel('claude', 'balanced', 'opus')).toBe('opus')
  })

  it('is a small Gemini at balanced and a large one at max for agy, and a step\'s choice only when it is a model agy has', () => {
    const has = ['gemini-3.8-flash-low', 'gemini-3.8-flash-high', 'gemini-3.1-pro-high']
    expect([askModel('agy', 'economy', undefined, has), askModel('agy', 'balanced', undefined, has), askModel('agy', 'max', undefined, has)]).toEqual([undefined, 'gemini-3.8-flash-low', 'gemini-3.8-flash-high'])
    expect(askModel('agy', 'balanced', 'gemini-3.1-pro-high', has)).toBe('gemini-3.1-pro-high')
    expect(askModel('agy', 'balanced', 'haiku', has)).toBe('gemini-3.8-flash-low')
  })

  it('asks no model at economy, whoever the program is, even when a step names one', () => {
    expect(askModel('agy', 'economy', 'gemini-3.1-pro-high', ['gemini-3.1-pro-high'])).toBeUndefined()
    expect(askModel('claude', 'economy', 'opus')).toBeUndefined()
  })
})

describe('which program asks', () => {
  it('is the agent\'s own when it can, else the first ready one in the order claude, agy, else none', () => {
    expect(pickAsker('agy', ['claude', 'agy'])).toBe('agy')
    expect(pickAsker('agy', ['claude'])).toBe('claude')
    expect(pickAsker('claude', ['agy'])).toBe('agy')
    expect(pickAsker('claude', [])).toBeUndefined()
  })
})
