import { describe, expect, it } from 'vitest'
import type { Row } from './format'
import { type Step, groupSteps, groupSummary } from './stepGroups'

const tool = (id: string, name = 'Bash', result?: { text: string; isError: boolean }, sec?: number): Step => ({ kind: 'tool', id, run: { name, input: {}, result, sec } })
const think = (id: string, took?: number): Step => ({ kind: 'thinking', id, took })
const say = (id: string): Row => ({ kind: 'assistant', id, text: 'hi' })
const ok = { text: '', isError: false }

describe('groupSteps', () => {
  it('folds the commands and thoughts between two messages into one group', () => {
    const out = groupSteps([say('a'), tool('1', 'Bash', ok), think('t', 6), tool('2', 'Read', ok), say('b')])
    expect(out.map((o) => ('steps' in o ? o.steps.map((s) => s.id) : o.id))).toEqual(['a', ['1', 't', '2'], 'b'])
  })

  it('ends a group at a message, so the next steps start a new one', () => {
    const out = groupSteps([tool('1'), tool('2'), say('m'), tool('3'), tool('4')])
    expect(out.map((o) => ('steps' in o ? 'group' : o.kind))).toEqual(['group', 'assistant', 'group'])
  })

  it('leaves a single step, and a lone thought, as they are', () => {
    expect(groupSteps([tool('1'), say('m'), think('t'), say('n')]).every((o) => !('steps' in o))).toBe(true)
  })

  it('keeps edits, questions and watchers as cards of their own, breaking the group', () => {
    const out = groupSteps([tool('1'), tool('2'), tool('e', 'Edit'), tool('3'), tool('4'), tool('m', 'Monitor')])
    expect(out.map((o) => ('steps' in o ? 'group' : o.kind))).toEqual(['group', 'tool', 'group', 'tool'])
  })
})

describe('groupSummary', () => {
  it('counts commands, failures and the time spent', () => {
    const s = groupSummary([tool('1', 'Bash', ok, 3), think('t', 6), tool('2', 'Bash', { text: 'x', isError: true }, 1)])
    expect(s).toMatchObject({ commands: 2, failed: 1, sec: 10, running: false })
  })

  it('is running while a command has no result', () => {
    expect(groupSummary([tool('1', 'Bash', ok), tool('2')]).running).toBe(true)
  })
})
