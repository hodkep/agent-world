import { describe, expect, it } from 'vitest'
import type { ChatItem } from '../shared/chat'
import { advanceWork, hiredAtOf, profileCounts, workedNow } from './profile'

const tool = (name: string, input: Record<string, unknown>, id = name + Math.random()): ChatItem => ({ kind: 'tool', id, at: 1, toolUseId: id, name, input })
const user = (id: string): ChatItem => ({ kind: 'user', id, at: 1, text: 'hi' })

describe('counting what an agent has done from its conversation', () => {
  it('counts turns, the most used tools, and the files it wrote once each', () => {
    const items = [user('a'), tool('Read', { file_path: '/r/a.ts' }), tool('Edit', { file_path: '/r/a.ts' }), tool('Edit', { file_path: '/r/a.ts' }), tool('Write', { file_path: '/r/b.ts' }), user('b'), tool('Read', { file_path: '/r/c.ts' }), tool('Bash', { command: 'ls' }), tool('Bash', { command: 'pwd' }), tool('Read', { file_path: '/r/d.ts' }), tool('Grep', { pattern: 'x' })]
    expect(profileCounts(items)).toEqual({ turns: 2, tools: [['Read', 3], ['Edit', 2], ['Bash', 2]], files: 2 })
  })

  it('counts nothing for an empty conversation, and ignores notes, results and thinking', () => {
    expect(profileCounts([])).toEqual({ turns: 0, tools: [], files: 0 })
    expect(profileCounts([{ kind: 'note', id: 'n', at: 1, text: 'x' }, { kind: 'thinking', id: 't', at: 1 }])).toEqual({ turns: 0, tools: [], files: 0 })
  })
})

describe('time spent working', () => {
  it('adds up the stretches in which the agent was busy, and counts the one in progress', () => {
    let w = { total: 0, since: null as number | null }
    w = advanceWork(w, 'thinking', 1000)
    w = advanceWork(w, 'implementing', 3000) // still busy: nothing changes
    expect(workedNow(w, 5000)).toBe(4000)
    w = advanceWork(w, 'idle', 6000)
    expect(w).toEqual({ total: 5000, since: null })
    w = advanceWork(w, 'waiting', 9000)
    expect(workedNow(w, 20_000)).toBe(5000)
    w = advanceWork(w, 'running', 21_000)
    expect(workedNow(w, 22_000)).toBe(6000)
  })

  it('stops the clock when it is waiting on you or asleep, since nothing is being done then', () => {
    let w = advanceWork({ total: 0, since: null }, 'thinking', 0)
    w = advanceWork(w, 'permission', 2000)
    expect(workedNow(w, 50_000)).toBe(2000)
    w = advanceWork(advanceWork(w, 'thinking', 60_000), 'asleep', 61_000)
    expect(workedNow(w, 99_000)).toBe(3000)
  })
})

describe('when an agent was hired', () => {
  it('uses the stored time, else the worktree folder, else the conversation start, and says which', () => {
    expect(hiredAtOf({ hiredAt: 500 }, { folder: 900, conversation: 700 })).toEqual({ at: 500, estimated: false })
    expect(hiredAtOf({}, { folder: 900, conversation: 700 })).toEqual({ at: 900, estimated: true })
    expect(hiredAtOf({}, { folder: null, conversation: 700 })).toEqual({ at: 700, estimated: true })
    expect(hiredAtOf({}, { folder: null, conversation: null })).toEqual({ at: null, estimated: true })
  })
})
