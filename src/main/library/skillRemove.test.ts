import { lstatSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { link, linkState, targets } from './links'
import { applySkillRemoval, planSkillRemoval } from './skillRemove'

let dir: string
let lib: string
let home: string
let a: string
let b: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aw-skrm-'))
  lib = join(dir, 'library')
  home = join(dir, 'home')
  a = join(dir, 'a')
  b = join(dir, 'b')
  mkdirSync(join(lib, 'skills', 'pdf'), { recursive: true })
  writeFileSync(join(lib, 'skills', 'pdf', 'SKILL.md'), '---\nname: pdf\n---\nx')
  for (const d of [join(home, '.claude'), join(home, '.gemini', 'config'), a, b]) mkdirSync(d, { recursive: true })
})
afterEach(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))
const at = (folder: string, id: string) => targets(home, folder).find((t) => t.id === id)!
const linked = (folder: string, id: string) => linkState(lib, 'pdf', at(folder, id)) === 'linked'
const ctx = () => ({ root: lib, home, projects: [a, b] })

describe('removing a skill from the folders it is linked into', () => {
  beforeEach(() => {
    link(lib, 'pdf', at(a, 'claude'))
    link(lib, 'pdf', at(a, 'project-claude'))
    link(lib, 'pdf', at(b, 'project-claude'))
    link(lib, 'pdf', at(b, 'project'))
  })

  it('from one project takes away its links in that project only', () => {
    const sc = { scope: 'project', folder: a } as const
    const plan = planSkillRemoval(ctx(), 'pdf', sc)
    expect(plan.steps.map((s) => s.action)).toEqual(['unlink'])
    expect(plan.steps[0]!.dir).toBe(at(a, 'project-claude').dir)
    applySkillRemoval(ctx(), 'pdf', sc, plan)
    expect(linked(a, 'project-claude')).toBe(false)
    expect(linked(b, 'project-claude')).toBe(true)
    expect(linked(a, 'claude')).toBe(true)
  })

  it('from every project leaves the global links', () => {
    { const sc = { scope: 'projects' } as const; applySkillRemoval(ctx(), 'pdf', sc, planSkillRemoval(ctx(), 'pdf', sc)) }
    expect([linked(a, 'project-claude'), linked(b, 'project-claude'), linked(b, 'project')]).toEqual([false, false, false])
    expect(linked(a, 'claude')).toBe(true)
  })

  it('from everywhere takes away every link, and the skill itself stays in the library', () => {
    { const sc = { scope: 'all' } as const; applySkillRemoval(ctx(), 'pdf', sc, planSkillRemoval(ctx(), 'pdf', sc)) }
    expect([linked(a, 'claude'), linked(a, 'project-claude'), linked(b, 'project')]).toEqual([false, false, false])
    expect(lstatSync(join(lib, 'skills', 'pdf', 'SKILL.md')).isFile()).toBe(true)
  })

  it('keeping one global links it into the programs installed here and takes the project links away', () => {
    rmSync(join(at(a, 'claude').dir, 'pdf'))
    const sc = { scope: 'keep-global' } as const
    const plan = planSkillRemoval(ctx(), 'pdf', sc)
    expect(plan.steps.filter((s) => s.action === 'link').map((s) => s.dir)).toEqual([at(a, 'claude').dir, at(a, 'agy-app').dir])
    applySkillRemoval(ctx(), 'pdf', sc, plan)
    expect([linked(a, 'claude'), linked(a, 'agy-app'), linked(a, 'agy-cli')]).toEqual([true, true, false])
    expect([linked(a, 'project-claude'), linked(b, 'project-claude'), linked(b, 'project')]).toEqual([false, false, false])
  })

  it('leaves alone a real folder or a link to something else of that name, and says so', () => {
    rmSync(join(at(b, 'project-claude').dir, 'pdf'))
    mkdirSync(join(at(b, 'project-claude').dir, 'pdf'))
    writeFileSync(join(at(b, 'project-claude').dir, 'pdf', 'SKILL.md'), 'mine')
    const sc = { scope: 'projects' } as const
    const plan = planSkillRemoval(ctx(), 'pdf', sc)
    expect(plan.left).toEqual([at(b, 'project-claude').dir])
    applySkillRemoval(ctx(), 'pdf', sc, plan)
    expect(lstatSync(join(at(b, 'project-claude').dir, 'pdf', 'SKILL.md')).isFile()).toBe(true)
  })

  it('refuses a plan that is no longer what the folders hold', () => {
    const sc = { scope: 'projects' } as const
    const plan = planSkillRemoval(ctx(), 'pdf', sc)
    rmSync(join(at(a, 'project-claude').dir, 'pdf'))
    symlinkSync(dir, join(at(a, 'project-claude').dir, 'pdf'))
    expect(() => applySkillRemoval(ctx(), 'pdf', sc, plan)).toThrow(/changed/)
    expect(linked(b, 'project-claude')).toBe(true)
  })

  it('refuses a name that is not a library skill', () => {
    expect(() => planSkillRemoval(ctx(), '../x', { scope: 'all' })).toThrow(/Not a library skill/)
  })
})
