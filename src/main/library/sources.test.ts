import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { importCandidates, scanSources } from './sources'
import { Library } from './store'

let dir: string
let home: string
let project: string
const skill = (where: string, name: string, desc = `${name} desc`) => {
  mkdirSync(where, { recursive: true })
  writeFileSync(join(where, 'SKILL.md'), `---\nname: ${name}\ndescription: ${desc}\n---\nbody of ${name}`)
}
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aw-src-'))
  home = join(dir, 'home')
  project = join(dir, 'project')
  skill(join(home, '.claude', 'skills', 'caveman'), 'caveman')
  skill(join(home, '.gemini', 'skills', 'gem'), 'gem')
  skill(join(project, '.claude', 'skills', 'local'), 'local')
  // An enabled plugin with grouped skills, and one that is not enabled.
  const on = join(dir, 'plugins', 'onplug')
  const off = join(dir, 'plugins', 'offplug')
  skill(join(on, 'skills', 'group', 'tdd'), 'tdd')
  skill(join(off, 'skills', 'nope'), 'nope')
  mkdirSync(join(home, '.claude', 'plugins'), { recursive: true })
  writeFileSync(join(home, '.claude', 'plugins', 'installed_plugins.json'), JSON.stringify({ plugins: { 'onplug@market': [{ installPath: on }], 'offplug@market': [{ installPath: off }] } }))
  writeFileSync(join(home, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins: { 'onplug@market': true, 'offplug@market': false } }))
})
afterEach(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))

describe('skills found on this computer that can be imported', () => {
  it('finds your own, the project\'s, other programs\' and those of enabled plugins, naming where each is from', async () => {
    const found = await scanSources({ home, folder: project })
    const byName = Object.fromEntries(found.map((c) => [c.name, c.source]))
    expect(byName).toEqual({ caveman: '~/.claude/skills', gem: '~/.gemini/skills', local: "this project's .claude/skills", tdd: 'Claude plugin onplug' })
    expect(found.find((c) => c.name === 'tdd')!.description).toBe('tdd desc')
  })
  it('works with no project and with nothing installed', async () => {
    expect((await scanSources({ home: join(dir, 'empty') })).length).toBe(0)
    expect((await scanSources({ home })).map((c) => c.name).sort()).toEqual(['caveman', 'gem', 'tdd'])
  })
  it('copies the chosen ones into the library, skipping what is already there, and leaves the originals', async () => {
    const lib = new Library(join(dir, 'library'))
    const found = await scanSources({ home, folder: project })
    const first = await importCandidates(lib, found.filter((c) => c.name !== 'gem'))
    expect(first.added.sort()).toEqual(['caveman', 'local', 'tdd'])
    const again = await importCandidates(lib, found)
    expect(again.added).toEqual(['gem'])
    expect(again.skipped.map((s) => s.name).sort()).toEqual(['caveman', 'local', 'tdd'])
    expect((await lib.list()).length).toBe(4)
  })
})
