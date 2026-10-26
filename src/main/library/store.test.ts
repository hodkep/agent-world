import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Library } from './store'

let dir: string
let lib: Library
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aw-lib-'))
  lib = new Library(join(dir, 'library'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))

describe('the library store', () => {
  it('is empty at first, and keeps an instruction and a prompt as files', async () => {
    expect(await lib.list()).toEqual([])
    const a = await lib.save({ kind: 'instruction', name: 'Commit format', description: 'Conventional commits.', body: 'One line.' })
    const b = await lib.save({ kind: 'prompt', name: 'Review checklist', description: 'What to check.', body: 'Check tests.' })
    expect(a.id).toBe('commit-format')
    expect(b.id).toBe('review-checklist')
    expect((await lib.list()).map((i) => [i.kind, i.id]).sort()).toEqual([['instruction', 'commit-format'], ['prompt', 'review-checklist']])
    expect(await lib.get('commit-format')).toMatchObject({ kind: 'instruction', body: 'One line.', tokens: { body: 3 } })
  })
  it('changes an item by its id, and never overwrites a different item that has the same name', async () => {
    const a = await lib.save({ kind: 'instruction', name: 'Rules', description: 'd', body: 'one' })
    await lib.save({ id: a.id, kind: 'instruction', name: 'Rules', description: 'd', body: 'two' })
    expect((await lib.get(a.id))!.body).toBe('two')
    const second = await lib.save({ kind: 'instruction', name: 'Rules', description: 'other', body: 'three' })
    expect(second.id).toBe('rules-2')
    expect((await lib.list()).length).toBe(2)
  })
  it('copies a skill folder in with its files, leaving the original alone, and lists its files', async () => {
    const src = join(dir, 'orig', 'pdf')
    mkdirSync(join(src, 'scripts'), { recursive: true })
    writeFileSync(join(src, 'SKILL.md'), '---\nname: pdf\ndescription: Work with PDFs.\n---\n\nUse scripts/split.sh.')
    writeFileSync(join(src, 'scripts', 'split.sh'), 'echo split')
    writeFileSync(join(src, '.hidden'), 'x')
    const item = await lib.addSkillFolder(src, '~/.claude/skills')
    expect(item).toMatchObject({ kind: 'skill', id: 'pdf', source: '~/.claude/skills', description: 'Work with PDFs.' })
    expect(item!.files).toEqual(['scripts/split.sh'])
    expect(existsSync(join(item!.dir, 'scripts', 'split.sh'))).toBe(true)
    expect(existsSync(join(item!.dir, '.hidden'))).toBe(false)
    expect(existsSync(join(src, 'SKILL.md'))).toBe(true)
    expect(readFileSync(join(item!.dir, 'SKILL.md'), 'utf8')).toContain('name: pdf')
  })
  it('leaves links out when it copies a skill in', async () => {
    const src = join(dir, 'src', 'linky')
    mkdirSync(src, { recursive: true })
    writeFileSync(join(src, 'SKILL.md'), '---\nname: linky\ndescription: Has a link.\n---\nbody')
    writeFileSync(join(dir, 'secret.txt'), 'private')
    symlinkSync(join(dir, 'secret.txt'), join(src, 'secret.txt'))
    const item = await lib.addSkillFolder(src, 't')
    expect(item?.files).not.toContain('secret.txt')
    expect(existsSync(join(dir, 'library', 'skills', 'linky', 'secret.txt'))).toBe(false)
  })
  it('does not import a skill twice, and answers null for a folder that is not a skill', async () => {
    const src = join(dir, 'orig', 'x')
    mkdirSync(src, { recursive: true })
    expect(await lib.addSkillFolder(src, 's')).toBeNull()
    writeFileSync(join(src, 'SKILL.md'), '---\nname: x\ndescription: d\n---\nb')
    expect(await lib.addSkillFolder(src, 's')).not.toBeNull()
    expect(await lib.addSkillFolder(src, 's')).toBeNull()
  })
  it('removes an item, and refuses ids that could reach outside the store', async () => {
    const a = await lib.save({ kind: 'prompt', name: 'p', description: 'd', body: 'b' })
    await lib.remove(a.id)
    expect(await lib.get(a.id)).toBeNull()
    expect(await lib.get('../../etc/passwd')).toBeNull()
    await expect(lib.remove('../x')).rejects.toThrow()
  })
})
