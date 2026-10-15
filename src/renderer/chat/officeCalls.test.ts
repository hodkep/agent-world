import { describe, expect, it } from 'vitest'
import type { Row } from './format'
import { groupOffice, officeTool, summaryOf, whisperOf } from './officeCalls'

const call = (id: string, tool: string, input: Record<string, unknown> = {}, text?: string, isError = false): Extract<Row, { kind: 'tool' }> => ({
  kind: 'tool', id, run: { name: `mcp__agent-world__${tool}`, input, result: text === undefined ? undefined : { text, isError }, at: 1, id } as never
})

describe('which tool calls are the office keeping its books', () => {
  it('names the office\'s library, todo and notes tools, and no other call', () => {
    expect(officeTool('mcp__agent-world__library_skip')).toBe('library_skip')
    expect(officeTool('mcp__agent-world__todo_done')).toBe('todo_done')
    expect(officeTool('mcp__agent-world__remember')).toBe('remember')
    expect(officeTool('mcp__agent-world__send_message')).toBeNull()
    expect(officeTool('mcp__agent-world__spawn_subagent')).toBeNull()
    expect(officeTool('mcp__other__library_skip')).toBeNull()
    expect(officeTool('Bash')).toBeNull()
  })
})

describe('calls in a row become one line', () => {
  const user: Row = { kind: 'user', id: 'u', text: 'hi' } as never
  it('folds runs of office calls, even a single one, and leaves every other row alone', () => {
    const rows = [user, call('a', 'library_skip', { id: 'tdd', reason: 'x' }, 'ok'), call('b', 'todo_update', { id: '95' }, 'ok'), { kind: 'note', id: 'n', text: 'x' } as never, call('c', 'library_get', { id: 'tdd' }, 'ok'), call('d', 'send_message', {}, 'ok')]
    const out = groupOffice(rows)
    expect(out.map((r) => r.kind)).toEqual(['user', 'office', 'note', 'office', 'tool'])
    expect((out[1] as { calls: unknown[] }).calls).toHaveLength(2)
    expect((out[1] as { id: string }).id).toBe('a')
  })
  it('keeps a failed call out of the fold so it stays loud', () => {
    const out = groupOffice([call('a', 'library_skip', { id: 'x', reason: 'y' }, 'ok'), call('b', 'todo_done', { id: '1' }, 'no such task', true), call('c', 'library_get', { id: 'x' }, 'ok')])
    expect(out.map((r) => r.kind)).toEqual(['office', 'tool', 'office'])
  })
})

describe('what each call says', () => {
  it('keeps the reason of a skip, the title of a task, and the size of what was read', () => {
    expect(whisperOf(call('a', 'library_skip', { id: 'tdd', reason: 'no code written yet' }, 'ok').run)).toMatchObject({ kind: 'skip', bold: 'Skipped', rest: 'tdd', why: 'no code written yet' })
    expect(whisperOf(call('b', 'library_get', { id: 'tdd' }, 'a\nb\nc').run)).toMatchObject({ kind: 'read', bold: 'Read', rest: 'tdd', why: '3 lines' })
    expect(whisperOf(call('c', 'todo_update', { id: '95', title: 'Make the calls minimal' }, 'ok').run)).toMatchObject({ kind: 'todo', bold: 'todo#95', why: 'Make the calls minimal' })
    expect(whisperOf(call('d', 'todo_done', { id: '95', note: 'folded' }, 'ok').run)).toMatchObject({ kind: 'todo', bold: 'todo#95', why: 'done · folded' })
    expect(whisperOf(call('e', 'remember', { text: 'tests run with pnpm test' }, 'ok').run)).toMatchObject({ kind: 'note', bold: 'Noted' })
  })
})

describe('the one line over a run of calls', () => {
  it('counts skips, names what was read, and says what happened to each task', () => {
    const calls = [call('a', 'library_skip', { id: 'tdd', reason: 'x' }, 'ok'), call('b', 'library_skip', { id: 'code-review', reason: 'y' }, 'ok'), call('c', 'library_get', { id: 'tdd' }, 'ok'), call('d', 'todo_update', { id: '95', title: 't' }, 'ok'), call('e', 'todo_done', { id: '95' }, 'ok')]
    expect(summaryOf(calls)).toEqual([{ area: 'Library', text: 'skipped 2 · read tdd' }, { area: 'Todo', text: '#95 updated, done' }])
  })
  it('says the single call in full, with its reason', () => {
    expect(summaryOf([call('a', 'library_skip', { id: 'tdd', reason: 'no code written yet' }, 'ok')])).toEqual([{ area: 'Library', text: 'skipped tdd · no code written yet' }])
  })
  it('names up to two things read, then counts them, and keeps notes and several tasks apart', () => {
    expect(summaryOf([call('a', 'library_get', { id: 'a' }), call('b', 'library_get', { id: 'b' }), call('c', 'library_get', { id: 'c' })])).toEqual([{ area: 'Library', text: 'read 3' }])
    expect(summaryOf([call('a', 'todo_update', { id: '1', title: 'x' }), call('b', 'todo_update', { id: '2', title: 'y' }), call('c', 'remember', { text: 'z' }), call('d', 'recall', { query: 'q' })]))
      .toEqual([{ area: 'Todo', text: '#1 updated; #2 updated' }, { area: 'Notes', text: 'noted · recalled' }])
  })
})
