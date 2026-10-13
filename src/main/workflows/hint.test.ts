import { describe, expect, it } from 'vitest'
import type { RunWorkflow } from '../../shared/runs'
import { PLAN_INSTRUCTION, WORKFLOW_TOOLS, planInstruction, workflowBrief, workflowList } from './hint'

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

const BUG_FIX: RunWorkflow = {
  id: 'bug-fix',
  name: 'Bug fix',
  steps: [
    { id: 'plan', kind: 'plan', name: 'Plan', gate: 'approve', brief: 'Name the symptom and the likely cause.' },
    { id: 'fix', kind: 'work', name: 'Fix, test first', skills: ['tdd'], brief: 'Write a failing test, then make it pass.' },
    { id: 'tests', kind: 'check', name: 'Tests pass', run: 'npm test', gate: 'pass' },
    { id: 'ok', kind: 'approve', name: 'Your review', brief: 'Look at the diff.' },
    { id: 'review', kind: 'audit', name: 'Audit' },
    { id: 'land', kind: 'merge', name: 'Land' }
  ]
}

describe('what task_begin tells the agent about its workflow', () => {
  it('names the workflow, lists the steps the agent does or waits on with their briefs, and says how to report them', () => {
    expect(workflowBrief(BUG_FIX, { planFirst: true })).toBe(
      'Workflow: Bug fix. Its steps, in order:\n' +
        '- plan "Plan": the person approves your plan before you edit. Name the symptom and the likely cause.\n' +
        '- fix "Fix, test first" (skill: tdd): Write a failing test, then make it pass.\n' +
        '- ok "Your review": the person approves this before it can land. Look at the diff.\n' +
        'Report each step you do with step_done and its id, for example step_done("fix"); with no id it reports the next one. The app audits the branch and the person lands it.'
    )
  })

  it('says when the workflow the agent asked for does not exist and the default was used, and leaves out a brief the file did not give', () => {
    const bare: RunWorkflow = { id: 'standard', name: 'Standard', steps: [{ id: 'plan', kind: 'plan', name: 'Plan' }, { id: 'build', kind: 'work', name: 'Build' }] }
    const text = workflowBrief(bare, { fellBackFrom: 'nope' })
    expect(text.split('\n')[0]).toBe('Workflow: Standard (there is no workflow "nope", so the project\'s default was used). Its steps, in order:')
    expect(text).toContain('- build "Build":')
    expect(text).not.toContain('Build": ')
  })
})

describe('the plan line of the brief', () => {
  it('is left out when no plan is asked for, so an agent is not told to wait for an approval that never comes', () => {
    const text = workflowBrief(BUG_FIX)
    expect(text).not.toContain('plan "Plan"')
    expect(text).not.toContain('approves your plan')
    expect(text).toContain('- fix "Fix, test first"')
  })
})

describe('the workflows the opening text offers', () => {
  const e = (id: string, when?: string) => ({ id, scope: 'project' as const, workflow: { version: 1 as const, id, name: id === 'standard' ? 'Standard' : id === 'bug-fix' ? 'Bug fix' : id, ...(when && { when }), steps: [{ id: 'b', kind: 'work' as const }] } })
  it('lists at most five as "id: when", leaving out the default and a file that has problems, and nothing when there is no choice', () => {
    const list = [e('standard', 'Anything'), e('bug-fix', 'A defect.'), e('quick', 'Typos.'), e('sec', 'Auth.'), e('a', 'A.'), e('b', 'B.'), e('c', 'C.'), { id: 'broken', scope: 'project' as const, problems: ['x'] }]
    expect(workflowList(list, 'standard')).toBe('This project has workflows. Standard is the default; pass one of these to task_begin as "workflow" if it fits better:\n- bug-fix: A defect.\n- quick: Typos.\n- sec: Auth.\n- a: A.\n- b: B.')
    expect(workflowList([e('standard', 'Anything')], 'standard')).toBe('')
    expect(workflowList([e('standard'), e('bug-fix')], 'bug-fix')).toBe('This project has workflows. Bug fix is the default; pass one of these to task_begin as "workflow" if it fits better:\n- standard')
  })
})

describe('the tools an agent may use without being asked each time', () => {
  it('are the office\'s four workflow tools, so reporting a step never stops to ask the person for permission', () => {
    expect(WORKFLOW_TOOLS).toEqual(['mcp__agent-world__task_begin', 'mcp__agent-world__task_done', 'mcp__agent-world__plan_submit', 'mcp__agent-world__step_done'])
  })
})
