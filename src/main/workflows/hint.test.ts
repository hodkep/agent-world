import { describe, expect, it } from 'vitest'
import type { RunWorkflow } from '../../shared/runs'
import { PLAN_INSTRUCTION, PR_GO, WORKFLOW_HINT, WORKFLOW_REMINDER, WORKFLOW_TOOLS, planInstruction, workflowBrief, workflowList, workflowRemind } from './hint'

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
        'Work and commit only on your own branch in this worktree: a commit on any other branch here is refused, and the app audits your branch, not another.\n' +
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

describe('the skills of a step in the brief', () => {
  const flow: RunWorkflow = { id: 'skilled', name: 'Skilled', steps: [{ id: 'fix', kind: 'work', name: 'Fix', skills: ['tdd', 'review', 'deploy-notes'] }, { id: 'tidy', kind: 'work', name: 'Tidy', skills: ['deploy-notes'] }, { id: 'plain', kind: 'work', name: 'Plain' }] }

  it('tells the agent to read a skill that exists with library_get and to skip one that is not in the library', () => {
    const text = workflowBrief(flow, { skills: { tdd: 'ready', review: 'granted', 'deploy-notes': 'gone' } })
    expect(text).toContain('- fix "Fix" (read with library_get: tdd, review; there is no skill deploy-notes in the library, so skip it):')
    expect(text).toContain('- tidy "Tidy" (there is no skill deploy-notes in the library, so skip it):')
    expect(text).toContain('- plain "Plain":')
  })

  it('names the skills as before when the app has not looked them up', () => {
    expect(workflowBrief(flow)).toContain('- fix "Fix" (skill: tdd, review, deploy-notes):')
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
  it('says a description covers the task only when it covers all of it, and that the default is for doubt, so copy changes are not read to cover new code', () => {
    const text = workflowList([e('standard', 'Anything'), e('quick-change', 'Typos, wording and copy changes with no logic change.')], 'standard')
    expect(text).toContain("use it unless another one's description covers the whole task")
    expect(text).toContain('does not stretch to other work (copy changes do not cover new code or new tests)')
    expect(text).toContain('when in doubt, use Standard')
  })

  it('lists at most five as "id: when", leaving out the default and a file that has problems, and nothing when there is no choice', () => {
    const list = [e('standard', 'Anything'), e('bug-fix', 'A defect.'), e('quick', 'Typos.'), e('sec', 'Auth.'), e('a', 'A.'), e('b', 'B.'), e('c', 'C.'), { id: 'broken', scope: 'project' as const, problems: ['x'] }]
    expect(workflowList(list, 'standard')).toBe('This project has workflows. Standard is the default: use it unless another one\'s description covers the whole task, and then pass its id to task_begin as "workflow". A description says what a workflow is for and does not stretch to other work (copy changes do not cover new code or new tests); when in doubt, use Standard:\n- bug-fix: A defect.\n- quick: Typos.\n- sec: Auth.\n- a: A.\n- b: B.')
    expect(workflowList([e('standard', 'Anything')], 'standard')).toBe('')
    expect(workflowList([e('standard'), e('bug-fix')], 'bug-fix')).toBe('This project has workflows. Bug fix is the default: use it unless another one\'s description covers the whole task, and then pass its id to task_begin as "workflow". A description says what a workflow is for and does not stretch to other work (copy changes do not cover new code or new tests); when in doubt, use Bug fix:\n- standard')
  })
})

describe('the tools an agent may use without being asked each time', () => {
  it('are the office\'s four workflow tools, so reporting a step never stops to ask the person for permission', () => {
    expect(WORKFLOW_TOOLS).toEqual(['mcp__agent-world__task_begin', 'mcp__agent-world__task_done', 'mcp__agent-world__plan_submit', 'mcp__agent-world__step_done'])
  })
})

describe('the reminder to announce a task, said at the start of a turn', () => {
  const ask = { enabled: true, subagent: false, builder: false, open: false }
  it('is said while workflows are on and the agent has no task open', () => {
    expect(workflowRemind(ask)).toBe(WORKFLOW_REMINDER)
  })
  it('is not said with workflows off, to the builder or a subagent, or while a task is open', () => {
    expect(workflowRemind({ ...ask, enabled: false })).toBe('')
    expect(workflowRemind({ ...ask, builder: true })).toBe('')
    expect(workflowRemind({ ...ask, subagent: true })).toBe('')
    expect(workflowRemind({ ...ask, open: true })).toBe('')
  })
})

describe('the rules for work that ends in a pull request, in what the agent is told', () => {
  const PR: RunWorkflow = { id: 'standard', name: 'Standard', steps: [{ id: 'build', kind: 'work', name: 'Build' }, { id: 'review', kind: 'audit', name: 'Audit' }, { id: 'pr', kind: 'pr', name: 'Pull request' }] }
  it('says to work on its own branch, that commits elsewhere are refused, and that no push or pull request comes before the audit has passed and the app says so', () => {
    const brief = workflowBrief(PR)
    expect(brief).toContain('Work and commit only on your own branch')
    expect(brief).toContain('refused')
    expect(brief).toContain('Do not push or open a pull request until the app tells you the audit passed')
    expect(brief).toContain('head is exactly that audited commit')
  })
  it('says the first two for a workflow that lands by merge, and nothing of either for one with no landing step', () => {
    expect(workflowBrief(BUG_FIX)).toContain('Work and commit only on your own branch')
    expect(workflowBrief(BUG_FIX)).not.toContain('pull request')
    expect(workflowBrief({ id: 'q', name: 'Q', steps: [{ id: 'w', kind: 'work', name: 'W' }] })).not.toContain('own branch')
  })
  it('has a line in the opening text too, and the message the app sends once the audit has passed names the branch and the commit', () => {
    expect(WORKFLOW_HINT).toContain('own branch')
    expect(PR_GO('aw/ada', 'abcdef1234567890')).toContain('git push origin aw/ada:<name>')
    expect(PR_GO('aw/ada', 'abcdef1234567890')).toContain('abcdef1')
  })
})

describe('the brief of a pull request step', () => {
  const PULL: RunWorkflow = { id: 'p', name: 'P', steps: [{ id: 'build', kind: 'work', name: 'Build' }, { id: 'pr', kind: 'pr', name: 'Open the pull request', brief: 'Put the audit findings in the description.' }] }
  it('is told to the agent, as what to do when it opens the pull request', () => {
    expect(workflowBrief(PULL)).toContain('- pr "Open the pull request": when you open the pull request, Put the audit findings in the description.')
  })
  it('is not a line at all when the step has none', () => {
    const bare: RunWorkflow = { ...PULL, steps: [PULL.steps[0]!, { id: 'pr', kind: 'pr', name: 'Pull request' }] }
    expect(workflowBrief(bare)).not.toContain('- pr ')
  })
})


describe('the settings every kind of step can carry, as the agent is told them', () => {
  const FLOW: RunWorkflow = {
    id: 'f',
    name: 'F',
    steps: [
      { id: 'plan', kind: 'plan', name: 'Plan', skills: ['tdd'], brief: 'Say what you will touch.' },
      { id: 'build', kind: 'work', name: 'Build', optional: true },
      { id: 'pr', kind: 'pr', name: 'Pull request', skills: ['tdd'], brief: 'Link the issue.' }
    ]
  }
  it('names the skills of a plan or a pull request step, and says an optional step may be skipped', () => {
    const text = workflowBrief(FLOW, { planFirst: true })
    expect(text).toContain('- plan "Plan" (skill: tdd): the person approves your plan before you edit. Say what you will touch.')
    expect(text).toContain('- build "Build" (optional: the person may skip it):')
    expect(text).toContain('- pr "Pull request" (skill: tdd): when you open the pull request, Link the issue.')
  })
  it('lists a pull request step that has skills but no brief', () => {
    const bare: RunWorkflow = { ...FLOW, steps: [FLOW.steps[1]!, { id: 'pr', kind: 'pr', name: 'Pull request', skills: ['tdd'] }] }
    expect(workflowBrief(bare)).toContain('- pr "Pull request" (skill: tdd): when you open the pull request.')
  })
})
