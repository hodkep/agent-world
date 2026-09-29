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
