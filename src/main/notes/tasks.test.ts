import { describe, expect, it } from 'vitest'
import { makeTasks } from './tasks'

const note = ['## Todos', '- [x] Done one', '- [ ] Umbrella', '  - [ ] Part a', '  - [ ] Part b', 'plain'].join('\n')

const fake = () => {
  const calls: string[] = []
  let n = 0
  return {
    calls,
    deps: {
      add: (i: { title: string; list?: string; parent?: string }) => (calls.push(`add ${i.title}${i.list ? ` @${i.list}` : ''}${i.parent ? ` under ${i.parent}` : ''}`), { id: String(++n) }),
      done: (id: string) => void calls.push(`done ${id}`)
    }
  }
}

describe('making tasks from a note', () => {
  it('makes a task for each line and a subtask under its umbrella, finishes the ticked ones, and marks each line with its task', () => {
    const f = fake()
    const r = makeTasks(note, ['Todos'], f.deps)
    expect(f.calls).toEqual(['add Done one @Todos', 'done 1', 'add Umbrella @Todos', 'add Part a under 2', 'add Part b under 2'])
    expect(r.made).toHaveLength(4)
    expect(r.text.split('\n')).toEqual(['## Todos', '- [x] Done one (todo#1)', '- [ ] Umbrella (todo#2)', '  - [ ] Part a (todo#3)', '  - [ ] Part b (todo#4)', 'plain'])
  })
  it('makes nothing twice: a line that is a task already is left alone, and a part goes under the task its line already is', () => {
    const f = fake()
    const once = makeTasks(note, [], f.deps)
    const g = fake()
    expect(makeTasks(once.text, [], g.deps).made).toEqual([])
    const withNew = once.text.replace('  - [ ] Part b (todo#4)', '  - [ ] Part b (todo#4)\n  - [ ] Part c')
    expect(makeTasks(withNew, [], g.deps).made).toHaveLength(1)
    expect(g.calls).toEqual(['add Part c under 2'])
  })
  it('can be limited to some lines', () => {
    const f = fake()
    const r = makeTasks(note, [], f.deps, new Set([2]))
    expect(f.calls).toEqual(['add Umbrella'])
    expect(r.text.split('\n')[2]).toBe('- [ ] Umbrella (todo#1)')
  })
})
