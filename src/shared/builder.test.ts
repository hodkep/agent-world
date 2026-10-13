import { describe, expect, it } from 'vitest'
import { BUILDER_NAME, BUILDER_ROLE, BUILDER_TOOLS, builderAgent, builderInstructions, builderName, builderOptions, workflowDiff } from './builder'
import type { AgentRecord } from './types'
import { STEPS_MAX, STEP_KINDS, GATES, parseWorkflow, type Workflow } from './workflow'

const bugFix: Workflow = {
  version: 1,
  id: 'bug-fix',
  name: 'Bug fix',
  steps: [
    { id: 'plan', kind: 'plan', gate: 'approve' },
    { id: 'fix', kind: 'work', name: 'Fix, test first' },
    { id: 'tests', kind: 'check', name: 'Tests pass', run: 'npm test', gate: 'pass', retries: 2 },
    { id: 'review', kind: 'audit' },
    { id: 'land', kind: 'merge' }
  ]
}

describe('workflowDiff', () => {
  it('calls every step added and every command new when nothing was saved', () => {
    const d = workflowDiff(undefined, bugFix)
    expect(d.isNew).toBe(true)
    expect(d.added.map((s) => s.id)).toEqual(['plan', 'fix', 'tests', 'review', 'land'])
    expect(d.commands).toEqual([{ change: 'added', text: 'npm test' }])
    expect(d.removed).toEqual([])
    expect(d.unchanged).toEqual([])
  })

  it('finds nothing to report when the proposal is the saved file', () => {
    const d = workflowDiff(bugFix, structuredClone(bugFix))
    expect(d.isNew).toBe(false)
    expect(d.added).toEqual([])
    expect(d.removed).toEqual([])
    expect(d.changed).toEqual([])
    expect(d.reordered).toBe(false)
    expect(d.unchanged).toEqual(['Plan', 'Fix, test first', 'Tests pass', 'Audit', 'Land'])
    expect(d.same).toBe(true)
  })

  it('names an added step, where it goes, and its command as new', () => {
    const after = structuredClone(bugFix)
    after.steps.splice(3, 0, { id: 'lint', kind: 'check', name: 'Lint', run: 'npm run lint', gate: 'pass' })
    const d = workflowDiff(bugFix, after)
    expect(d.added).toEqual([{ id: 'lint', name: 'Lint', kind: 'check', after: 'Tests pass' }])
    expect(d.commands).toEqual([{ change: 'added', text: 'npm run lint' }, { change: 'same', text: 'npm test' }])
    expect(d.unchanged).toHaveLength(5)
    expect(d.same).toBe(false)
  })

  it('says which fields of a step changed, from and to', () => {
    const after = structuredClone(bugFix)
    after.steps[2] = { ...after.steps[2]!, retries: 3, gate: 'auto' }
    after.steps[0] = { id: 'plan', kind: 'plan' }
    const d = workflowDiff(bugFix, after)
    expect(d.changed).toEqual([
      { id: 'plan', name: 'Plan', fields: ['gate approve → none'] },
      { id: 'tests', name: 'Tests pass', fields: ['gate pass → auto', 'retries 2 → 3'] }
    ])
    expect(d.unchanged).toEqual(['Fix, test first', 'Audit', 'Land'])
  })

  it('keeps a long brief out of the line and a command change in it', () => {
    const before: Workflow = { ...bugFix, steps: [{ id: 'plan', kind: 'plan', brief: 'a'.repeat(300) }, { id: 'tests', kind: 'check', run: 'npm test' }] }
    const after: Workflow = { ...bugFix, steps: [{ id: 'plan', kind: 'plan', brief: 'b'.repeat(300) }, { id: 'tests', kind: 'check', run: 'npm run test:unit' }] }
    const d = workflowDiff(before, after)
    expect(d.changed[0]!.fields).toEqual(['brief rewritten'])
    expect(d.changed[1]!.fields).toEqual(['run npm test → npm run test:unit'])
    expect(d.commands).toEqual([{ change: 'added', text: 'npm run test:unit' }, { change: 'removed', text: 'npm test' }])
  })

  it('names a removed step and notices steps that kept their ids but moved', () => {
    const after = structuredClone(bugFix)
    after.steps = [after.steps[0]!, after.steps[2]!, after.steps[1]!, after.steps[4]!]
    const d = workflowDiff(bugFix, after)
    expect(d.removed).toEqual([{ id: 'review', name: 'Audit', kind: 'audit' }])
    expect(d.reordered).toBe(true)
  })

  it('reports a new name or "when" on the workflow itself', () => {
    const d = workflowDiff(bugFix, { ...bugFix, name: 'Fix a bug', when: 'A known symptom.' })
    expect(d.name).toEqual({ from: 'Bug fix', to: 'Fix a bug' })
    expect(d.when).toBe(true)
    expect(d.same).toBe(false)
  })
})

describe('builderInstructions', () => {
  const text = builderInstructions()

  it('fits what an agent can be given and is not empty', () => {
    expect(text.length).toBeGreaterThan(1500)
    expect(text.length).toBeLessThanOrEqual(6000)
  })

  it('describes every step kind with the gates the file format allows for it', () => {
    for (const kind of STEP_KINDS) {
      const line = text.split('\n').find((l) => l.startsWith(`- ${kind}:`))
      expect(line, kind).toBeDefined()
      for (const gate of GATES[kind]) expect(line, `${kind} ${gate}`).toContain(gate)
    }
  })

  it('says how many steps there may be, and that only the person saves', () => {
    expect(text).toContain(`${STEPS_MAX}`)
    expect(text).toMatch(/never write (a|the) file/i)
    for (const t of BUILDER_TOOLS) expect(text).toContain(t)
  })

  it('lets it name only skills the list shows, and says it must tell the person when it leaves one out', () => {
    expect(text).toMatch(/Skills you can name/)
    expect(text).toMatch(/never invent a skill/i)
    expect(text).toMatch(/say so in your reply/i)
  })

  it('does not send the builder to report a task, which it does not have', () => {
    expect(text).not.toContain('task_begin')
  })

  it('shows an example that the file check itself accepts', () => {
    const block = /```json\n([\s\S]*?)\n```/.exec(text)?.[1]
    expect(block).toBeDefined()
    const r = parseWorkflow(block!)
    expect(r.ok, JSON.stringify(r)).toBe(true)
  })

  it('has one name and one role for the agent, and three tools', () => {
    expect(BUILDER_NAME).toBe('builder')
    expect(BUILDER_ROLE).toBe('Workflow builder')
    expect([...BUILDER_TOOLS]).toEqual(['workflow_list', 'workflow_get', 'workflow_propose'])
  })
})

describe('finding and making the builder', () => {
  const agent = (o: Partial<AgentRecord>): AgentRecord => ({ id: 'x', name: 'ada', sessionId: 's', repoPath: '/shop', cwd: '/shop', branch: null, started: true, ...o })

  it('finds the builder of this project by its mark, not by its name, and not another project\'s', () => {
    const mine = agent({ id: 'b1', name: 'builder', builder: true })
    expect(builderAgent([agent({ id: 'a' }), mine, agent({ id: 'c', name: 'builder' })], '/shop')).toBe(mine)
    expect(builderAgent([agent({ id: 'o', name: 'builder', builder: true, repoPath: '/other' })], '/shop')).toBeUndefined()
    expect(builderAgent([], '/shop')).toBeUndefined()
  })

  it('is hired in the project folder itself, read-only, on Claude, with its instructions', () => {
    const o = builderOptions()
    expect(o).toEqual({ provider: 'claude', role: BUILDER_ROLE, inPlace: true, permissionMode: 'plan', instructions: builderInstructions() })
  })

  it('is called builder, or builder-2 and on when another project\'s agent has that name', () => {
    expect(builderName([])).toBe('builder')
    expect(builderName(['ada', 'builder'])).toBe('builder-2')
    expect(builderName(['builder', 'builder-2'])).toBe('builder-3')
  })
})
