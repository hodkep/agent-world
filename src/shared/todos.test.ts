import { describe, expect, it } from 'vitest'
import { INBOX, MAX_LISTS, currentTodoOf, isGenericList, resolveList, addList, addTodo, askedTodo, assignTodo, attachWork, claimTodo, excerptOf, knowledgeLine, markStale, doneTodo, emptyBoard, moveTodo, needsYou, removeList, removeTodo, renameList, reopenTodo, updateTodo, type Actor, type MessageLink } from './todos'

const you: Actor = { kind: 'human', name: 'you' }
const ada: Actor = { kind: 'agent', id: 'a1', name: 'ada', provider: 'claude' }
const link: MessageLink = { agentId: 'a1', itemId: 'm9', at: 500, excerpt: 'Done: the key field is in Settings' }

describe('lists', () => {
  it('adds, renames and removes lists, keeping todos with their list', () => {
    let b = addList(addList(emptyBoard(), 'Manual setup'), 'Tools')
    b = addList(b, 'Tools')
    expect(b.lists).toEqual(['Manual setup', 'Tools'])
    b = addTodo(b, { title: 'a', list: 'Tools' }, you, 1).board
    b = renameList(b, 'Tools', 'Dev')
    expect(b.lists).toEqual(['Manual setup', 'Dev'])
    expect(b.todos[0]!.list).toBe('Dev')
    expect(removeList(b, 'Dev').todos).toEqual([])
    expect(removeList(b, 'Dev').lists).toEqual(['Manual setup'])
  })
  it('refuses a rename onto an existing list', () => {
    const b = addList(addList(emptyBoard(), 'A'), 'B')
    expect(() => renameList(b, 'A', 'B')).toThrow(/already/)
  })
})

describe('adding', () => {
  it('records who made it and when, with the message it was made in, and makes a list an agent names', () => {
    const { board, todo } = addTodo(emptyBoard(), { title: ' Add the key ', list: 'Manual setup', needsYou: true }, ada, 100, link)
    expect(board.lists).toEqual(['Manual setup'])
    expect(todo).toMatchObject({ id: '1', title: 'Add the key', list: 'Manual setup', status: 'open', needsYou: true, createdAt: 100, createdBy: ada, updatedAt: 100, updatedBy: ada, createdLink: link })
    expect(todo.history).toEqual([{ at: 100, by: ada, what: 'created', link }])
  })
  it('puts a task with no list in the first one, or in "To do" when there is none, and numbers them on', () => {
    const first = addTodo(emptyBoard(), { title: 'x' }, you, 1)
    expect(first.todo.list).toBe('To do')
    const second = addTodo(first.board, { title: 'y' }, you, 2)
    expect(second.todo).toMatchObject({ id: '2', list: 'To do' })
  })
  it('refuses an empty title and trims a long one', () => {
    expect(() => addTodo(emptyBoard(), { title: '  ' }, you, 1)).toThrow(/title/)
    expect(addTodo(emptyBoard(), { title: 'x'.repeat(500) }, you, 1).todo.title.length).toBe(200)
  })
})

describe('changing', () => {
  const start = () => addTodo(emptyBoard(), { title: 'Key', list: 'Setup' }, you, 1).board
  it('updates fields and records who and when', () => {
    const b = updateTodo(start(), '1', { notes: 'steps', needsYou: true, title: 'Add key' }, ada, 5)
    expect(b.todos[0]).toMatchObject({ title: 'Add key', notes: 'steps', needsYou: true, updatedAt: 5, updatedBy: ada })
    expect(b.todos[0]!.history.at(-1)).toMatchObject({ what: 'updated', by: ada, at: 5 })
  })
  it('claims for an agent, and a blocked status keeps its reason', () => {
    let b = claimTodo(start(), '1', ada, 3)
    expect(b.todos[0]).toMatchObject({ status: 'doing', claimedBy: ada })
    b = updateTodo(b, '1', { status: 'blocked', blockedWhy: 'needs the key' }, ada, 4)
    expect(b.todos[0]).toMatchObject({ status: 'blocked', blockedWhy: 'needs the key' })
    b = updateTodo(b, '1', { status: 'open' }, ada, 5)
    expect(b.todos[0]!.blockedWhy).toBeUndefined()
  })
  it('does not let a second agent claim what another is doing', () => {
    const b = claimTodo(start(), '1', ada, 3)
    expect(() => claimTodo(b, '1', { kind: 'agent', id: 'b1', name: 'bob', provider: 'agy' }, 4)).toThrow(/ada/)
  })
  it('marks done with who, a note and the message, and reopens', () => {
    let b = doneTodo(start(), '1', ada, 'Key added', 9, link)
    expect(b.todos[0]).toMatchObject({ status: 'done', doneBy: ada, doneAt: 9, doneNote: 'Key added', doneLink: link })
    expect(b.todos[0]!.claimedBy).toBeUndefined()
    expect(b.todos[0]!.history.at(-1)).toMatchObject({ what: 'done', by: ada, note: 'Key added', link })
    b = reopenTodo(b, '1', you, 10)
    expect(b.todos[0]).toMatchObject({ status: 'open' })
    expect(b.todos[0]!.doneBy).toBeUndefined()
    expect(b.todos[0]!.doneLink).toBeUndefined()
  })
  it('moves a task to another list, at a place', () => {
    let b = addTodo(addList(start(), 'Tools'), { title: 'Second', list: 'Setup' }, you, 2).board
    b = addTodo(b, { title: 'Tool', list: 'Tools' }, you, 3).board
    b = moveTodo(b, '3', 'Setup', 1, you, 4)
    expect(b.todos.filter((t) => t.list === 'Setup').sort((x, y) => x.order - y.order).map((t) => t.title)).toEqual(['Key', 'Tool', 'Second'])
  })
  it('says what is not found', () => {
    expect(() => doneTodo(start(), '99', ada, '', 1)).toThrow(/99/)
  })
})

describe('what was done and how', () => {
  const start = () => claimTodo(addTodo(emptyBoard(), { title: 'Wire the key', list: 'L' }, you, 1).board, '1', ada, 2)
  it('keeps how it was done and the files the agent named', () => {
    const b = doneTodo(start(), '1', ada, 'Key wired', 9, link, { how: 'Read it from Settings → Accounts and passed it to the client.', files: ['src/a.ts', 'src/a.ts', ' src/b.ts '] })
    expect(b.todos[0]).toMatchObject({ doneNote: 'Key wired', doneHow: 'Read it from Settings → Accounts and passed it to the client.', doneFiles: ['src/a.ts', 'src/b.ts'] })
  })
  it('attaches the commits and files git shows, without counting as an edit, and merges files with the agent\'s', () => {
    let b = doneTodo(start(), '1', ada, '', 9, undefined, { files: ['src/a.ts'] })
    const edits = b.todos[0]!.history.length
    b = attachWork(b, '1', { commits: [{ sha: 'abc1234', subject: 'fix: wire the key' }], files: ['src/a.ts', 'src/c.ts'] })
    expect(b.todos[0]).toMatchObject({ doneCommits: [{ sha: 'abc1234', subject: 'fix: wire the key' }], doneFiles: ['src/a.ts', 'src/c.ts'] })
    expect(b.todos[0]!.history).toHaveLength(edits)
  })
  it('caps the commits and files kept', () => {
    const commits = Array.from({ length: 30 }, (_, i) => ({ sha: `s${i}`, subject: 'c' }))
    const files = Array.from({ length: 80 }, (_, i) => `f${i}`)
    const b = attachWork(doneTodo(start(), '1', ada, '', 9), '1', { commits, files })
    expect(b.todos[0]!.doneCommits).toHaveLength(10)
    expect(b.todos[0]!.doneFiles).toHaveLength(30)
  })
  it('writes a line fit for the shared memory: who, what, how, files and commits', () => {
    const b = attachWork(doneTodo(start(), '1', ada, 'Key wired', Date.UTC(2026, 9, 12), undefined, { how: 'Passed it to the client.', files: ['src/a.ts'] }), '1', { commits: [{ sha: 'abc1234', subject: 'fix: wire the key' }], files: [] })
    const line = knowledgeLine(b.todos[0]!)
    expect(line).toContain('todo#1')
    expect(line).toContain('Wire the key')
    expect(line).toContain('ada')
    expect(line).toContain('Key wired')
    expect(line).toContain('Passed it to the client.')
    expect(line).toContain('src/a.ts')
    expect(line).toContain('abc1234 fix: wire the key')
    expect(line).toContain('2026-10-12')
  })
  it('has no line for a task with nothing to say about how it was done', () => {
    expect(knowledgeLine(doneTodo(start(), '1', ada, '', 9).todos[0]!)).toBe('')
  })
})

describe('asking an agent', () => {
  const start = () => addTodo(emptyBoard(), { title: 'Docs', list: 'L' }, you, 1).board
  it('assigns a task to an agent on the person\'s say-so: the agent is on it, the history says who asked', () => {
    const b = assignTodo(start(), '1', ada, you, 5)
    expect(b.todos[0]).toMatchObject({ status: 'doing', claimedBy: ada, updatedBy: you })
    expect(b.todos[0]!.history.at(-1)).toMatchObject({ what: 'assigned', by: you, note: 'ada' })
  })
  it('does not take a task another agent is doing', () => {
    const b = claimTodo(start(), '1', ada, 2)
    expect(() => assignTodo(b, '1', { kind: 'agent', id: 'b1', name: 'bob', provider: 'agy' }, you, 3)).toThrow(/ada is already doing/)
  })
  it('records a question put to an agent without changing the task', () => {
    const b = askedTodo(start(), '1', ada, you, 7, 'Is this still needed?')
    expect(b.todos[0]).toMatchObject({ status: 'open', updatedAt: 7 })
    expect(b.todos[0]!.history.at(-1)).toMatchObject({ what: 'asked', by: you, note: 'ada: Is this still needed?' })
  })
})

describe('excerptOf', () => {
  it('keeps the markdown as written and trims the ends', () => {
    expect(excerptOf('  | a | b |\n|---|---|\n| 1 | 2 |  ')).toBe('| a | b |\n|---|---|\n| 1 | 2 |')
  })
  it('cuts a long text at a line, never in the middle of one, and says it was cut', () => {
    const text = Array.from({ length: 100 }, (_, i) => `line ${i} of the message`).join('\n')
    const out = excerptOf(text, 120)
    expect(out.length).toBeLessThanOrEqual(125)
    expect(out.endsWith('\n…')).toBe(true)
    expect(out.split('\n').slice(0, -1).every((l) => /^line \d+ of the message$/.test(l))).toBe(true)
  })
  it('cuts one very long line where it must', () => {
    expect(excerptOf('x'.repeat(2000), 100)).toBe(`${'x'.repeat(100)}…`)
  })
})

describe('tracked requests', () => {
  it('marks a task the app made for a request, claimed by the agent, and flags it when the turn ends unfinished', () => {
    let b = addTodo(emptyBoard(), { title: 'Fix login', list: 'Requests', auto: true }, you, 1).board
    b = claimTodo(b, '1', ada, 2)
    expect(b.todos[0]).toMatchObject({ auto: true, status: 'doing' })
    b = markStale(b, 'a1', 9)
    expect(b.todos[0]!.stale).toBe(true)
    b = updateTodo(b, '1', { notes: 'still on it' }, ada, 10)
    expect(b.todos[0]!.stale).toBeUndefined()
  })
  it('leaves finished tasks, other agents\' tasks and tasks made by hand alone', () => {
    let b = addTodo(emptyBoard(), { title: 'a', auto: true }, you, 1).board
    b = claimTodo(b, '1', ada, 2)
    b = doneTodo(b, '1', ada, '', 3)
    b = addTodo(b, { title: 'b' }, you, 4).board
    b = claimTodo(b, '2', ada, 5)
    b = addTodo(b, { title: 'c', auto: true }, you, 6).board
    b = claimTodo(b, '3', { kind: 'agent', id: 'b1', name: 'bob' }, 7)
    expect(markStale(b, 'a1', 9).todos.map((t) => !!t.stale)).toEqual([false, false, false])
  })
})

describe('removing', () => {
  it('drops a task and says when it is not there', () => {
    const b = addTodo(emptyBoard(), { title: 'a' }, you, 1).board
    expect(removeTodo(b, '1').todos).toEqual([])
    expect(() => removeTodo(b, '5')).toThrow(/No todo 5/)
  })
})

describe('needsYou', () => {
  it('counts the open ones flagged for the person', () => {
    let b = addTodo(emptyBoard(), { title: 'a', needsYou: true }, ada, 1).board
    b = addTodo(b, { title: 'b', needsYou: true }, ada, 2).board
    b = addTodo(b, { title: 'c' }, ada, 3).board
    expect(needsYou(b)).toBe(2)
    expect(needsYou(doneTodo(b, '1', you, '', 4))).toBe(1)
  })
})

describe('resolveList', () => {
  const lists = ['Application', 'Canvas', 'Library & playbooks', 'Release']
  it('finds an existing list however it is written', () => {
    expect(resolveList(lists, 'application')).toBe('Application')
    expect(resolveList(lists, '  CANVAS ')).toBe('Canvas')
    expect(resolveList(lists, 'Canvases')).toBe('Canvas')
    expect(resolveList(lists, 'library')).toBe('Library & playbooks')
    expect(resolveList(lists, 'Playbook')).toBe('Library & playbooks')
    expect(resolveList(lists, 'Releases')).toBe('Release')
  })
  it('keeps a new name when nothing existing is close', () => {
    expect(resolveList(lists, 'Terminal')).toBe('Terminal')
    expect(resolveList([], 'Terminal')).toBe('Terminal')
  })
  it('does not call two different areas the same because they share a common word', () => {
    expect(resolveList(['Agent chat'], 'Agent canvas')).toBe('Agent canvas')
  })
  it('knows the lists that say nothing about an area', () => {
    for (const n of ['Requests', 'misc', 'Other', 'General', 'To do', 'Tasks', 'stuff', 'Todo', 'Backlog']) expect(isGenericList(n), n).toBe(true)
    expect(isGenericList('Canvas')).toBe(false)
    expect(isGenericList(INBOX)).toBe(false)
    expect(MAX_LISTS).toBeGreaterThanOrEqual(6)
  })
})

describe('a task that has been named', () => {
  it('is marked named once its title or list is set, and not by editing its notes', () => {
    let b = addTodo(emptyBoard(), { title: 'raw words', list: INBOX, auto: true }, you, 1).board
    b = updateTodo(b, '1', { notes: 'steps' }, ada, 2)
    expect(b.todos[0]!.named).toBeUndefined()
    b = updateTodo(b, '1', { title: 'Wire the key' }, ada, 3)
    expect(b.todos[0]!.named).toBe(true)
    let c = addTodo(emptyBoard(), { title: 'x', list: INBOX }, you, 1).board
    c = updateTodo(c, '1', { list: 'Application' }, ada, 2)
    expect(c.todos[0]!.named).toBe(true)
  })
})

describe('moving a task by list name through an update', () => {
  it('updateTodo can put a task in another list, making it if needed, and records it', () => {
    let b = addTodo(emptyBoard(), { title: 'Wire it', list: INBOX }, you, 1).board
    b = updateTodo(b, '1', { list: 'Application', title: 'Wire the Anthropic key' }, ada, 2)
    expect(b.lists).toContain('Application')
    expect(b.todos[0]).toMatchObject({ list: 'Application', title: 'Wire the Anthropic key' })
    expect(b.todos[0]!.history.at(-1)).toMatchObject({ what: 'moved', note: 'Inbox → Application' })
  })
})

describe('the task an agent is on', () => {
  const tasks = () => {
    let b = emptyBoard()
    b = claimTodo(addTodo(b, { title: 'older', list: INBOX }, you, 100).board, '1', ada, 110)
    b = claimTodo(addTodo(b, { title: 'newer', list: INBOX }, you, 200).board, '2', ada, 210)
    return b
  }
  it('is the one it claimed last that it has not finished', () => {
    expect(currentTodoOf(tasks(), 'a1')!.id).toBe('2')
    expect(currentTodoOf(doneTodo(tasks(), '2', ada, 'ok', 300), 'a1')!.id).toBe('1')
  })
  it('is nothing for an agent that is on none, or another agent\'s task', () => {
    expect(currentTodoOf(tasks(), 'someone-else')).toBeUndefined()
    expect(currentTodoOf(addTodo(emptyBoard(), { title: 'open', list: INBOX }, you, 1).board, 'a1')).toBeUndefined()
  })
})
