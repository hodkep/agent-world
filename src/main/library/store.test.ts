import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
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
  it('adds a skill folder as a link, copying nothing and writing nothing into it, and lists its files', async () => {
    const src = join(dir, 'orig', 'pdf')
    mkdirSync(join(src, 'scripts'), { recursive: true })
    writeFileSync(join(src, 'SKILL.md'), '---\nname: pdf\ndescription: Work with PDFs.\n---\n\nUse scripts/split.sh.')
    writeFileSync(join(src, 'scripts', 'split.sh'), 'echo split')
    writeFileSync(join(src, '.hidden'), 'x')
    const item = await lib.addSkillFolder(src, '~/.claude/skills', { kind: 'global' })
    expect(item).toMatchObject({ kind: 'skill', id: 'pdf', source: '~/.claude/skills', description: 'Work with PDFs.', place: { kind: 'global' } })
    expect(item!.place!.real).toBe(realpathSync(src))
    expect(item!.files).toEqual(['scripts/split.sh'])
    expect(lstatSync(item!.dir).isSymbolicLink()).toBe(true)
    expect(readFileSync(join(item!.dir, 'SKILL.md'), 'utf8')).toContain('name: pdf')
    // Nothing of ours is written into the person's folder, and the record is kept in the library.
    expect(readdirSync(src).sort()).toEqual(['.hidden', 'SKILL.md', 'scripts'])
    expect(JSON.parse(readFileSync(join(dir, 'library', 'records.json'), 'utf8')).pdf.real).toBe(realpathSync(src))
  })
  it('lists a linked skill, shows one whose folder is gone as missing, and removing a link leaves the folder', async () => {
    const src = join(dir, 'orig', 'gone')
    mkdirSync(src, { recursive: true })
    writeFileSync(join(src, 'SKILL.md'), '---\nname: gone\ndescription: d\n---\nb')
    await lib.addSkillFolder(src, 's')
    expect((await lib.list()).map((i) => i.id)).toEqual(['gone'])
    rmSync(src, { recursive: true })
    expect((await lib.list())[0]).toMatchObject({ id: 'gone', missing: true })
    await lib.remove('gone')
    expect(await lib.list()).toEqual([])
    expect(lib.records()).toEqual({})
    const back = join(dir, 'orig', 'kept')
    mkdirSync(back, { recursive: true })
    writeFileSync(join(back, 'SKILL.md'), '---\nname: kept\ndescription: d\n---\nb')
    await lib.addSkillFolder(back, 's')
    await lib.remove('kept')
    expect(existsSync(join(back, 'SKILL.md'))).toBe(true)
  })
  it('swaps a copy it holds for a link to the original only when every file of the copy is in the original with the same size, and frees the copy', async () => {
    const orig = join(dir, 'orig', 'vid')
    mkdirSync(join(orig, 'media'), { recursive: true })
    writeFileSync(join(orig, 'SKILL.md'), '---\nname: vid\ndescription: d\n---\nb')
    writeFileSync(join(orig, 'media', 'a.bin'), 'x'.repeat(100))
    writeFileSync(join(orig, 'media', 'b.bin'), 'y'.repeat(100))
    // The library holds an older, smaller copy of it.
    const copy = join(dir, 'library', 'skills', 'vid')
    mkdirSync(join(copy, 'media'), { recursive: true })
    writeFileSync(join(copy, 'SKILL.md'), '---\nname: vid\ndescription: d\n---\nb')
    writeFileSync(join(copy, 'media', 'a.bin'), 'x'.repeat(100))
    const item = await lib.useOriginal('vid', orig, { kind: 'global' })
    expect(item.place!.real).toBe(realpathSync(orig))
    expect(lstatSync(copy).isSymbolicLink()).toBe(true)
    // A copy that has something the original lacks, or a different size, is not swapped.
    const other = join(dir, 'orig', 'odd')
    mkdirSync(other, { recursive: true })
    writeFileSync(join(other, 'SKILL.md'), '---\nname: odd\ndescription: d\n---\nb')
    const odd = join(dir, 'library', 'skills', 'odd')
    mkdirSync(odd, { recursive: true })
    writeFileSync(join(odd, 'SKILL.md'), '---\nname: odd\ndescription: d\n---\nb')
    writeFileSync(join(odd, 'extra.md'), 'mine')
    await expect(lib.useOriginal('odd', other, {})).rejects.toThrow(/not in the original/)
    expect(lstatSync(odd).isSymbolicLink()).toBe(false)
    // The same size is not enough: a copy edited in place (one word changed) is kept, so the edit is not lost.
    const same = join(dir, 'orig', 'same')
    mkdirSync(same, { recursive: true })
    writeFileSync(join(same, 'SKILL.md'), '---\nname: same\ndescription: d\n---\nabc')
    const edited = join(dir, 'library', 'skills', 'same')
    mkdirSync(edited, { recursive: true })
    writeFileSync(join(edited, 'SKILL.md'), '---\nname: same\ndescription: d\n---\nxyz')
    await expect(lib.useOriginal('same', same, {})).rejects.toThrow(/not in the original/)
    expect(lstatSync(edited).isSymbolicLink()).toBe(false)
  })
  it('names the files a copy has that its original does not, and links to the original anyway, deleting the copy, when told to', async () => {
    const orig = join(dir, 'orig', 'dif')
    mkdirSync(orig, { recursive: true })
    writeFileSync(join(orig, 'SKILL.md'), '---\nname: dif\ndescription: d\n---\nabc')
    const copy = join(dir, 'library', 'skills', 'dif')
    mkdirSync(join(copy, 'sub'), { recursive: true })
    writeFileSync(join(copy, 'SKILL.md'), '---\nname: dif\ndescription: d\n---\nxyz')
    writeFileSync(join(copy, 'sub', 'mine.md'), 'mine')
    expect(await lib.originalDiff('dif', orig)).toEqual(['SKILL.md', 'sub/mine.md'])
    await expect(lib.useOriginal('dif', orig, {})).rejects.toThrow(/not in the original/)
    const item = await lib.useOriginal('dif', orig, {}, { anyway: true })
    expect(item.place!.real).toBe(realpathSync(orig))
    expect(lstatSync(copy).isSymbolicLink()).toBe(true)
    expect(existsSync(join(orig, 'sub'))).toBe(false)
    // A copy that is the same says nothing differs.
    const same = join(dir, 'orig', 'sm')
    mkdirSync(same, { recursive: true })
    writeFileSync(join(same, 'SKILL.md'), '---\nname: sm\ndescription: d\n---\nq')
    const c2 = join(dir, 'library', 'skills', 'sm')
    mkdirSync(c2, { recursive: true })
    writeFileSync(join(c2, 'SKILL.md'), '---\nname: sm\ndescription: d\n---\nq')
    expect(await lib.originalDiff('sm', same)).toEqual([])
  })
  it('does not list or read a link inside a skill', async () => {
    const src = join(dir, 'src', 'linky')
    mkdirSync(src, { recursive: true })
    writeFileSync(join(src, 'SKILL.md'), '---\nname: linky\ndescription: Has a link.\n---\nbody')
    writeFileSync(join(dir, 'secret.txt'), 'private')
    symlinkSync(join(dir, 'secret.txt'), join(src, 'secret.txt'))
    const item = await lib.addSkillFolder(src, 't')
    expect(item?.files).not.toContain('secret.txt')
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
  it('remembers which skills are off for Claude: all are on until one is switched off', async () => {
    const s = join(dir, 'src', 'pdf')
    mkdirSync(s, { recursive: true })
    writeFileSync(join(s, 'SKILL.md'), '---\nname: pdf\ndescription: d\n---\nx')
    await lib.addSkillFolder(s, 't')
    expect(lib.claudeOff().size).toBe(0)
    lib.setClaude('pdf', false)
    expect([...new Library(join(dir, 'library')).claudeOff()]).toEqual(['pdf'])
    lib.setClaude('pdf', true)
    expect(lib.claudeOff().size).toBe(0)
  })
  it('counts the tokens of each of a skill\'s other text files', async () => {
    const s = join(dir, 'src', 'docs')
    mkdirSync(join(s, 'pages'), { recursive: true })
    writeFileSync(join(s, 'SKILL.md'), '---\nname: docs\ndescription: d\n---\nx')
    writeFileSync(join(s, 'pages', 'a.md'), 'word '.repeat(40))
    await lib.addSkillFolder(s, 't')
    const item = (await lib.get('docs'))!
    expect(item.files).toEqual(['pages/a.md'])
    expect(item.fileTokens!['pages/a.md']).toBeGreaterThan(20)
  })

  describe('what reading the list of skills costs', () => {
    const skill = (id: string, extra: (d: string) => void = () => undefined) => {
      const d = join(dir, 'library', 'skills', id)
      mkdirSync(d, { recursive: true })
      writeFileSync(join(d, 'SKILL.md'), `---\nname: ${id}\ndescription: d\n---\nbody`)
      extra(d)
      return d
    }
    it('leaves out the folders a program installs (node_modules, a Python environment) and never lists more than 500 files', () => {
      skill('heavy', (d) => {
        mkdirSync(join(d, 'node_modules', 'left-pad'), { recursive: true })
        writeFileSync(join(d, 'node_modules', 'left-pad', 'index.js'), 'x')
        mkdirSync(join(d, 'video', 'node_modules', 'a'), { recursive: true })
        writeFileSync(join(d, 'video', 'node_modules', 'a', 'b.js'), 'x')
        mkdirSync(join(d, 'venv', 'lib'), { recursive: true })
        writeFileSync(join(d, 'venv', 'lib', 'c.py'), 'x')
        mkdirSync(join(d, '__pycache__'), { recursive: true })
        writeFileSync(join(d, '__pycache__', 'd.pyc'), 'x')
        writeFileSync(join(d, 'notes.md'), 'real file')
        mkdirSync(join(d, 'many'), { recursive: true })
        for (let i = 0; i < 600; i++) writeFileSync(join(d, 'many', `f${String(i).padStart(3, '0')}.md`), 'x')
      })
      const item = lib.listSync().find((i) => i.id === 'heavy')!
      expect(item.files.some((f) => /node_modules|venv|__pycache__/.test(f))).toBe(false)
      expect(item.files).toContain('notes.md')
      expect(item.files.length).toBe(500)
    })
    it('reads a skill\'s files once, and again only after the skill or its folder changed or half a minute has passed', () => {
      let now = 1_000_000
      const l = new Library(join(dir, 'library'), () => now)
      const d = skill('cached', (x) => (mkdirSync(join(x, 'sub')), writeFileSync(join(x, 'sub', 'a.md'), 'first file')))
      const files = () => l.listSync().find((i) => i.id === 'cached')!.files
      expect(files()).toEqual(['sub/a.md'])
      // A file added in a subfolder does not change the skill's own folder: it is seen when the half minute is up.
      writeFileSync(join(d, 'sub', 'b.md'), 'second file')
      now += 5_000
      expect(files()).toEqual(['sub/a.md'])
      now += 30_000
      expect(files()).toEqual(['sub/a.md', 'sub/b.md'])
      expect(l.listSync().find((i) => i.id === 'cached')!.fileTokens).toMatchObject({ 'sub/a.md': expect.any(Number), 'sub/b.md': expect.any(Number) })
      // A file added to the skill's own folder is seen at once.
      writeFileSync(join(d, 'top.md'), 'third file')
      expect(files()).toContain('top.md')
    })
  })
})
