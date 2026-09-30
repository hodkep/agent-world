import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteRole, discoverRoles, loadRoles, parseAgentFile, saveRole } from './roles'

let dir: string
beforeEach(() => (dir = mkdtempSync(join(tmpdir(), 'aw-roles-'))))
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const FILE = `---
name: db-migrator
description: Writes and checks database migrations
model: sonnet
tools: Read, Bash
---
You write SQL migrations. Always add a rollback.`

describe('Claude subagent definitions as roles', () => {
  it('reads the name, description, model and instructions from a definition', () => {
    expect(parseAgentFile(FILE, 'fallback')).toEqual({ name: 'db-migrator', description: 'Writes and checks database migrations', model: 'sonnet', body: 'You write SQL migrations. Always add a rollback.' })
  })

  it('copes with a definition that has no front matter or an unknown model', () => {
    expect(parseAgentFile('Just do it.', 'plain')).toEqual({ name: 'plain', description: '', model: undefined, body: 'Just do it.' })
    expect(parseAgentFile('---\nname: x\nmodel: inherit\n---\nbody', 'f').model).toBeUndefined()
  })

  it('finds them in the project and in the user\'s own folder, project ones first', () => {
    const project = join(dir, 'proj')
    const home = join(dir, 'home')
    mkdirSync(join(project, '.claude', 'agents'), { recursive: true })
    mkdirSync(join(home, '.claude', 'agents'), { recursive: true })
    writeFileSync(join(project, '.claude', 'agents', 'db.md'), FILE)
    writeFileSync(join(home, '.claude', 'agents', 'style.md'), '---\nname: stylist\ndescription: Formats things\n---\nBe tidy.')
    writeFileSync(join(home, '.claude', 'agents', 'notes.txt'), 'ignored')
    const roles = discoverRoles(project, home)
    expect(roles.map((r) => [r.id, r.source, r.title])).toEqual([
      ['project:db-migrator', 'project', 'db-migrator'],
      ['your:stylist', 'your', 'stylist']
    ])
    expect(roles[0]!.options).toMatchObject({ model: 'sonnet', instructions: 'You write SQL migrations. Always add a rollback.', role: 'db-migrator' })
  })

  it('finds nothing when the folders are missing', () => {
    expect(discoverRoles(join(dir, 'none'), join(dir, 'nohome'))).toEqual([])
  })
})

describe('roles the user saves', () => {
  it('round-trips, replaces one with the same title, and deletes', () => {
    const file = join(dir, 'roles.json')
    expect(loadRoles(file)).toEqual([])
    const a = saveRole(file, { title: 'Perf tuner', blurb: 'Finds slow code', options: { effort: 'high', instructions: 'Measure first.' } })
    expect(a).toMatchObject({ id: 'saved:perf-tuner', source: 'saved', options: { effort: 'high', role: 'Perf tuner' } })
    saveRole(file, { title: 'Perf tuner', blurb: 'Better', options: {} })
    expect(loadRoles(file)).toHaveLength(1)
    expect(loadRoles(file)[0]!.blurb).toBe('Better')
    deleteRole(file, 'saved:perf-tuner')
    expect(loadRoles(file)).toEqual([])
  })

  it('needs a title', () => {
    expect(() => saveRole(join(dir, 'r.json'), { title: '  ', blurb: '', options: {} })).toThrow(/name/i)
  })
})
