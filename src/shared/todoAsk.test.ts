import { describe, expect, it } from 'vitest'
import { addTodo, emptyBoard, type Actor } from './todos'
import { askMessage } from './todoAsk'

const you: Actor = { kind: 'human', name: 'you' }
const ada: Actor = { kind: 'agent', id: 'a1', name: 'ada', provider: 'claude' }
const todo = () => addTodo(emptyBoard(), { title: 'Write the docs page', list: 'Manual setup', notes: 'The Settings page needs a screenshot.' }, ada, 1, { agentId: 'a1', itemId: 'm1', at: 1, excerpt: '| a | b |\n|---|---|\n| 1 | 2 |' }).todo

describe('askMessage', () => {
  it('a question names the task, its notes and where it came from, then the question', () => {
    const m = askMessage(todo(), 'ask', 'Is this still needed?')
    expect(m).toContain('todo#1')
    expect(m).toContain('Write the docs page')
    expect(m).toContain('Manual setup')
    expect(m).toContain('The Settings page needs a screenshot.')
    expect(m).toContain('| a | b |')
    expect(m).toContain('Is this still needed?')
    expect(m).toMatch(/question/i)
    expect(m).not.toMatch(/todo_claim/)
  })
  it('"work on it" says the task is theirs, to finish and mark done, and adds any words', () => {
    const m = askMessage(todo(), 'work', 'Start with the Settings page.')
    expect(m).toMatch(/work on/i)
    expect(m).toMatch(/todo_done/)
    expect(m).toContain('Start with the Settings page.')
    expect(m).toMatch(/already (recorded|assigned)|assigned to you/i)
  })
  it('works with no words, no notes and no source', () => {
    const t = addTodo(emptyBoard(), { title: 'Plain', list: 'L' }, you, 1).todo
    const m = askMessage(t, 'work', '')
    expect(m).toContain('todo#1')
    expect(m).not.toContain('undefined')
    expect(m).not.toContain('Notes:')
    expect(m).not.toContain('Came from')
  })
  it('keeps a long source short', () => {
    const t = addTodo(emptyBoard(), { title: 'x' }, ada, 1, { agentId: 'a', itemId: 'i', at: 1, excerpt: 'y'.repeat(3000) }).todo
    expect(askMessage(t, 'ask', 'q').length).toBeLessThan(1500)
  })
})
