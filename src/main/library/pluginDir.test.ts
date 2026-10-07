import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Library } from './store'
import { writePluginDir } from './pluginDir'

let dir: string
beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), 'aw-plug-'))))
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('the session-only plugin folder Claude loads', () => {
  it('holds just the chosen skills, with their files, and a manifest Claude can read', async () => {
    const lib = new Library(join(dir, 'library'))
    for (const n of ['one', 'two']) {
      const s = join(dir, 'src', n)
      mkdirSync(join(s, 'ref'), { recursive: true })
      writeFileSync(join(s, 'SKILL.md'), `---\nname: ${n}\ndescription: d ${n}\n---\nbody ${n}`)
      writeFileSync(join(s, 'ref', 'a.md'), 'ref')
      await lib.addSkillFolder(s, 'test')
    }
    const skills = (await lib.list()).filter((i) => i.id === 'one')
    const out = writePluginDir(join(dir, 'run'), 'agent-1', skills)!
    expect(JSON.parse(readFileSync(join(out, '.claude-plugin', 'plugin.json'), 'utf8'))).toMatchObject({ name: 'agent-world-library' })
    expect(readdirSync(join(out, 'skills'))).toEqual(['one'])
    expect(readFileSync(join(out, 'skills', 'one', 'SKILL.md'), 'utf8')).toContain('body one')
    expect(existsSync(join(out, 'skills', 'one', 'ref', 'a.md'))).toBe(true)
  })
  it('is rebuilt each time, so a skill taken off the playbook is gone, and is nothing when there are no skills', async () => {
    const lib = new Library(join(dir, 'library'))
    const s = join(dir, 'src', 'one')
    mkdirSync(s, { recursive: true })
    writeFileSync(join(s, 'SKILL.md'), '---\nname: one\ndescription: d\n---\nb')
    const item = (await lib.addSkillFolder(s, 't'))!
    const first = writePluginDir(join(dir, 'run'), 'a', [item])!
    expect(existsSync(join(first, 'skills', 'one'))).toBe(true)
    expect(writePluginDir(join(dir, 'run'), 'a', [])).toBeNull()
    expect(existsSync(first)).toBe(false)
  })
  it('refuses an agent id that could place the folder elsewhere', () => {
    expect(() => writePluginDir(join(dir, 'run'), '../escape', [])).toThrow()
  })
})
