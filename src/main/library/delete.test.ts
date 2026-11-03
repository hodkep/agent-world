import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteSkill, planDelete } from './delete'
import { Library } from './store'

let dir: string
let lib: Library
let home: string
const skill = (where: string, name: string) => {
  mkdirSync(where, { recursive: true })
  writeFileSync(join(where, 'SKILL.md'), `---\nname: ${name}\ndescription: d\n---\nb`)
  writeFileSync(join(where, 'data.bin'), 'x'.repeat(500))
}
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aw-del-'))
  home = join(dir, 'home')
  lib = new Library(join(dir, 'library'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))
const roots = () => [join(home, '.claude', 'skills'), join(home, '.agents', 'skills')]
const ctx = (over = {}) => ({ roots: roots(), rules: 0, tracked: async () => false, ...over })

describe('what Delete would remove, and removing it', () => {
  it('lists the real folder with its size, every link that points at it, and the rules that name it; then removes them all, and the library entry', async () => {
    // As the skills CLI installs: the real folder in ~/.agents/skills, a link to it in ~/.claude/skills; and our own library link.
    skill(join(home, '.agents', 'skills', 'caveman'), 'caveman')
    mkdirSync(join(home, '.claude', 'skills'), { recursive: true })
    symlinkSync(join(home, '.agents', 'skills', 'caveman'), join(home, '.claude', 'skills', 'caveman'), 'dir')
    const item = (await lib.addSkillFolder(join(home, '.claude', 'skills', 'caveman'), 'cli', { kind: 'global' }))!
    const plan = await planDelete(item, ctx({ rules: 2 }), 512)
    expect(plan.refused).toBeUndefined()
    expect(plan.files).toEqual([{ path: expect.stringMatching(/\.agents\/skills\/caveman$/), bytes: 512 }])
    expect(plan.links).toEqual([expect.stringMatching(/\.claude\/skills\/caveman$/)])
    expect(plan.rules).toBe(2)
    await deleteSkill(plan, lib)
    expect(existsSync(join(home, '.agents', 'skills', 'caveman'))).toBe(false)
    expect(existsSync(join(home, '.claude', 'skills', 'caveman'))).toBe(false)
    expect(await lib.list()).toEqual([])
  })
  it('asks a second time for a project skill that git tracks, and refuses a plugin\'s, a folder outside a skills folder, and one with no SKILL.md', async () => {
    const project = join(dir, 'proj')
    skill(join(project, '.claude', 'skills', 'review'), 'review')
    const item = (await lib.addSkillFolder(join(project, '.claude', 'skills', 'review'), 'p', { kind: 'project', project }))!
    const withProject = { roots: [...roots(), join(project, '.claude', 'skills')] }
    expect((await planDelete(item, ctx({ ...withProject, tracked: async () => true }))).tracked).toBe(true)
    expect((await planDelete(item, ctx(withProject))).tracked).toBe(false)
    // Not in any skills folder the app knows.
    expect((await planDelete(item, ctx())).refused).toMatch(/not in a skills folder/i)
    skill(join(dir, 'plug', 'skills', 'edit'), 'edit')
    const plug = (await lib.addSkillFolder(join(dir, 'plug', 'skills', 'edit'), 'plugin', { kind: 'plugin', from: 'iceberg 0.5.4' }))!
    expect((await planDelete(plug, ctx())).refused).toMatch(/Claude manages/i)
    rmSync(join(project, '.claude', 'skills', 'review'), { recursive: true })
    const gone = (await lib.list()).find((i) => i.id === 'review')!
    expect((await planDelete(gone, ctx(withProject))).files).toEqual([])
  })
  it('never deletes a folder the plan refused', async () => {
    skill(join(dir, 'plug', 'skills', 'edit'), 'edit')
    const plug = (await lib.addSkillFolder(join(dir, 'plug', 'skills', 'edit'), 'plugin', { kind: 'plugin' }))!
    const plan = await planDelete(plug, ctx())
    await expect(deleteSkill(plan, lib)).rejects.toThrow(/Claude manages/)
    expect(existsSync(join(dir, 'plug', 'skills', 'edit', 'SKILL.md'))).toBe(true)
  })
})
