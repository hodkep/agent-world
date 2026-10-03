import { describe, expect, it } from 'vitest'
import { UndoStack } from './undo'

const at = (text: string, caret = text.length) => ({ text, caret })

describe('UndoStack', () => {
  it('undoes a burst of typing in one step', () => {
    const u = new UndoStack(at(''))
    u.record(at('a'), 'type', 0)
    u.record(at('ab'), 'type', 100)
    u.record(at('abc'), 'type', 200)
    expect(u.undo()).toEqual(at(''))
    expect(u.undo()).toBeNull()
  })

  it('starts a new step after a pause', () => {
    const u = new UndoStack(at(''))
    u.record(at('one'), 'type', 0)
    u.record(at('one two'), 'type', 5000)
    expect(u.undo()).toEqual(at('one'))
    expect(u.undo()).toEqual(at(''))
  })

  it('keeps a completion, a recalled message or a paste as steps of their own', () => {
    const u = new UndoStack(at(''))
    u.record(at('/he'), 'type', 0)
    u.record(at('/help '), 'edit', 100)
    u.record(at('/help me'), 'type', 200)
    expect(u.undo()).toEqual(at('/help '))
    expect(u.undo()).toEqual(at('/he'))
    expect(u.undo()).toEqual(at(''))
  })

  it('redoes what was undone, until something new is written', () => {
    const u = new UndoStack(at(''))
    u.record(at('a'), 'edit', 0)
    u.record(at('ab'), 'edit', 10)
    u.undo()
    u.undo()
    expect(u.redo()).toEqual(at('a'))
    expect(u.redo()).toEqual(at('ab'))
    expect(u.redo()).toBeNull()
    u.undo()
    u.record(at('ax'), 'edit', 20)
    expect(u.redo()).toBeNull()
  })

  it('ignores a change that leaves the text as it was', () => {
    const u = new UndoStack(at('same'))
    u.record(at('same', 2), 'type', 0)
    expect(u.undo()).toBeNull()
  })

  it('remembers a long run of steps, dropping only the oldest', () => {
    const u = new UndoStack(at(''), 3)
    for (let i = 1; i <= 5; i++) u.record(at('x'.repeat(i)), 'edit', i)
    expect([u.undo(), u.undo(), u.undo(), u.undo()]).toEqual([at('xxxx'), at('xxx'), at('xx'), null])
  })

  it('starts over after the message is sent', () => {
    const u = new UndoStack(at(''))
    u.record(at('hello'), 'type', 0)
    u.reset(at(''))
    expect(u.undo()).toBeNull()
    expect(u.redo()).toBeNull()
  })
})
