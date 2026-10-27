import { describe, expect, it } from 'vitest'
import type { Row } from './format'
import { setTodoBoard } from '../todos/todoStore'
import { areasOf, groupOffice, outcomeOf, officeTool, runCall, stampOf, summaryOf, todoOf, whisperOf } from './officeCalls'

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
  it('leave the chat, since the track shows them', () => {
    expect(groupOffice([call('a', 'task_begin', { title: 'x' }, 'ok'), call('b', 'step_done', { step: 'build' }, 'ok'), call('d', 'plan_submit', { path: 'p.md' }, 'ok')])).toEqual([])
  })
  it('stay as red stamps in the fold when they failed, since the person may need to know, but not as cards', () => {
    const out = groupOffice([call('a', 'task_begin', { title: 'x' }, 'ok'), call('c', 'step_done', { step: 'build' }, 'No task is open.', true), call('d', 'plan_submit', { path: 'p.md' }, 'The plan needs fixing', true)])
    expect(out.map((r) => r.kind)).toEqual(['office'])
    expect((out[0] as { calls: { id: string }[] }).calls.map((c) => c.id)).toEqual(['c', 'd'])
  })
})

describe('what one office call says as a stamp', () => {
  const stamp = (tool: string, input: Record<string, unknown> = {}, text: string | null = 'ok', working = false, failed = false) => stampOf(call('a', tool, input, text ?? undefined, failed).run, working)
  it('is a book for the library, with the id and what it was; a skip is marked as one', () => {
    expect(stamp('library_get', { id: 'tdd' }, 'a\nb\nc')).toEqual({ kind: 'library', label: 'tdd', tip: 'Read tdd · 3 lines', state: '' })
    expect(stamp('library_skip', { id: 'tdd', reason: 'no code written yet' })).toEqual({ kind: 'library', label: 'skip tdd', tip: 'Skipped tdd · no code written yet', state: 'skip' })
    expect(stamp('library_index')).toMatchObject({ kind: 'library', label: 'library', tip: 'Looked at the library' })
    expect(stamp('library_search', { query: 'merge' })).toMatchObject({ kind: 'library', label: 'searched', tip: 'Searched the library · merge' })
  })
  it('is a tick box for a todo, with its number or the start of its title', () => {
    expect(stamp('todo_claim', { id: '14' })).toEqual({ kind: 'todo', label: '#14', tip: 'todo#14 · claimed', state: '' })
    expect(stamp('todo_add', { title: 'Make the calls minimal and quiet', list: 'Workflows' })).toMatchObject({ kind: 'todo', label: 'Make the call…', tip: 'Added Make the calls minimal and quiet · Workflows' })
  })
  it('says what a todo lookup looked at, by name, since it has no number', () => {
    expect(stamp('todo_list')).toMatchObject({ kind: 'todo', label: 'todos' })
    expect(stamp('todo_search', { query: 'merge' })).toMatchObject({ kind: 'todo', label: 'todos' })
  })
  it('is a note for what was written down or looked up', () => {
    expect(stamp('remember', { text: 'tests run with pnpm test' })).toMatchObject({ kind: 'note', label: 'noted', tip: 'Noted tests run with pnpm test' })
    expect(stamp('recall', { query: 'how to test' })).toMatchObject({ kind: 'note', label: 'recalled', tip: 'Recalled how to test' })
  })
  it('is a flag for the builder\'s workflow tools and for any call it has no picture for', () => {
    expect(stamp('workflow_list')).toMatchObject({ kind: 'flag', label: 'workflows', tip: 'Looked at workflows' })
    expect(stamp('workflow_get', { id: 'journey' })).toMatchObject({ kind: 'flag', label: 'journey', tip: 'Read workflow journey' })
    expect(stamp('workflow_history', { id: 'journey' })).toMatchObject({ kind: 'flag', label: 'journey', tip: 'Read the history of workflow journey' })
    expect(stamp('workflow_propose', { file: '{"id":"billing-change","name":"Billing change"}' })).toMatchObject({ kind: 'plan', label: 'proposed', tip: 'Proposed billing-change' })
    expect(stamp('workflow_propose', { file: 'not json' })).toMatchObject({ kind: 'plan', tip: 'Proposed a workflow' })
    expect(stamp('something_new')).toMatchObject({ kind: 'flag', label: 'Something new', tip: 'Something new' })
  })
  it('shows a failed call with a red rim, and says why in its tip', () => {
    expect(stamp('step_done', { step: 'build' }, 'No task is open.\nTry task_begin.', false, true)).toEqual({ kind: 'flag', label: 'step build', tip: 'Reported step build · failed: No task is open.', state: 'bad' })
    expect(stamp('plan_submit', { path: 'p.md' }, 'The plan needs fixing', false, true)).toMatchObject({ kind: 'plan', label: 'plan', tip: 'Sent the plan · failed: The plan needs fixing', state: 'bad' })
    expect(stamp('todo_done', { id: '9' }, 'No todo 9', false, true)).toMatchObject({ kind: 'todo', label: '#9', state: 'bad' })
    expect(stamp('task_begin', { title: 'Add wordCount' })).toMatchObject({ label: 'run', tip: 'Began run Add wordCount' })
    expect(stamp('task_done', { summary: 'x' }).label).toBe('run done')
    expect(stamp('task_done', { summary: 'wordCount added' }).tip).toBe('Finished run · wordCount added')
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
  it('folds a failed call with the rest: it is a red stamp in the line, not a card of its own', () => {
    const out = groupOffice([call('a', 'library_skip', { id: 'x', reason: 'y' }, 'ok'), call('b', 'todo_done', { id: '1' }, 'no such task', true), call('c', 'library_get', { id: 'x' }, 'ok')])
    expect(out.map((r) => r.kind)).toEqual(['office'])
    expect((out[0] as { calls: unknown[] }).calls).toHaveLength(3)
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
  it('names a run call that failed, under Workflow', () => {
    expect(summaryOf([call('a', 'step_done', { step: 'build' }, 'No task is open.', true)])).toEqual([{ area: 'Workflow', text: 'step reported · failed: No task is open.' }])
  })
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

describe('the fold as a row for each area', () => {
  it('has a row for each area in the order they first appear, each saying in words what was done there', () => {
    const calls = [call('a', 'library_skip', { id: 'tdd', reason: 'x' }, 'ok'), call('b', 'todo_claim', { id: '14' }, 'ok'), call('c', 'library_get', { id: 'house-research' }, 'a\nb\nc'), call('d', 'recall', { query: 'how to test' }, 'ok')]
    expect(areasOf(calls).map((a) => [a.area, a.text, a.calls.length])).toEqual([['Library', 'skipped tdd · read house-research', 2], ['Todos', '#14 claimed', 1], ['Notes', 'recalled · how to test', 1]])
  })
  it('keeps the workflow tools and the run calls that failed together under Workflow, apart from the todos', () => {
    const calls = [call('a', 'todo_done', { id: '9' }, 'ok'), call('b', 'step_done', { step: 'build' }, 'No task is open.', true), call('c', 'workflow_list', {}, 'ok')]
    const rows = areasOf(calls)
    expect(rows.map((a) => a.area)).toEqual(['Todos', 'Workflow'])
    expect(rows[1]!.calls.map((c) => c.id)).toEqual(['b', 'c'])
  })
  it('counts the calls that failed and says when one is still running', () => {
    const rows = areasOf([call('a', 'todo_done', { id: '9' }, 'No todo 9', true), call('b', 'todo_get', { id: '1' }, 'ok'), call('c', 'library_get', { id: 'x' })], true)
    expect(rows.map((a) => [a.area, a.bad, a.running])).toEqual([['Todos', 1, false], ['Library', 0, true]])
    expect(areasOf([call('c', 'library_get', { id: 'x' })], false)[0]!.running).toBe(false)
  })
  it('gives a call it has no area for a row of its own, named by what it is', () => {
    expect(areasOf([call('a', 'something_new', {}, 'ok')]).map((a) => [a.area, a.text])).toEqual([['Other', 'Something new']])
  })
})

describe('the tools that change how the app looks', () => {
  const stamp = (tool: string, input: Record<string, unknown> = {}, text = 'ok', isError = false) => stampOf(call('x', tool, input, text, isError).run)
  const says = (tool: string, input: Record<string, unknown> = {}, text = 'ok', isError = false) => {
    const w = whisperOf(call('x', tool, input, text, isError).run)
    return [w.kind, [w.bold, w.rest].filter(Boolean).join(' '), w.why]
  }

  it('say in plain words what the agent did, and are a group of their own, not "Other"', () => {
    expect(says('chat_mod_guide')).toEqual(['look', 'Read how to change the look', ''])
    expect(says('chat_mod_get')).toEqual(['look', 'Checked what look is in force', ''])
    expect(says('chat_mod_write', { why: 'swap the sides', css: 'a{}' })).toEqual(['look', 'Changed the look (a draft, waiting for you)', 'swap the sides'])
    expect(says('chat_mod_write', { reset: true, why: 'back to normal' })).toEqual(['look', 'Asked to restore the system look', 'back to normal'])
    expect(says('app_ui_outline')).toEqual(['look', "Looked at the app's layout", ''])
    expect(says('app_ui_outline', { selector: '.composer' })).toEqual(['look', 'Looked at the layout of .composer', ''])
    expect(says('app_ui_screenshot', {}, 'png')).toEqual(['look', 'Asked to see the window', 'you allowed it'])
    expect(says('app_ui_screenshot', {}, 'The person did not allow a picture of the window.', true)).toEqual(['look', 'Asked to see the window', 'you said no'])
  })
  it('says a refused change failed, with the reason, like any other call', () => {
    expect(says('chat_mod_write', { why: 'x' }, 'Nothing was changed. Fix this and write again: @import is not allowed.', true)[2]).toMatch(/^failed: Nothing was changed/)
  })
  it('have a stamp of their own kind', () => {
    expect(stamp('chat_mod_write')).toMatchObject({ kind: 'look', label: 'look' })
    expect(stamp('app_ui_outline')).toMatchObject({ kind: 'look', label: 'layout' })
    expect(stamp('app_ui_screenshot')).toMatchObject({ kind: 'look', label: 'window' })
  })
  it('are one row, Appearance, saying what was done there, apart from the other areas', () => {
    const calls = [call('a', 'todo_done', { id: '9' }, 'ok'), call('b', 'chat_mod_get', {}, '{}'), call('c', 'app_ui_outline', {}, 'div.app'), call('d', 'chat_mod_write', { why: 'swap the sides' }, 'ok'), call('e', 'app_ui_screenshot', {}, 'png')]
    const rows = areasOf(calls)
    expect(rows.map((r) => [r.area, r.calls.length])).toEqual([['Todos', 1], ['Appearance', 4]])
    expect(rows[1]!.text).toBe('checked the look · looked at the layout · changed the look · asked to see the window')
    expect(areasOf([call('a', 'chat_mod_write', { why: 'swap the sides' }, 'ok')])[0]!.text).toBe('changed the look · swap the sides')
  })
  it('count a refused change as failed in the row', () => {
    const r = areasOf([call('a', 'chat_mod_write', { why: 'x' }, 'Nothing was changed.', true)])[0]!
    expect([r.area, r.bad]).toEqual(['Appearance', 1])
  })
})

describe('the workflow says run where a todo says task', () => {
  it('words the calls that move a run as a run, never as a task', () => {
    const rows = areasOf([call('a', 'task_begin', { title: 'x' }, 'ok'), call('b', 'plan_submit', { path: 'p' }, 'ok'), call('c', 'step_done', { step: 'build' }, 'ok'), call('d', 'task_done', { summary: 's' }, 'ok')])
    expect(rows[0]!.text).toBe('began run · plan sent · step reported · run finished')
    expect(whisperOf(call('e', 'step_done', { step: 'build' }, 'ok').run)).toMatchObject({ bold: 'Reported step', rest: 'build' })
    expect(whisperOf(call('f', 'task_done', { summary: 's' }, 'ok').run)).toMatchObject({ bold: 'Finished run', why: 's' })
  })
})

describe('what a call brought back, shown in its opened row', () => {
  it('is the first few lines of the result, with how many more there are', () => {
    expect(outcomeOf(call('a', 'recall', { query: 'q' }, 'one\ntwo\nthree\nfour\nfive\nsix').run)).toEqual({ text: 'one\ntwo\nthree\nfour', more: 2 })
    expect(outcomeOf(call('b', 'recall', { query: 'q' }, 'Slugify drops a trailing dash.').run)).toEqual({ text: 'Slugify drops a trailing dash.', more: 0 })
  })
  it('keeps a long line short, and is nothing when there is no result or it is empty', () => {
    expect(outcomeOf(call('c', 'recall', {}, 'x'.repeat(400)).run)!.text).toHaveLength(240)
    expect(outcomeOf(call('d', 'recall', {}).run)).toBeNull()
    expect(outcomeOf(call('e', 'recall', {}, '  \n ').run)).toBeNull()
  })
  it('is nothing for a call that failed, since its reason is already in the row', () => {
    expect(outcomeOf(call('f', 'todo_done', { id: '9' }, 'No todo 9', true).run)).toBeNull()
  })
})

describe('the todo a call touched', () => {
  it('is the number the call was given for an update, a claim, a look or a finish', () => {
    for (const tool of ['todo_update', 'todo_done', 'todo_claim', 'todo_get']) expect(todoOf(call('a', tool, { id: '336' }, 'ok').run)).toBe('336')
    expect(todoOf(call('a', 'todo_done', { id: 'todo#12' }, 'ok').run)).toBe('12')
  })
  it('is the number the office gave a new task, read from what came back', () => {
    expect(todoOf(call('a', 'todo_add', { title: 'x' }, 'Added todo#336 to Chat.').run)).toBe('336')
    expect(todoOf(call('a', 'todo_add', { title: 'x' }).run)).toBeNull()
    expect(todoOf(call('a', 'todo_add', { title: 'x' }, 'No such list', true).run)).toBeNull()
  })
  it('is nothing for a call that is not about one task', () => {
    expect(todoOf(call('a', 'todo_list').run)).toBeNull()
    expect(todoOf(call('a', 'todo_search', { query: 'x' }, 'todo#1 …').run)).toBeNull()
    expect(todoOf(call('a', 'library_get', { id: 'tdd' }, 'ok').run)).toBeNull()
  })
})

describe('a part of a bigger task', () => {
  it('is said after its umbrella, so the line shows what it is part of', () => {
    setTodoBoard({ lists: ['Chat'], next: 4, todos: [{ id: '2', title: 'Umbrella', list: 'Chat', status: 'open' }, { id: '3', title: 'Part', list: 'Chat', status: 'open', parent: '2' }] } as never)
    try {
      expect(summaryOf([call('a', 'todo_update', { id: '3', title: 'x' })])).toEqual([{ area: 'Todo', text: '#2 › #3 updated · x' }])
      expect(summaryOf([call('a', 'todo_done', { id: '2', note: 'ok' }), call('b', 'todo_update', { id: '3', title: 'x' })])).toEqual([{ area: 'Todo', text: '#2 done; #2 › #3 updated' }])
    } finally {
      setTodoBoard(null)
    }
  })
})
