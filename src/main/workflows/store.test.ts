import { mkdirSync, mkdtempSync, readFileSync, readdirSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { STANDARD, type Workflow } from '../../shared/workflow'
import { WorkflowStore } from './store'

const wf = (id: string, name = id, extra: Partial<Workflow> = {}): Workflow => ({ version: 1, id, name, steps: [{ id: 'build', kind: 'work' }], ...extra })

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'aw-wfstore-'))
  const globalDir = join(root, 'home', 'workflows')
  const project = join(root, 'shop')
  const projectDir = join(project, '.agent-world', 'workflows')
  mkdirSync(globalDir, { recursive: true })
  mkdirSync(projectDir, { recursive: true })
  const put = (dir: string, file: string, content: unknown) => writeFileSync(join(dir, file), typeof content === 'string' ? content : JSON.stringify(content))
  return { root, globalDir, project, projectDir, put, store: new WorkflowStore(globalDir) }
}

describe('listing the workflows a project can use', () => {
  it('has Standard even when there are no files, and lists global and project files with where they came from', () => {
    const s = setup()
    expect(s.store.list(s.project).map((e) => [e.id, e.scope])).toEqual([['standard', 'built-in']])
    s.put(s.globalDir, 'quick-change.json', wf('quick-change', 'Quick change'))
    s.put(s.projectDir, 'bug-fix.json', wf('bug-fix', 'Bug fix'))
    const list = s.store.list(s.project)
    expect(list.map((e) => [e.id, e.scope])).toEqual([['standard', 'built-in'], ['bug-fix', 'project'], ['quick-change', 'global']])
    expect(list[1]!.workflow).toEqual(wf('bug-fix', 'Bug fix'))
    expect(list.find((e) => e.id === 'standard')!.workflow).toEqual(STANDARD)
  })

  it('a project\'s workflow wins over a global one with the same id and says so, and a file named standard replaces the built-in one', () => {
    const s = setup()
    s.put(s.globalDir, 'quick-change.json', wf('quick-change', 'Quick change'))
    s.put(s.projectDir, 'quick-change.json', wf('quick-change', 'Quick change for shop'))
    s.put(s.globalDir, 'standard.json', wf('standard', 'Our standard'))
    s.put(s.globalDir, 'a-first.json', wf('a-first', 'A first'))
    const list = s.store.list(s.project)
    expect(list.map((e) => [e.id, e.scope, e.overrides])).toEqual([['standard', 'global', 'built-in'], ['a-first', 'global', undefined], ['quick-change', 'project', 'global']])
    expect(list[2]!.workflow!.name).toBe('Quick change for shop')
  })

  it('knows the file each came from and a hash of its content, which changes when the file does', () => {
    const s = setup()
    s.put(s.projectDir, 'bug-fix.json', wf('bug-fix', 'Bug fix'))
    const before = s.store.list(s.project).find((e) => e.id === 'bug-fix')!
    expect(before.file).toBe(join(s.projectDir, 'bug-fix.json'))
    expect(before.hash).toMatch(/^[0-9a-f]{16}$/)
    expect(s.store.list(s.project).find((e) => e.id === 'bug-fix')!.hash).toBe(before.hash)
    s.put(s.projectDir, 'bug-fix.json', wf('bug-fix', 'Bug fix, changed'))
    expect(s.store.list(s.project).find((e) => e.id === 'bug-fix')!.hash).not.toBe(before.hash)
    expect(s.store.list(s.project).find((e) => e.id === 'standard')!.file).toBeUndefined()
  })
})

describe('files that do not read', () => {
  it('show up with their problems instead of being dropped or breaking the list; other files in the folder are ignored', () => {
    const s = setup()
    s.put(s.projectDir, 'broken.json', '{ "id": ')
    s.put(s.projectDir, 'wrong-name.json', wf('something-else'))
    s.put(s.projectDir, 'bad-steps.json', { version: 1, id: 'bad-steps', name: 'Bad', steps: [{ id: 'x', kind: 'dance' }] })
    s.put(s.projectDir, 'big.json', JSON.stringify(wf('big')) + ' '.repeat(100_001))
    s.put(s.projectDir, 'notes.txt', 'not a workflow')
    s.put(s.projectDir, 'good.json', wf('good'))
    const list = s.store.list(s.project)
    expect(list.map((e) => e.id)).toEqual(['standard', 'good', 'bad-steps', 'big', 'broken', 'wrong-name'])
    const by = (id: string) => list.find((e) => e.id === id)!
    expect(by('broken').problems![0]).toMatch(/^Not valid JSON/)
    expect(by('wrong-name').problems).toEqual(['The id "something-else" does not match the file name "wrong-name.json". Rename the file or the id.'])
    expect(by('bad-steps').problems).toEqual(['Step 1 ("x"): "kind" must be one of plan, work, check, audit, approve, pr, merge.'])
    expect(by('big').problems).toEqual(['The file is larger than 100 KB.'])
    expect(by('broken').workflow).toBeUndefined()
    expect(by('broken').scope).toBe('project')
  })
})

describe('copying and deleting', () => {
  it('a copy is a new file in the chosen place with a free id and a "(copy)" name; the built-in Standard can be copied too', () => {
    const s = setup()
    s.put(s.projectDir, 'bug-fix.json', wf('bug-fix', 'Bug fix'))
    const one = s.store.duplicate(s.project, 'bug-fix', 'project')
    expect(one).toMatchObject({ id: 'bug-fix-copy', scope: 'project', workflow: { id: 'bug-fix-copy', name: 'Bug fix (copy)' } })
    expect(s.store.duplicate(s.project, 'bug-fix', 'global')).toMatchObject({ id: 'bug-fix-copy', scope: 'global' })
    expect(s.store.duplicate(s.project, 'bug-fix', 'project').id).toBe('bug-fix-copy-2')
    expect(s.store.duplicate(s.project, 'standard', 'global')).toMatchObject({ id: 'standard-copy', workflow: { ...STANDARD, id: 'standard-copy', name: 'Standard (copy)' } })
    expect(s.store.list(s.project).map((e) => e.id)).toContain('standard-copy')
  })

  it('refuses to copy what does not exist or does not read, and keeps a long name inside the limit', () => {
    const s = setup()
    s.put(s.projectDir, 'broken.json', '{')
    expect(() => s.store.duplicate(s.project, 'nope', 'global')).toThrow('No such workflow.')
    expect(() => s.store.duplicate(s.project, 'broken', 'global')).toThrow('That file has problems, so it cannot be copied.')
    expect(() => s.store.duplicate(null, 'standard', 'project')).toThrow('Open a project first.')
    s.put(s.globalDir, 'long.json', wf('long', 'L'.repeat(60)))
    expect(s.store.duplicate(s.project, 'long', 'global').workflow!.name).toHaveLength(60)
  })

  it('deleting removes the file from the chosen place only, and the built-in Standard cannot be deleted', () => {
    const s = setup()
    s.put(s.globalDir, 'quick-change.json', wf('quick-change', 'Global one'))
    s.put(s.projectDir, 'quick-change.json', wf('quick-change', 'Project one'))
    s.store.remove(s.project, 'quick-change', 'project')
    const left = s.store.list(s.project).find((e) => e.id === 'quick-change')!
    expect(left).toMatchObject({ scope: 'global', workflow: { name: 'Global one' } })
    s.store.remove(s.project, 'quick-change', 'global')
    expect(s.store.list(s.project).map((e) => e.id)).toEqual(['standard'])
    expect(() => s.store.remove(s.project, 'standard', 'global')).toThrow('The built-in Standard cannot be deleted. Copy it to change it.')
    expect(() => s.store.remove(s.project, 'quick-change', 'project')).toThrow('No such workflow.')
  })

  it('never touches a path outside the two folders: an id that is not plain is refused', () => {
    const s = setup()
    for (const id of ['../escape', 'a/b', '..', 'UPPER', '']) {
      expect(() => s.store.remove(s.project, id, 'global')).toThrow('Not a valid workflow id.')
      expect(() => s.store.duplicate(s.project, id, 'global')).toThrow('Not a valid workflow id.')
    }
  })
})

describe('saving a workflow the builder proposed', () => {
  it('writes it as a file in the chosen place and gives back the entry the list would show', () => {
    const s = setup()
    const e = s.store.save(s.project, wf('billing-change', 'Billing change'), 'project')
    expect(e).toMatchObject({ id: 'billing-change', scope: 'project', workflow: wf('billing-change', 'Billing change'), file: join(s.projectDir, 'billing-change.json') })
    expect(e.hash).toMatch(/^[0-9a-f]{16}$/)
    expect(readFileSync(e.file!, 'utf8')).toBe(JSON.stringify(wf('billing-change', 'Billing change'), null, 2) + '\n')
    expect(s.store.list(s.project).find((x) => x.id === 'billing-change')).toEqual(e)
    expect(s.store.save(s.project, wf('everywhere', 'Everywhere'), 'global').file).toBe(join(s.globalDir, 'everywhere.json'))
  })

  it('creates the folder when the project has none yet', () => {
    const s = setup()
    const bare = join(s.root, 'bare')
    mkdirSync(bare)
    expect(s.store.save(bare, wf('first', 'First'), 'project').file).toBe(join(bare, '.agent-world', 'workflows', 'first.json'))
  })

  it('does not overwrite a file unless told to, and then changes the content and its hash', () => {
    const s = setup()
    const first = s.store.save(s.project, wf('bug-fix', 'Bug fix'), 'project')
    expect(() => s.store.save(s.project, wf('bug-fix', 'Other'), 'project')).toThrow('There is already a workflow "bug-fix" in that place.')
    const second = s.store.save(s.project, wf('bug-fix', 'Other'), 'project', { replace: true })
    expect(second.workflow!.name).toBe('Other')
    expect(second.hash).not.toBe(first.hash)
  })

  it('refuses a workflow the file check refuses, a project scope without a project, and leaves no half-written file', () => {
    const s = setup()
    const bad = { ...wf('bad', 'Bad'), steps: [{ id: 'tests', kind: 'check' }] } as Workflow
    expect(() => s.store.save(s.project, bad, 'project')).toThrow('a check step needs "run"')
    expect(() => s.store.save(null, wf('x', 'X'), 'project')).toThrow('Open a project first.')
    expect(readdirSync(s.projectDir)).toEqual([])
    s.store.save(s.project, wf('good', 'Good'), 'project')
    expect(readdirSync(s.projectDir)).toEqual(['good.json'])
  })
})

describe('when a workflow last changed', () => {
  it('is the time of the file the project uses for that id, and nothing for the built-in Standard or an id with no file', () => {
    const s = setup()
    s.put(s.projectDir, 'bug-fix.json', wf('bug-fix', 'Bug fix'))
    utimesSync(join(s.projectDir, 'bug-fix.json'), new Date(2_000_000_000_000), new Date(2_000_000_000_000))
    expect(s.store.changedAt(s.project, 'bug-fix')).toBe(2_000_000_000_000)
    expect(s.store.changedAt(s.project, 'standard')).toBe(0)
    expect(s.store.changedAt(s.project, 'nothing-here')).toBe(0)
  })
})

describe('importing from another project', () => {
  function two() {
    const s = setup()
    const other = join(s.root, 'billing')
    const otherDir = join(other, '.agent-world', 'workflows')
    mkdirSync(otherDir, { recursive: true })
    const empty = join(s.root, 'scratch')
    mkdirSync(empty)
    return { ...s, other, otherDir, empty }
  }

  it('lists each other project with the workflows it keeps itself, not the current one, the shared ones or broken files', () => {
    const s = two()
    s.put(s.projectDir, 'mine.json', wf('mine'))
    s.put(s.globalDir, 'shared.json', wf('shared'))
    s.put(s.otherDir, 'review.json', wf('review', 'Security review'))
    s.put(s.otherDir, 'broken.json', '{')
    const found = s.store.others([s.project, s.other, s.empty], s.project)
    expect(found.map((p) => p.project)).toEqual([s.other, s.empty])
    expect(found[0]!.workflows.map((e) => [e.id, e.workflow!.name])).toEqual([['review', 'Security review']])
    expect(found[1]!.workflows).toEqual([])
  })

  it('copies one into this project or for everything, with its own id and name, and leaves the original alone', () => {
    const s = two()
    s.put(s.otherDir, 'review.json', wf('review', 'Security review'))
    const before = readFileSync(join(s.otherDir, 'review.json'), 'utf8')
    expect(s.store.importFrom(s.other, 'review', s.project, 'project')).toMatchObject({ id: 'review', scope: 'project', workflow: { name: 'Security review' } })
    expect(s.store.importFrom(s.other, 'review', s.project, 'global')).toMatchObject({ id: 'review', scope: 'global' })
    expect(readFileSync(join(s.otherDir, 'review.json'), 'utf8')).toBe(before)
    expect(s.store.list(s.project).find((e) => e.id === 'review')!.scope).toBe('project')
  })

  it('takes the next free id and marks the name when one with that id is already there', () => {
    const s = two()
    s.put(s.otherDir, 'review.json', wf('review', 'Security review'))
    s.put(s.projectDir, 'review.json', wf('review', 'My review'))
    expect(s.store.importFrom(s.other, 'review', s.project, 'project')).toMatchObject({ id: 'review-copy', workflow: { id: 'review-copy', name: 'Security review (copy)' } })
    expect(s.store.importFrom(s.other, 'review', s.project, 'project').id).toBe('review-copy-2')
    expect(readFileSync(join(s.projectDir, 'review.json'), 'utf8')).toContain('My review')
  })

  it('refuses a workflow the other project does not have, one that does not read, and a bad id', () => {
    const s = two()
    s.put(s.otherDir, 'broken.json', '{')
    expect(() => s.store.importFrom(s.other, 'nope', s.project, 'project')).toThrow('No such workflow.')
    expect(() => s.store.importFrom(s.other, 'broken', s.project, 'project')).toThrow('That file has problems, so it cannot be imported.')
    expect(() => s.store.importFrom(s.other, '../x', s.project, 'project')).toThrow('Not a valid workflow id.')
    expect(() => s.store.importFrom(s.other, 'broken', null, 'project')).toThrow('Open a project first.')
  })
})
