import { describe, expect, it } from 'vitest'
import { findTodoRefs } from './todoLinks'

describe('findTodoRefs', () => {
  it('finds todo#14 and "todo #14", and says where', () => {
    const text = 'Done with todo#14, and also Todo #3.'
    const refs = findTodoRefs(text)
    expect(refs.map((r) => r.id)).toEqual(['14', '3'])
    expect(refs.map((r) => text.slice(r.start, r.end))).toEqual(['todo#14', 'Todo #3'])
  })
  it('leaves a bare #12, other words ending in todo, and longer numbers alone', () => {
    expect(findTodoRefs('see PR #12 and the mytodo#5 list and todo#1234567')).toEqual([])
    expect(findTodoRefs('todo list #4')).toEqual([])
  })
  it('does not take a trailing letter or digits of a longer word', () => {
    expect(findTodoRefs('todo#14a todo#14.')).toHaveLength(1)
  })
})
