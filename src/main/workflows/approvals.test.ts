import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Approvals } from './approvals'

const file = () => join(mkdtempSync(join(tmpdir(), 'aw-appr-')), 'workflow-approvals.json')

describe('which versions of a workflow file the person approved the commands of', () => {
  it('knows only the exact content it was approved for, and remembers across a restart', () => {
    const f = file()
    const a = new Approvals(f)
    expect(a.has('h1')).toBe(false)
    a.approve('bug-fix', 'h1', ['npm test'], 1000)
    expect(a.has('h1')).toBe(true)
    expect(a.has('h2')).toBe(false)
    expect(new Approvals(f).has('h1')).toBe(true)
  })

  it('gives the version approved before for the same workflow, to show what changed, and never another workflow\'s', () => {
    const a = new Approvals(file())
    a.approve('bug-fix', 'h1', ['npm test'], 1000)
    a.approve('bug-fix', 'h2', ['npm test', 'npm run lint'], 2000)
    a.approve('other', 'o1', ['make'], 3000)
    expect(a.previous('bug-fix', 'h3')).toEqual({ hash: 'h2', commands: ['npm test', 'npm run lint'], at: 2000 })
    expect(a.previous('bug-fix', 'h2')).toEqual({ hash: 'h1', commands: ['npm test'], at: 1000 })
    expect(a.previous('new-one', 'x')).toBeUndefined()
  })

  it('starts empty when the file is damaged, and a damaged entry is ignored', () => {
    const f = file()
    writeFileSync(f, '{ not json')
    expect(new Approvals(f).has('h1')).toBe(false)
    writeFileSync(f, JSON.stringify({ approved: { h1: 'oops', h2: { id: 'x', commands: ['a'], at: 5 } } }))
    const a = new Approvals(f)
    expect([a.has('h1'), a.has('h2')]).toEqual([false, true])
  })
})
