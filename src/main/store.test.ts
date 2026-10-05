import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AgentRecord } from '../shared/types'
import { loadAgents, saveAgents } from './store'

let dir: string
let file: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aw-store-'))
  file = join(dir, 'nested', 'agents.json')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const ada: AgentRecord = {
  id: 'a1',
  name: 'ada',
  sessionId: '11111111-1111-1111-1111-111111111111',
  repoPath: '/r',
  cwd: '/w/ada',
  branch: 'aw/ada',
  started: true
}

describe('agent store', () => {
  it('starts empty when nothing was saved', () => {
    expect(loadAgents(file)).toEqual([])
  })

  it('round-trips agents', () => {
    saveAgents(file, [ada])
    expect(loadAgents(file)).toEqual([{ ...ada, provider: 'claude' }])
  })

  it('gives agents saved before providers existed the Claude Code provider', () => {
    saveAgents(file, [ada, { ...ada, id: 'a2', provider: 'agy' }])
    expect(loadAgents(file).map((a) => a.provider)).toEqual(['claude', 'agy'])
  })

  it('moves a corrupt file aside instead of losing it', () => {
    saveAgents(file, [ada])
    writeFileSync(file, '{not json')
    expect(loadAgents(file)).toEqual([])
    expect(existsSync(file)).toBe(false)
    expect(readdirSync(join(dir, 'nested')).some((f) => f.startsWith('agents.json.corrupt-'))).toBe(true)
  })
})
