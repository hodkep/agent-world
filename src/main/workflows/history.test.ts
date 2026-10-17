import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HISTORY_MAX, WorkflowHistory, historyKey } from './history'

const entry = (at: number, summary = 'added Lint') => ({ at, how: 'replace' as const, by: 'you', summary })

describe('where a workflow\'s changes are kept', () => {
  it('names one file for a workflow of the project, apart from a project that has the same id elsewhere and from one kept for everything', () => {
    expect(historyKey('/work/shop', 'project', 'bug-fix')).toBe(historyKey('/work/shop', 'project', 'bug-fix'))
    expect(historyKey('/work/shop', 'project', 'bug-fix')).not.toBe(historyKey('/other/shop', 'project', 'bug-fix'))
    expect(historyKey('/work/shop', 'project', 'bug-fix')).not.toBe(historyKey('/work/shop', 'global', 'bug-fix'))
    expect(historyKey(null, 'global', 'bug-fix')).toBe(historyKey('/work/shop', 'global', 'bug-fix'))
    expect(historyKey('/work/shop', 'project', 'bug-fix')).toMatch(/^[a-z0-9-_]+$/)
  })
})

describe('the changes made to a workflow', () => {
  const make = () => new WorkflowHistory(join(mkdtempSync(join(tmpdir(), 'aw-wfhist-')), 'history'))

  it('are listed newest first, each with when, how, who and what changed, and nothing for a workflow with none', () => {
    const h = make()
    expect(h.list('k')).toEqual([])
    h.add('k', entry(100, 'created with 3 steps'))
    h.add('k', entry(200))
    expect(h.list('k').map((e) => [e.at, e.summary])).toEqual([[200, 'added Lint'], [100, 'created with 3 steps']])
    expect(h.list('other')).toEqual([])
  })

  it('survive a restart, keep the latest hundred, and a damaged file means no history', () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'aw-wfhist-')), 'history')
    const a = new WorkflowHistory(dir)
    for (let i = 0; i < HISTORY_MAX + 5; i++) a.add('k', entry(i))
    const again = new WorkflowHistory(dir).list('k')
    expect(again).toHaveLength(HISTORY_MAX)
    expect(again[0]!.at).toBe(HISTORY_MAX + 4)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'broken.json'), '{ nope')
    expect(new WorkflowHistory(dir).list('broken')).toEqual([])
  })
})
