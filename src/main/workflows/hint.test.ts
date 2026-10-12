import { describe, expect, it } from 'vitest'
import { PLAN_INSTRUCTION, planInstruction } from './hint'

describe('what task_begin tells the agent about the plan, per dial', () => {
  it('balanced and max ask for the plan every time', () => {
    for (const d of ['balanced', 'max'] as const) {
      expect(planInstruction(d)).toBe(PLAN_INSTRUCTION)
      expect(planInstruction(d)).not.toContain('one sentence')
    }
  })

  it('economy lets the agent skip the plan when the whole change fits in one sentence, and says the edits are then not held', () => {
    const text = planInstruction('economy')
    expect(text).toContain('If the whole change can be said in one sentence, skip the plan and go ahead; nothing is held back.')
    expect(text).toContain('.agent-world/plan.md')
    expect(text).toContain('plan_submit')
  })
})
