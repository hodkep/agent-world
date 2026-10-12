import { describe, expect, it } from 'vitest'
import { searchTodos } from './todoSearch'
import { addTodo, attachWork, claimTodo, doneTodo, emptyBoard, type Actor, type TodoBoard } from './todos'

const you: Actor = { kind: 'human', name: 'you' }
const ada: Actor = { kind: 'agent', id: 'a1', name: 'ada', provider: 'claude' }

const board = (): TodoBoard => {
  let b = addTodo(emptyBoard(), { title: 'Wire the Anthropic key into Settings', list: 'Setup', notes: 'Accounts page' }, you, 1).board
  b = addTodo(b, { title: 'Fix the flaky login test', list: 'Tests' }, you, 2).board
  b = addTodo(b, { title: 'Write the changelog', list: 'Release' }, you, 3).board
  b = claimTodo(b, '2', ada, 4)
  b = doneTodo(b, '2', ada, 'Retried the cookie wait', 5, { agentId: 'a1', itemId: 'm', at: 5, excerpt: 'The Safari cookie banner raced the click' }, { how: 'Waited for the banner to detach before clicking.', files: ['e2e/login.spec.ts'] })
  b = attachWork(b, '2', { commits: [{ sha: 'abc1234', subject: 'test: wait for the cookie banner' }], files: [] })
  return b
}

describe('searchTodos', () => {
  it('finds a task by its title, and says it is open', () => {
    const r = searchTodos(board(), 'anthropic key')
    expect(r.map((x) => x.todo.id)).toEqual(['1'])
  })
  it('finds a done task by how it was done, a file, a commit, the note or the message it was finished in', () => {
    for (const q of ['banner detach', 'login.spec', 'cookie banner', 'retried', 'safari']) expect(searchTodos(board(), q).map((x) => x.todo.id), q).toContain('2')
  })
  it('ranks a title hit above a hit in notes', () => {
    let b = addTodo(emptyBoard(), { title: 'Docs', list: 'L', notes: 'mentions the migration once' }, you, 1).board
    b = addTodo(b, { title: 'Run the migration', list: 'L' }, you, 2).board
    expect(searchTodos(b, 'migration').map((x) => x.todo.id)).toEqual(['2', '1'])
  })
  it('wants every word, and falls back to half of them when none has all', () => {
    expect(searchTodos(board(), 'changelog release').map((x) => x.todo.id)).toEqual(['3'])
    expect(searchTodos(board(), 'changelog zebra').map((x) => x.todo.id)).toEqual(['3'])
    expect(searchTodos(board(), 'zebra unicorn')).toEqual([])
  })
  it('can leave out done tasks or only look in them', () => {
    expect(searchTodos(board(), 'login test', { status: 'done' }).map((x) => x.todo.id)).toEqual(['2'])
    expect(searchTodos(board(), 'login test', { status: 'open' })).toEqual([])
  })
  it('says where the words were found, and caps the answer', () => {
    const hit = searchTodos(board(), 'cookie banner')[0]!
    expect(hit.where.length).toBeGreaterThan(0)
    expect(hit.snippet).toMatch(/banner/i)
    let b = emptyBoard()
    for (let i = 0; i < 30; i++) b = addTodo(b, { title: `thing ${i}`, list: 'L' }, you, i + 1).board
    expect(searchTodos(b, 'thing', { limit: 5 })).toHaveLength(5)
  })
  it('is empty for no words', () => {
    expect(searchTodos(board(), '   ')).toEqual([])
  })
})
