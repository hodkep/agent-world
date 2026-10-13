import { describe, expect, it } from 'vitest'
import { addTodo, askedTodo, assignTodo, claimTodo, doneTodo, emptyBoard, reopenTodo, updateTodo, type Actor } from '../../shared/todos'
import { activityOf, actorTag, agoLabel, filterBoard, pickList, pickRange, splitList } from './todoView'

const you: Actor = { kind: 'human', name: 'you' }
const ada: Actor = { kind: 'agent', id: 'a1', name: 'ada', provider: 'claude' }
const bob: Actor = { kind: 'agent', id: 'b1', name: 'bob', provider: 'agy' }

describe('actorTag', () => {
  it('says who, and in which colour: you, Claude, agy', () => {
    expect(actorTag(you)).toEqual({ tone: 'me', label: 'you' })
    expect(actorTag(ada)).toEqual({ tone: 'cl', label: 'ada · Claude' })
    expect(actorTag(bob)).toEqual({ tone: 'ag', label: 'bob · agy' })
    expect(actorTag({ ...bob, forMain: 'ada' })).toEqual({ tone: 'ag', label: 'bob · agy', forMain: 'ada' })
  })
})

describe('agoLabel', () => {
  const now = 10_000_000
  it('reads as a person would', () => {
    expect(agoLabel(now - 20_000, now)).toBe('just now')
    expect(agoLabel(now - 12 * 60_000, now)).toBe('12m ago')
    expect(agoLabel(now - 3 * 3_600_000, now)).toBe('3h ago')
    expect(agoLabel(now - 2 * 86_400_000, now)).toBe('2d ago')
  })
})

describe('splitList', () => {
  it('puts open tasks in their order and finished ones, newest first, apart', () => {
    let b = addTodo(emptyBoard(), { title: 'first', list: 'L' }, you, 1).board
    b = addTodo(b, { title: 'second', list: 'L' }, ada, 2).board
    b = addTodo(b, { title: 'third', list: 'L' }, ada, 3).board
    b = addTodo(b, { title: 'elsewhere', list: 'M' }, ada, 4).board
    b = doneTodo(b, '1', you, '', 10)
    b = doneTodo(b, '3', ada, '', 20)
    const s = splitList(b, 'L')
    expect(s.open.map((t) => t.title)).toEqual(['second'])
    expect(s.done.map((t) => t.title)).toEqual(['third', 'first'])
  })
})

describe('filterBoard', () => {
  const board = () => {
    let b = addTodo(emptyBoard(), { title: 'Add the key', list: 'Setup', needsYou: true }, ada, 1).board
    b = addTodo(b, { title: 'Write docs', list: 'Setup' }, you, 2).board
    b = addTodo(b, { title: 'Fix the key store', list: 'Tools' }, bob, 3).board
    return b
  }
  it('keeps everything with no filter, and every list so an empty one still shows', () => {
    const f = filterBoard(board(), { who: 'all', query: '' })
    expect(f.todos.length).toBe(3)
    expect(f.lists).toEqual(['Setup', 'Tools'])
  })
  it('narrows by who made it, and by words in the title or notes, keeping lists', () => {
    const b = board()
    expect(filterBoard(b, { who: 'ada', query: '' }).todos.map((t) => t.title)).toEqual(['Add the key'])
    expect(filterBoard(b, { who: 'you', query: '' }).todos.map((t) => t.title)).toEqual(['Write docs'])
    expect(filterBoard(b, { who: 'all', query: 'key' }).todos.length).toBe(2)
    expect(filterBoard(b, { who: 'all', query: 'KEY store' }).todos.map((t) => t.title)).toEqual(['Fix the key store'])
    expect(filterBoard(b, { who: 'ada', query: 'nope' }).lists).toEqual(['Setup', 'Tools'])
  })
})

describe('activityOf, a move', () => {
  it('says who moved it and where', () => {
    let b = addTodo(emptyBoard(), { title: 'a', list: 'Inbox' }, you, 1).board
    b = updateTodo(b, '1', { list: 'Application' }, { kind: 'human', name: 'app' }, 2)
    expect(activityOf(b.todos[0]!).map((x) => x.text)).toContain('app moved it Inbox → Application')
  })
})

describe('activityOf', () => {
  it('lists what matters, oldest first, and folds plain edits into one line', () => {
    let b = addTodo(emptyBoard(), { title: 'Docs' }, ada, 1, { agentId: 'a1', itemId: 'm', at: 1, excerpt: 'x' }).board
    b = updateTodo(b, '1', { notes: 'a' }, ada, 2)
    b = updateTodo(b, '1', { notes: 'ab' }, ada, 3)
    b = updateTodo(b, '1', { notes: 'abc' }, you, 4)
    b = claimTodo(b, '1', ada, 5)
    b = doneTodo(b, '1', ada, 'Wrote it', 6)
    const a = activityOf(b.todos[0]!)
    expect(a.map((x) => x.text)).toEqual(['Made by ada from its message', 'Edited 3 times', 'Claimed by ada', 'Done by ada: Wrote it'])
    expect(a.map((x) => x.key)).toEqual([true, false, true, true])
    expect(a[1]!.at).toBe(4)
  })
  it('says plainly when the app closed a task on its own, and why, so it never reads as the agent saying it was done', () => {
    let b = addTodo(emptyBoard(), { title: 'Docs', auto: true }, you, 1).board
    b = claimTodo(b, '1', ada, 2)
    b = doneTodo(b, '1', ada, 'Closed when its turn ended', 3)
    b = { ...b, todos: b.todos.map((t) => ({ ...t, closedAtTurnEnd: true, closedBy: 'turn' as const })) }
    const a = activityOf(b.todos[0]!)
    expect(a.at(-1)).toMatchObject({ text: "Closed by Agent World when ada's turn ended, nobody said it was done", app: true })
    const stopped = { ...b.todos[0]!, closedBy: 'stopped' as const }
    expect(activityOf(stopped).at(-1)!.text).toBe('Closed by Agent World: ada had stopped, nobody said it was done')
    // an agent that did say it is done is still "Done by"
    let c = addTodo(emptyBoard(), { title: 'Docs' }, you, 1).board
    c = doneTodo(c, '1', ada, 'Wrote it', 3)
    expect(activityOf(c.todos[0]!).at(-1)).toMatchObject({ text: 'Done by ada: Wrote it' })
    expect(activityOf(c.todos[0]!).at(-1)!.app).toBeFalsy()
  })
  it('says who asked whom, who put an agent on it, and a reopen', () => {
    let b = addTodo(emptyBoard(), { title: 'Docs' }, you, 1).board
    b = askedTodo(b, '1', ada, you, 2, 'Still needed?')
    b = assignTodo(b, '1', bob, you, 3)
    b = doneTodo(b, '1', bob, '', 4)
    b = reopenTodo(b, '1', you, 5)
    expect(activityOf(b.todos[0]!).map((x) => x.text)).toEqual(['Made by you', 'you asked ada: Still needed?', 'you put bob on it', 'Done by bob', 'Reopened by you'])
  })
})

describe('picking tasks', () => {
  const order = ['1', '2', '3', '4', '5']
  it('picks the tasks between the last one clicked and this one, in either direction, and keeps what was picked before', () => {
    expect([...pickRange(order, '2', '4', new Set(['1']))].sort()).toEqual(['1', '2', '3', '4'])
    expect([...pickRange(order, '4', '2', new Set())].sort()).toEqual(['2', '3', '4'])
  })
  it('picks just this one when nothing was clicked before, or the earlier one is not on screen', () => {
    expect([...pickRange(order, undefined, '3', new Set())]).toEqual(['3'])
    expect([...pickRange(order, 'gone', '3', new Set())]).toEqual(['3'])
  })
  it('picks a whole list, or lets go of it when all of it was picked', () => {
    expect([...pickList(['1', '2', '3'], new Set(['9']))].sort()).toEqual(['1', '2', '3', '9'])
    expect([...pickList(['1', '2', '3'], new Set(['1', '2', '3', '9']))]).toEqual(['9'])
    expect([...pickList(['1', '2', '3'], new Set(['1']))].sort()).toEqual(['1', '2', '3'])
  })
})
