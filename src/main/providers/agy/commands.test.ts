import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { agyCommands } from './commands'

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'aw-agycmd-'))
})
afterEach(() => rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))
const skill = (dir: string, name: string, text: string) => {
  mkdirSync(join(dir, name), { recursive: true })
  writeFileSync(join(dir, name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${text}\n---\n`)
}

describe('what the composer offers after a slash for an agy agent', () => {
  it('is agy\'s own commands, not Claude\'s', async () => {
    const names = (await agyCommands.list(join(tmp, 'p'), join(tmp, 'h'))).map((c) => c.name)
    expect(names).toEqual(expect.arrayContaining(['context', 'rewind', 'fork', 'btw']))
    for (const claudeOnly of ['compact', 'cost', 'doctor', 'init', 'memory', 'review']) expect(names).not.toContain(claudeOnly)
  })
  it('adds the skills of the project and of your own agy folders, the project shadowing', async () => {
    skill(join(tmp, 'p', '.agents', 'skills'), 'release', 'Cut a release')
    skill(join(tmp, 'h', '.gemini', 'skills'), 'tdd', 'Test first')
    skill(join(tmp, 'h', '.gemini', 'skills'), 'release', 'shadowed')
    const list = await agyCommands.list(join(tmp, 'p'), join(tmp, 'h'))
    expect(list.find((c) => c.name === 'release')).toMatchObject({ source: 'project skill', description: 'Cut a release' })
    expect(list.find((c) => c.name === 'tdd')).toMatchObject({ source: 'your skill' })
  })
})
