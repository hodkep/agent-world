import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { commandLine, listCommands } from './commands'

let tmp: string
let project: string
let home: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'aw-cmd-'))
  project = join(tmp, 'project')
  home = join(tmp, 'home')
  const put = (path: string, text: string) => {
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, text)
  }
  put(join(project, '.claude', 'skills', 'release', 'SKILL.md'), '---\nname: release\ndescription: Cut a release and tag it\n---\n# Release')
  put(join(project, '.claude', 'commands', 'lint.md'), '---\ndescription: Run the linter and fix issues\n---\nRun lint')
  put(join(project, '.claude', 'commands', 'db', 'migrate.md'), 'Apply pending database migrations\n\nsteps...')
  put(join(home, '.claude', 'skills', 'tdd', 'SKILL.md'), '---\nname: tdd\ndescription: "Test-driven development loop"\n---\n')
  put(join(home, '.claude', 'commands', 'lint.md'), '---\ndescription: user-level lint (shadowed)\n---\n')
})
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

describe('command palette sources', () => {
  it('lists built-ins, project and user skills and commands, with descriptions', async () => {
    const list = await listCommands(project, home)
    const byName = Object.fromEntries(list.map((c) => [c.name, c]))
    expect(byName.compact).toMatchObject({ source: 'built-in' })
    expect(byName.clear).toMatchObject({ source: 'built-in' })
    expect(byName.release).toMatchObject({ source: 'project skill', description: 'Cut a release and tag it' })
    expect(byName.tdd).toMatchObject({ source: 'your skill', description: 'Test-driven development loop' })
    expect(byName['db:migrate']).toMatchObject({ source: 'project command', description: 'Apply pending database migrations' })
  })

  it('a project command shadows a user command with the same name', async () => {
    const lint = (await listCommands(project, home)).filter((c) => c.name === 'lint')
    expect(lint).toEqual([expect.objectContaining({ source: 'project command', description: 'Run the linter and fix issues' })])
  })

  it('lists skills and commands of enabled plugins, namespaced by plugin name', async () => {
    const put = (path: string, text: string) => {
      mkdirSync(join(path, '..'), { recursive: true })
      writeFileSync(path, text)
    }
    const on = join(tmp, 'cache', 'on')
    const off = join(tmp, 'cache', 'off')
    put(join(on, 'skills', 'ux-copy', 'SKILL.md'), '---\nname: ux-copy\ndescription: Write microcopy\n---\n')
    put(join(on, 'commands', 'debug.md'), '---\ndescription: Structured debugging\n---\n')
    put(join(off, 'skills', 'hidden', 'SKILL.md'), '---\nname: hidden\ndescription: Disabled plugin skill\n---\n')
    put(
      join(home, '.claude', 'plugins', 'installed_plugins.json'),
      JSON.stringify({ plugins: { 'design@mk': [{ installPath: on }], 'gone@mk': [{ installPath: off }] } })
    )
    put(join(home, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins: { 'design@mk': true, 'gone@mk': false } }))
    const byName = Object.fromEntries((await listCommands(project, home)).map((c) => [c.name, c]))
    expect(byName['design:ux-copy']).toMatchObject({ source: 'plugin skill', description: 'Write microcopy' })
    expect(byName['design:debug']).toMatchObject({ source: 'plugin command', description: 'Structured debugging' })
    expect(byName['gone:hidden']).toBeUndefined()
  })

  it('finds a plugin\'s grouped skills, whether its manifest lists them or not', async () => {
    const put = (path: string, text: string) => {
      mkdirSync(join(path, '..'), { recursive: true })
      writeFileSync(path, text)
    }
    const listed = join(tmp, 'cache', 'listed')
    const grouped = join(tmp, 'cache', 'grouped')
    // Listed by the manifest, in groups (skills/engineering/tdd), with one skill on disk the manifest leaves out.
    put(join(listed, '.claude-plugin', 'plugin.json'), JSON.stringify({ skills: ['./skills/engineering/tdd', './skills/productivity'] }))
    put(join(listed, 'skills', 'engineering', 'tdd', 'SKILL.md'), '---\nname: tdd\ndescription: Test first\n---\n')
    put(join(listed, 'skills', 'productivity', 'grill-me', 'SKILL.md'), '---\nname: grill-me\ndescription: Ask hard questions\n---\n')
    put(join(listed, 'skills', 'productivity', 'wait-what', 'SKILL.md'), '---\nname: wait-what\ndescription: Slow down\n---\n')
    put(join(listed, 'skills', 'misc', 'left-out', 'SKILL.md'), '---\nname: left-out\ndescription: Not in the manifest\n---\n')
    // No manifest: skills/ is searched, however deep the groups go.
    put(join(grouped, 'skills', 'a', 'b', 'deep', 'SKILL.md'), '---\nname: deep\ndescription: Two groups down\n---\n')
    // A manifest path that points outside the plugin is ignored.
    put(join(tmp, 'cache', 'outside', 'SKILL.md'), '---\nname: escaped\ndescription: Outside\n---\n')
    put(join(grouped, '.claude-plugin', 'plugin.json'), JSON.stringify({ skills: '../outside' }))
    put(join(home, '.claude', 'plugins', 'installed_plugins.json'), JSON.stringify({ plugins: { 'matt@mk': [{ installPath: listed }], 'nest@mk': [{ installPath: grouped }] } }))
    put(join(home, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins: { 'matt@mk': true, 'nest@mk': true } }))
    const names = (await listCommands(project, home)).filter((c) => c.source === 'plugin skill').map((c) => c.name)
    expect(names).toEqual(expect.arrayContaining(['matt:tdd', 'matt:grill-me', 'matt:wait-what']))
    expect(names).not.toContain('matt:left-out')
    expect(names).not.toContain('nest:escaped')
    // With the bad manifest entry dropped it falls back to the default folder.
    expect(names).toContain('nest:deep')
  })

  it('does not dig for your own and a project\'s skills: they sit directly in the folder', async () => {
    mkdirSync(join(home, '.claude', 'skills', 'group', 'inner'), { recursive: true })
    writeFileSync(join(home, '.claude', 'skills', 'group', 'inner', 'SKILL.md'), '---\nname: inner\ndescription: Too deep\n---\n')
    expect((await listCommands(project, home)).some((c) => c.name === 'inner')).toBe(false)
  })

  it('copes with folders that do not exist', async () => {
    expect((await listCommands(join(tmp, 'nope'), join(tmp, 'nohome'))).every((c) => c.source === 'built-in')).toBe(true)
  })
})

describe('typing a command', () => {
  it('becomes one line, with arguments stripped of control characters', () => {
    expect(commandLine('compact', '')).toBe('/compact')
    expect(commandLine('db:migrate', 'staging\r/exit\x1b[201~')).toBe('/db:migrate staging /exit')
  })

  it('refuses names that are not plain command names', () => {
    expect(() => commandLine('../evil', '')).toThrow()
    expect(() => commandLine('a b', '')).toThrow()
  })
})
