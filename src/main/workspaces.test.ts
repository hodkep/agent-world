import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { activate, forget, loadWorkspaces, remember, resume, saveWorkspaces, workspacePaths } from './workspaces'

const empty = { active: null, recent: [] as string[] }

describe('workspaces', () => {
  it('opening a folder makes it active without adding it to the saved list', () => {
    expect(activate(empty, '/a')).toEqual({ active: '/a', recent: [] })
  })

  it('remembering puts it first, once, and caps the list', () => {
    let s = remember(empty, '/a')
    s = remember(s, '/b')
    s = remember(s, '/a')
    expect(s).toEqual({ active: '/a', recent: ['/a', '/b'] })
    for (let i = 0; i < 20; i++) s = remember(s, `/w${i}`)
    expect(s.recent).toHaveLength(12)
    expect(s.recent[0]).toBe('/w19')
  })

  it('forgetting drops it from the list and hands the active spot to the next one', () => {
    const s = forget({ active: '/a', recent: ['/a', '/b'] }, '/a')
    expect(s).toEqual({ active: '/b', recent: ['/b'] })
    expect(forget({ active: '/a', recent: ['/a'] }, '/a')).toEqual({ active: null, recent: [] })
    expect(forget({ active: '/a', recent: ['/a', '/b'] }, '/b')).toEqual({ active: '/a', recent: ['/a'] })
  })

  it('on start resumes the last active folder that still exists, else the newest saved one', () => {
    const exists = (p: string) => p !== '/gone'
    expect(resume({ active: '/a', recent: ['/b'] }, exists)).toBe('/a')
    expect(resume({ active: '/gone', recent: ['/gone', '/b'] }, exists)).toBe('/b')
    expect(resume(empty, exists)).toBeNull()
  })
})

describe('workspace file', () => {
  let dir: string
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), 'aw-ws-'))))
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('round-trips, and starts empty when the file is missing or damaged', () => {
    const file = join(dir, 'workspaces.json')
    expect(loadWorkspaces(file)).toEqual(empty)
    saveWorkspaces(file, { active: '/a', recent: ['/a'] })
    expect(loadWorkspaces(file)).toEqual({ active: '/a', recent: ['/a'] })
    writeFileSync(file, '{nope')
    expect(loadWorkspaces(file)).toEqual(empty)
  })
})

describe('the projects a menu lists', () => {
  const state = { active: '/a', recent: ['/a', '/b'] }
  it('is the saved ones and the open one, newest first', () => {
    expect(workspacePaths(state, '/c', [])).toEqual(['/a', '/b', '/c'])
  })
  it('also has every project an agent works in, so one hired before the list was kept is not lost, after the saved ones', () => {
    expect(workspacePaths(state, '/a', ['/d', '/b', '/d', '/e'])).toEqual(['/a', '/b', '/d', '/e'])
  })
  it('lists nothing twice, and nothing for an empty path', () => {
    expect(workspacePaths({ active: null, recent: [] }, undefined, ['', '/x', '/x'])).toEqual(['/x'])
  })
})
