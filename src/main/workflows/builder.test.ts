import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Workflow } from '../../shared/workflow'
import { Approvals } from './approvals'
import { Builder, Proposals } from './builder'
import { WorkflowStore } from './store'

const wf = (id: string, name = id, steps: Workflow['steps'] = [{ id: 'build', kind: 'work' }]): Workflow => ({ version: 1, id, name, steps })
const billing = wf('billing-change', 'Billing change', [
  { id: 'plan', kind: 'plan', gate: 'approve' },
  { id: 'tests', kind: 'check', run: 'npm test', gate: 'pass' },
  { id: 'lint', kind: 'check', run: 'npm run lint', gate: 'pass' },
  { id: 'land', kind: 'merge' }
])

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'aw-builder-'))
  const globalDir = join(root, 'home', 'workflows')
  const project = join(root, 'shop')
  mkdirSync(globalDir, { recursive: true })
  mkdirSync(project)
  const store = new WorkflowStore(globalDir)
  const approvals = new Approvals(join(root, 'approvals.json'))
  const file = join(root, 'proposals.json')
  let t = 1000
  const skills = { items: [{ id: 'tdd', kind: 'skill', description: 'Write the failing test first.' }, { id: 'code-review', kind: 'skill', description: 'Review a diff against our standards.' }, { id: 'house-style', kind: 'instruction', description: 'How we write.' }], playbook: new Set(['tdd']) }
  const make = () => new Builder({ store, approvals, proposals: new Proposals(file), skills: { items: () => skills.items, playbook: () => skills.playbook }, now: () => (t += 1000) })
  return { root, project, globalDir, store, approvals, file, skills, builder: make(), make }
}
const json = (w: Workflow) => JSON.stringify(w)

describe('what the builder is told about the workflows that exist', () => {
  it('lists each workflow with where it is, when it fits and its steps, and says which files do not read', () => {
    const s = setup()
    s.store.save(s.project, { ...wf('bug-fix', 'Bug fix', [{ id: 'plan', kind: 'plan' }, { id: 'land', kind: 'merge' }]), when: 'A known symptom.' }, 'project')
    s.store.save(null, wf('quick', 'Quick'), 'global')
    writeFileSync(join(s.project, '.agent-world', 'workflows', 'broken.json'), '{')
    const text = s.builder.list(s.project)
    expect(text).toContain('- standard (built in): Standard')
    expect(text).toContain('- bug-fix (this project): Bug fix. When: A known symptom. Steps: Plan, Land')
    expect(text).toContain('- quick (everything): Quick. Steps: Build')
    expect(text).toMatch(/- broken \(this project\): does not read/)
  })

  it('gives one as its file, tells a broken one what is wrong, and says so for an id that does not exist', () => {
    const s = setup()
    s.store.save(s.project, billing, 'project')
    expect(JSON.parse(s.builder.get(s.project, 'billing-change'))).toEqual(billing)
    expect(s.builder.get(s.project, 'standard')).toContain('"id": "standard"')
    expect(s.builder.get(s.project, 'standard')).toContain('built in')
    writeFileSync(join(s.project, '.agent-world', 'workflows', 'broken.json'), '{')
    expect(s.builder.get(s.project, 'broken')).toContain('Not valid JSON')
    expect(() => s.builder.get(s.project, 'nope')).toThrow('No workflow "nope".')
    expect(() => s.builder.get(s.project, '../x')).toThrow('Not a valid workflow id.')
  })
})

describe('a proposal', () => {
  it('is kept for the agent that made it and shown against what is saved, and nothing is written', () => {
    const s = setup()
    const said = s.builder.propose('a1', s.project, json(billing))
    expect(said).toContain('"Billing change"')
    expect(said).toMatch(/only the person saves/i)
    const v = s.builder.view('a1', s.project)!
    expect(v.workflow).toEqual(billing)
    expect(v.diff.isNew).toBe(true)
    expect(v.saved).toBeUndefined()
    expect(v.stale).toBe(false)
    expect(s.store.list(s.project).map((e) => e.id)).toEqual(['standard'])
    expect(s.builder.view('a2', s.project)).toBeNull()
  })

  it('that has problems comes back with every one of them and leaves an earlier draft as it was', () => {
    const s = setup()
    s.builder.propose('a1', s.project, json(billing))
    const bad = { ...wf('Bad Id', ''), steps: [{ id: 'tests', kind: 'check' }, { id: 'x', kind: 'nope' }] }
    expect(() => s.builder.propose('a1', s.project, json(bad as Workflow))).toThrow(/Nothing was proposed[\s\S]*"id" must be lowercase[\s\S]*"name" is required[\s\S]*needs "run"[\s\S]*"kind" must be one of/)
    expect(() => s.builder.propose('a1', s.project, 'not json')).toThrow('Not valid JSON')
    expect(() => s.builder.propose('a1', s.project, 'x'.repeat(40_000))).toThrow('too long')
    expect(s.builder.view('a1', s.project)!.workflow).toEqual(billing)
  })

  it('that is the saved file unchanged is not a proposal', () => {
    const s = setup()
    s.store.save(s.project, billing, 'project')
    expect(s.builder.propose('a1', s.project, json(billing))).toMatch(/unchanged/)
    expect(s.builder.view('a1', s.project)).toBeNull()
  })

  it('of a saved workflow shows what changes, and which scope it would replace', () => {
    const s = setup()
    s.store.save(s.project, billing, 'project')
    const next = structuredClone(billing)
    next.steps[1] = { ...next.steps[1]!, retries: 3 }
    s.builder.propose('a1', s.project, json(next))
    const v = s.builder.view('a1', s.project)!
    expect(v.saved).toMatchObject({ scope: 'project' })
    expect(v.diff.changed).toEqual([{ id: 'tests', name: 'Check', fields: ['retries none → 3'] }])
    expect(v.stale).toBe(false)
  })

  it('of Standard is compared with the built-in one', () => {
    const s = setup()
    s.builder.propose('a1', s.project, json({ ...wf('standard', 'Standard'), steps: [{ id: 'plan', kind: 'plan' }, { id: 'build', kind: 'work', name: 'Build' }] }))
    const v = s.builder.view('a1', s.project)!
    expect(v.saved).toMatchObject({ scope: 'built-in' })
    expect(v.diff.isNew).toBe(false)
    expect(v.diff.removed.map((x) => x.id)).toEqual(['review', 'land'])
  })

  it('goes stale when the saved file changes after it was proposed', () => {
    const s = setup()
    s.store.save(s.project, billing, 'project')
    const next = { ...billing, name: 'Billing' }
    s.builder.propose('a1', s.project, json(next))
    expect(s.builder.view('a1', s.project)!.stale).toBe(false)
    s.store.save(s.project, { ...billing, name: 'Edited by hand' }, 'project', { replace: true })
    expect(s.builder.view('a1', s.project)!.stale).toBe(true)
    s.builder.propose('b1', s.project, json(wf('fresh', 'Fresh')))
    s.store.save(s.project, wf('fresh', 'Fresh'), 'project')
    expect(s.builder.view('b1', s.project)!.stale).toBe(true)
  })

  it('marks the commands the person approved before for that workflow, so only new ones are news', () => {
    const s = setup()
    s.approvals.approve('billing-change', 'old', ['npm test'], 500)
    s.builder.propose('a1', s.project, json(billing))
    expect(s.builder.view('a1', s.project)!.commands).toEqual([{ text: 'npm test', known: true }, { text: 'npm run lint', known: false }])
  })

  it('survives a restart, one per agent, and a damaged file means no proposal', () => {
    const s = setup()
    s.builder.propose('a1', s.project, json(billing))
    s.builder.propose('a2', s.project, json(wf('other', 'Other')))
    const again = s.make()
    expect(again.view('a1', s.project)!.workflow.id).toBe('billing-change')
    expect(again.view('a2', s.project)!.workflow.id).toBe('other')
    again.discard('a1')
    expect(s.make().view('a1', s.project)).toBeNull()
    writeFileSync(s.file, '{{{')
    expect(s.make().view('a2', s.project)).toBeNull()
  })
})

describe('the person editing a proposal', () => {
  const edited = (w: Workflow, f: (steps: Workflow['steps']) => Workflow['steps']): Workflow => ({ ...w, steps: f(w.steps.map((x) => ({ ...x }))) })

  it('replaces the draft with the edited workflow, keeps what it was made against, and says how many steps were edited', () => {
    const s = setup()
    s.builder.propose('a1', s.project, json(billing))
    expect(s.builder.view('a1', s.project)!.edited).toBeUndefined()
    const next = edited(billing, (st) => [...st.slice(0, 3), { id: 'security', kind: 'approve', name: 'Security review' }, st[3]!])
    const v = s.builder.edit('a1', s.project, next)
    expect(v.workflow).toEqual(next)
    expect(v.edited).toBe(1)
    expect(s.builder.view('a1', s.project)!.workflow).toEqual(next)
    next.steps[1]!.run = 'npm run test:unit'
    expect(s.builder.edit('a1', s.project, next).edited).toBe(2)
  })

  it('is refused with every problem named, and the draft stays as it was', () => {
    const s = setup()
    s.builder.propose('a1', s.project, json(billing))
    const bad = edited(billing, (st) => st.map((x) => (x.id === 'tests' ? { id: 'tests', kind: 'check' as const } : x.id === 'lint' ? { ...x, retries: 9 } : x)))
    expect(() => s.builder.edit('a1', s.project, bad)).toThrow(/a check step needs "run"[\s\S]*"retries" must be a whole number/)
    expect(s.builder.view('a1', s.project)!.workflow).toEqual(billing)
  })

  it('may not change the id, name a skill the library has not got, or edit when nothing is proposed', () => {
    const s = setup()
    expect(() => s.builder.edit('a1', s.project, billing)).toThrow('Nothing is proposed.')
    s.builder.propose('a1', s.project, json(billing))
    expect(() => s.builder.edit('a1', s.project, { ...billing, id: 'other' })).toThrow('The id cannot change')
    const withSkill = edited(wf('billing-change', 'Billing change', [{ id: 'build', kind: 'work' }]), (st) => st.map((x) => ({ ...x, skills: ['no-such-skill'] })))
    s.builder.propose('a2', s.project, json(wf('billing-change', 'Billing change', [{ id: 'build', kind: 'work' }])))
    expect(() => s.builder.edit('a2', s.project, withSkill)).toThrow(/no skill "no-such-skill"/)
    expect(s.builder.edit('a2', s.project, edited(withSkill, (st) => st.map((x) => ({ ...x, skills: ['tdd'] })))).workflow.steps[0]!.skills).toEqual(['tdd'])
  })

  it('can be undone, back to what the builder proposed, and a new proposal from the builder starts over', () => {
    const s = setup()
    s.builder.propose('a1', s.project, json(billing))
    s.builder.edit('a1', s.project, edited(billing, (st) => st.slice(0, 2)))
    expect(s.builder.undoEdits('a1', s.project).workflow).toEqual(billing)
    expect(s.builder.view('a1', s.project)!.edited).toBeUndefined()
    s.builder.edit('a1', s.project, edited(billing, (st) => st.slice(0, 2)))
    const other = wf('billing-change', 'Billing change', [{ id: 'build', kind: 'work' }])
    s.builder.propose('a1', s.project, json(other))
    expect(s.builder.undoEdits('a1', s.project).workflow).toEqual(other)
  })

  it('is what is saved: saving writes the edited workflow, and the edits survive a restart', () => {
    const s = setup()
    s.builder.propose('a1', s.project, json(billing))
    const next = edited(billing, (st) => st.slice(0, 3))
    s.builder.edit('a1', s.project, next)
    expect(s.make().view('a1', s.project)!.workflow).toEqual(next)
    const entry = s.builder.save('a1', s.project, 'project')
    expect(entry.workflow!.steps.map((x) => x.id)).toEqual(['plan', 'tests', 'lint'])
  })
})

describe('saving a proposal', () => {
  it('to the project writes the file, approves its commands for that exact version, and clears the draft', () => {
    const s = setup()
    s.builder.propose('a1', s.project, json(billing))
    const e = s.builder.save('a1', s.project, 'project')
    expect(e).toMatchObject({ id: 'billing-change', scope: 'project' })
    expect(JSON.parse(readFileSync(e.file!, 'utf8'))).toEqual(billing)
    expect(s.approvals.has(e.hash!)).toBe(true)
    expect(s.approvals.previous('billing-change', 'x')).toMatchObject({ commands: ['npm test', 'npm run lint'] })
    expect(s.builder.view('a1', s.project)).toBeNull()
  })

  it('for everything writes to the app folder, and a workflow with no commands approves nothing', () => {
    const s = setup()
    s.builder.propose('a1', s.project, json(wf('quick', 'Quick')))
    const e = s.builder.save('a1', s.project, 'global')
    expect(e.file).toBe(join(s.globalDir, 'quick.json'))
    expect(s.approvals.has(e.hash!)).toBe(false)
  })

  it('as a replacement overwrites the saved file in its own place and approves the new version', () => {
    const s = setup()
    const first = s.store.save(s.project, billing, 'project')
    const next = { ...billing, name: 'Billing' }
    s.builder.propose('a1', s.project, json(next))
    const e = s.builder.save('a1', s.project, 'replace')
    expect(e.file).toBe(first.file)
    expect(e.workflow!.name).toBe('Billing')
    expect(s.approvals.has(e.hash!)).toBe(true)
    expect(s.store.list(s.project).filter((x) => x.id === 'billing-change')).toHaveLength(1)
  })

  it('as a new workflow takes a free id and a name that says so, in the place the old one is', () => {
    const s = setup()
    s.store.save(null, billing, 'global')
    s.builder.propose('a1', s.project, json({ ...billing, name: 'Billing v2' }))
    const e = s.builder.save('a1', s.project, 'copy')
    expect(e).toMatchObject({ id: 'billing-change-2', scope: 'global' })
    expect(e.workflow).toMatchObject({ id: 'billing-change-2', name: 'Billing v2 (2)' })
    s.builder.propose('a1', s.project, json({ ...billing, name: 'Billing v3' }))
    expect(s.builder.save('a1', s.project, 'copy').id).toBe('billing-change-3')
  })

  it('refuses when nothing is proposed, when the saved file changed since, and when it would overwrite by accident', () => {
    const s = setup()
    expect(() => s.builder.save('a1', s.project, 'project')).toThrow('Nothing is proposed.')
    s.store.save(s.project, billing, 'project')
    s.builder.propose('a1', s.project, json({ ...billing, name: 'Billing' }))
    s.store.save(s.project, { ...billing, name: 'By hand' }, 'project', { replace: true })
    expect(() => s.builder.save('a1', s.project, 'replace')).toThrow('changed since')
    expect(s.builder.view('a1', s.project)).not.toBeNull()
    s.builder.propose('a1', s.project, json({ ...billing, name: 'Billing' }))
    expect(() => s.builder.save('a1', s.project, 'project')).toThrow('There is already a workflow "billing-change" in that place.')
    expect(s.builder.view('a1', s.project)).not.toBeNull()
  })
})

describe('skills in what the builder reads and proposes', () => {
  const skilled = (...ids: string[]) => wf('skilled', 'Skilled', [{ id: 'fix', kind: 'work', skills: ids }, { id: 'land', kind: 'merge' }])

  it('are listed with the workflows, ready ones first, and the ones outside the playbook say so', () => {
    const s = setup()
    const text = s.builder.list(s.project)
    expect(text).toContain('Skills you can name on a work step:')
    expect(text).toContain('- tdd: Write the failing test first.\n- code-review: Review a diff against our standards. (not in this project\'s playbook; a step that names it lets agents read it)')
    expect(text).not.toContain('house-style')
  })

  it('are refused when they are not in the library, naming the step and the skills there are, and an instruction is not a skill', () => {
    const s = setup()
    expect(() => s.builder.propose('a1', s.project, json(skilled('tdd', 'deploy-notes')))).toThrow(/Nothing was proposed[\s\S]*Step 1 \("fix"\): there is no skill "deploy-notes" in the library\. Skills you can name: tdd, code-review\./)
    expect(() => s.builder.propose('a1', s.project, json(skilled('house-style')))).toThrow('there is no skill "house-style"')
    expect(s.builder.view('a1', s.project)).toBeNull()
  })

  it('are accepted when the library has them but the playbook does not, and the draft says how each stands', () => {
    const s = setup()
    s.builder.propose('a1', s.project, json(skilled('tdd', 'code-review')))
    expect(s.builder.view('a1', s.project)!.skills).toEqual({ tdd: 'ready', 'code-review': 'granted' })
  })

  it('show on each saved workflow that names them, and a skill that has since gone is marked gone, not a problem', () => {
    const s = setup()
    s.store.save(s.project, skilled('tdd', 'code-review'), 'project')
    s.store.save(s.project, wf('plain', 'Plain'), 'project')
    s.skills.items = s.skills.items.filter((i) => i.id !== 'code-review')
    const entries = s.builder.entries(s.project)
    expect(entries.find((e) => e.id === 'skilled')).toMatchObject({ skills: { tdd: 'ready', 'code-review': 'gone' } })
    expect(entries.find((e) => e.id === 'skilled')!.problems).toBeUndefined()
    expect(entries.find((e) => e.id === 'plain')!.skills).toBeUndefined()
    expect(entries.find((e) => e.id === 'standard')!.skills).toBeUndefined()
  })
})
