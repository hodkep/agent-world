import { describe, expect, it } from 'vitest'
import { isTodoCall, parseTodoCall } from './todoCalls'

const R = (text: string) => ({ text, isError: false })

describe('isTodoCall', () => {
  it('knows the todo tools by their names, under any server prefix', () => {
    expect(isTodoCall('mcp__agent-world__todo_add')).toBe(true)
    expect(isTodoCall('todo_done')).toBe(true)
    expect(isTodoCall('mcp__agent-world__library_get')).toBe(false)
    expect(isTodoCall('todo_everything')).toBe(false)
  })
})

describe('parseTodoCall', () => {
  it('add: the title and list asked for, and the number the answer gives', () => {
    const c = parseTodoCall('mcp__agent-world__todo_add', { title: 'Write docs', list: 'Setup', needs_you: true, notes: 'n' }, R('Added todo#14 to Setup.'))
    expect(c).toEqual({ kind: 'add', title: 'Write docs', list: 'Setup', needsYou: true, notes: 'n', id: '14' })
  })
  it('add with no answer yet has no number', () => {
    expect(parseTodoCall('todo_add', { title: 'x' }, undefined)).toMatchObject({ kind: 'add', title: 'x', id: undefined })
  })
  it('list: each row with its list, title, state, who is on it and who made it', () => {
    const text = [
      'todo#12 [Manual setup] Add the key — open, needs you; created by you 2 h ago, updated 2 h ago',
      'todo#22 [Tools] Test the hold — doing, bob (agy) is on it; created by ada (claude) 4 h ago, updated 3 min ago',
      'todo#23 [Tools] Slow — thing — blocked, blocked: needs the fake; created by bob 1 days ago, updated just now'
    ].join('\n')
    const c = parseTodoCall('todo_list', {}, R(text))
    expect(c).toMatchObject({ kind: 'list', empty: false })
    if (c?.kind !== 'list') throw new Error('not a list')
    expect(c.rows.map((r) => [r.id, r.list, r.title, r.status, r.needsYou])).toEqual([
      ['12', 'Manual setup', 'Add the key', 'open', true],
      ['22', 'Tools', 'Test the hold', 'doing', false],
      ['23', 'Tools', 'Slow — thing', 'blocked', false]
    ])
    expect(c.rows[1]!.by).toBe('ada (claude)')
    expect(c.rows[1]!.on).toBe('bob')
  })
  it('list says when there is nothing', () => {
    expect(parseTodoCall('todo_list', {}, R('No open todos.'))).toMatchObject({ kind: 'list', empty: true, rows: [] })
  })
  it('search: the words asked for and each task found', () => {
    const text = 'todo#2 [Tests] Fix the flaky login test — done; created by ada 4 h ago, updated 3 min ago; done by ada\n  matches how, note: Detach the banner\ntodo#9 [Tools] Slow thing — open; created by you 2 h ago, updated 3 min ago\n  matches title: Slow thing'
    const c = parseTodoCall('mcp__agent-world__todo_search', { query: 'cookie banner' }, R(text))
    expect(c).toMatchObject({ kind: 'search', query: 'cookie banner', empty: false })
    if (c?.kind !== 'search') throw new Error('not a search')
    expect(c.rows.map((r) => [r.id, r.status])).toEqual([['2', 'done'], ['9', 'open']])
    expect(parseTodoCall('todo_search', { query: 'zebra' }, R('No todos match “zebra”.'))).toMatchObject({ kind: 'search', empty: true, rows: [] })
    expect(isTodoCall('todo_search')).toBe(true)
  })
  it('done keeps how it was done and the files named', () => {
    expect(parseTodoCall('todo_done', { id: '14', note: 'n', how: 'Like so', files: ['a.ts', 'b.ts'] }, undefined)).toEqual({ kind: 'done', id: '14', note: 'n', how: 'Like so', files: ['a.ts', 'b.ts'] })
  })
  it('claim, done and get name the task; done keeps the note', () => {
    expect(parseTodoCall('todo_claim', { id: '22' }, R('You are on todo#22: Test the hold.'))).toEqual({ kind: 'claim', id: '22' })
    expect(parseTodoCall('todo_done', { id: '14', note: 'Wrote it' }, R('Marked todo#14 done.'))).toEqual({ kind: 'done', id: '14', note: 'Wrote it', how: '', files: [] })
    expect(parseTodoCall('todo_get', { id: '3' }, undefined)).toEqual({ kind: 'get', id: '3' })
  })
  it('update: only the fields that were given, in words', () => {
    const c = parseTodoCall('todo_update', { id: '22', status: 'blocked', blocked_why: 'needs the fake', needs_you: false }, R('Updated todo#22.'))
    expect(c).toEqual({ kind: 'update', id: '22', changes: [{ label: 'Status', to: 'blocked' }, { label: 'Why', to: 'needs the fake' }, { label: 'Needs you', to: 'no' }] })
  })
  it('is null for a call that is not a todo tool', () => {
    expect(parseTodoCall('Bash', {}, undefined)).toBeNull()
  })
})
