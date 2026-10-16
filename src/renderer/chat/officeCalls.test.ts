import { describe, expect, it } from 'vitest'
import type { Row } from './format'
import { groupOffice, officeTool, runCall, stampOf, summaryOf, whisperOf } from './officeCalls'

const call = (id: string, tool: string, input: Record<string, unknown> = {}, text?: string, isError = false): Extract<Row, { kind: 'tool' }> => ({
  kind: 'tool', id, run: { name: `mcp__agent-world__${tool}`, input, result: text === undefined ? undefined : { text, isError }, at: 1, id } as never
})

describe('which tool calls are the office keeping its books', () => {
  it('is every tool of the office server, except the ones with a card of their own and the calls that move a run', () => {
    expect(officeTool('mcp__agent-world__library_skip')).toBe('library_skip')
    expect(officeTool('mcp__agent-world__todo_done')).toBe('todo_done')
    expect(officeTool('mcp__agent-world__remember')).toBe('remember')
    expect(officeTool('mcp__agent-world__workflow_list')).toBe('workflow_list')
    expect(officeTool('mcp__agent-world__something_new')).toBe('something_new')
    for (const own of ['send_message', 'list_agents', 'spawn_subagent', 'await_subagents', 'stop_subagent']) expect(officeTool(`mcp__agent-world__${own}`)).toBeNull()
    for (const run of ['task_begin', 'task_done', 'step_done', 'plan_submit']) expect(officeTool(`mcp__agent-world__${run}`)).toBeNull()
    expect(officeTool('mcp__other__library_skip')).toBeNull()
    expect(officeTool('Bash')).toBeNull()
  })
  it('names the four calls that move a run, which the track above the chat shows instead', () => {
    for (const run of ['task_begin', 'task_done', 'step_done', 'plan_submit']) expect(runCall(`mcp__agent-world__${run}`)).toBe(true)
    expect(runCall('mcp__agent-world__todo_done')).toBe(false)
    expect(runCall('mcp__other__task_begin')).toBe(false)
  })
})

describe('calls that move a run', () => {
  it('leave the chat, since the track shows them, unless one failed: that stays a card', () => {
    const rows = [call('a', 'task_begin', { title: 'x' }, 'ok'), call('b', 'step_done', { step: 'build' }, 'ok'), call('c', 'step_done', {}, 'No task is open.', true), call('d', 'plan_submit', { path: 'p.md' }, 'ok')]
    const out = groupOffice(rows)
    expect(out.map((r) => r.kind)).toEqual(['tool'])
    expect((out[0] as { id: string }).id).toBe('c')
  })
})

describe('what one office call says as a stamp', () => {
  const stamp = (tool: string, input: Record<string, unknown> = {}, text: string | null = 'ok', working = false) => stampOf(call('a', tool, input, text ?? undefined).run, working)
  it('is a book for the library, with the id and what it was; a skip is marked as one', () => {
    expect(stamp('library_get', { id: 'tdd' }, 'a\nb\nc')).toEqual({ kind: 'library', label: 'tdd', tip: 'Read tdd · 3 lines', state: '' })
    expect(stamp('library_skip', { id: 'tdd', reason: 'no code written yet' })).toEqual({ kind: 'library', label: 'skip tdd', tip: 'Skipped tdd · no code written yet', state: 'skip' })
    expect(stamp('library_index')).toMatchObject({ kind: 'library', label: '', tip: 'Looked at the library' })
    expect(stamp('library_search', { query: 'merge' })).toMatchObject({ kind: 'library', tip: 'Searched the library · merge' })
  })
  it('is a tick box for a todo, with its number or the start of its title', () => {
    expect(stamp('todo_claim', { id: '14' })).toEqual({ kind: 'todo', label: '#14', tip: 'todo#14 · claimed', state: '' })
    expect(stamp('todo_add', { title: 'Make the calls minimal and quiet', list: 'Workflows' })).toMatchObject({ kind: 'todo', label: 'Make the call…', tip: 'Added Make the calls minimal and quiet · Workflows' })
  })
  it('is a note for what was written down or looked up', () => {
    expect(stamp('remember', { text: 'tests run with pnpm test' })).toMatchObject({ kind: 'note', label: '', tip: 'Noted tests run with pnpm test' })
    expect(stamp('recall', { query: 'how to test' })).toMatchObject({ kind: 'note', tip: 'Recalled how to test' })
  })
  it('is a flag for the builder\'s workflow tools and for any call it has no picture for', () => {
    expect(stamp('workflow_list')).toMatchObject({ kind: 'flag', tip: 'Looked at workflows' })
    expect(stamp('workflow_get', { id: 'journey' })).toMatchObject({ kind: 'flag', tip: 'Read workflow journey' })
    expect(stamp('workflow_propose', { file: '{"id":"billing-change","name":"Billing change"}' })).toMatchObject({ kind: 'plan', tip: 'Proposed billing-change' })
    expect(stamp('workflow_propose', { file: 'not json' })).toMatchObject({ kind: 'plan', tip: 'Proposed a workflow' })
    expect(stamp('something_new')).toMatchObject({ kind: 'flag', tip: 'Something new' })
  })
  it('shows a call that is still running as waiting', () => {
    expect(stamp('library_get', { id: 'tdd' }, null, true).state).toBe('wait')
    expect(stamp('library_get', { id: 'tdd' }, null, false).state).toBe('')
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
