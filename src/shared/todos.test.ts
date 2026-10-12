import { describe, expect, it } from 'vitest'
import { addList, addTodo, askedTodo, assignTodo, claimTodo, excerptOf, markStale, doneTodo, emptyBoard, moveTodo, needsYou, removeList, removeTodo, renameList, reopenTodo, updateTodo, type Actor, type MessageLink } from './todos'

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
