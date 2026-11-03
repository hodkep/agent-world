import { existsSync, lstatSync, mkdirSync, mkdtempSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { link, linkState, targets, unlink } from './links'

let dir: string
let lib: string
let home: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aw-links-'))
  lib = join(dir, 'library')
  home = join(dir, 'home')
  mkdirSync(join(lib, 'skills', 'pdf'), { recursive: true })
  writeFileSync(join(lib, 'skills', 'pdf', 'SKILL.md'), '---\nname: pdf\n---\nx')
  mkdirSync(join(home, '.claude'), { recursive: true })
})
afterEach(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))
const claude = () => targets(home).find((t) => t.id === 'claude')!

describe('where a skill can be linked', () => {
  it('lists the other programs by their own folders, and says which program is installed here', () => {
    mkdirSync(join(dir, 'shop'))
    const t = targets(home, join(dir, 'shop'))
    expect(t.map((x) => [x.id, x.dir, x.present])).toEqual([
      ['claude', join(home, '.claude', 'skills'), true],
      ['agy-cli', join(home, '.gemini', 'antigravity-cli', 'skills'), false],
      ['agy-app', join(home, '.gemini', 'config', 'skills'), false],
      ['project-claude', join(dir, 'shop', '.claude', 'skills'), true],
      ['project', join(dir, 'shop', '.agents', 'skills'), true]
    ])
    expect(targets(home).some((x) => x.id === 'project')).toBe(false)
  })
})

describe('linking a skill from the library', () => {
  it('makes a link to the one library copy, never a copy, and takes only that link away', () => {
    expect(linkState(lib, 'pdf', claude())).toBe('none')
    link(lib, 'pdf', claude())
    expect(linkState(lib, 'pdf', claude())).toBe('linked')
    expect(lstatSync(join(claude().dir, 'pdf')).isSymbolicLink()).toBe(true)
    expect(readlinkSync(join(claude().dir, 'pdf'))).toBe(join(lib, 'skills', 'pdf'))
    unlink(lib, 'pdf', claude())
    expect(linkState(lib, 'pdf', claude())).toBe('none')
    expect(existsSync(join(lib, 'skills', 'pdf', 'SKILL.md'))).toBe(true)
  })
  it('leaves a real folder of the same name alone, and says it is a copy', () => {
    mkdirSync(join(claude().dir, 'pdf'), { recursive: true })
    writeFileSync(join(claude().dir, 'pdf', 'SKILL.md'), 'mine')
    expect(linkState(lib, 'pdf', claude())).toBe('copy')
    expect(() => link(lib, 'pdf', claude())).toThrow(/already/)
    unlink(lib, 'pdf', claude())
    expect(existsSync(join(claude().dir, 'pdf', 'SKILL.md'))).toBe(true)
  })
  it('calls a link that leads to the skill\'s own folder linked, whoever made it: the skills CLI links the folder it installs, and switching it off takes only that link away', () => {
    // The library keeps a link to the skill's real folder; another link to the same folder is the same skill there.
    const real = join(dir, 'agents', 'skills', 'pdf')
    mkdirSync(real, { recursive: true })
    writeFileSync(join(real, 'SKILL.md'), '---\nname: pdf\n---\nx')
    rmSync(join(lib, 'skills', 'pdf'), { recursive: true })
    symlinkSync(real, join(lib, 'skills', 'pdf'), 'dir')
    mkdirSync(claude().dir, { recursive: true })
    symlinkSync(real, join(claude().dir, 'pdf'), 'dir')
    expect(linkState(lib, 'pdf', claude())).toBe('linked')
    unlink(lib, 'pdf', claude())
    expect(existsSync(join(claude().dir, 'pdf'))).toBe(false)
    expect(existsSync(join(real, 'SKILL.md'))).toBe(true)
  })
  it('leaves a link that points somewhere else alone', () => {
    mkdirSync(join(dir, 'elsewhere'))
    mkdirSync(claude().dir, { recursive: true })
    symlinkSync(join(dir, 'elsewhere'), join(claude().dir, 'pdf'))
    expect(linkState(lib, 'pdf', claude())).toBe('copy')
    unlink(lib, 'pdf', claude())
    expect(lstatSync(join(claude().dir, 'pdf')).isSymbolicLink()).toBe(true)
  })
  it('refuses a skill id that is not a plain name', () => {
    expect(() => link(lib, '../x', claude())).toThrow()
  })
})
