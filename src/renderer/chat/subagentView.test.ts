import { describe, expect, it } from 'vitest'
import type { ChatItem, SubagentInfo } from '../../shared/chat'
import { liveLine, signature, tabLabel, trimFork } from './subagentView'

const at = 1_000
const tool = (id: string, name: string, input: Record<string, unknown> = {}): ChatItem => ({ kind: 'tool', id, at, toolUseId: `use-${id}`, name, input })
const result = (id: string, text: string): ChatItem => ({ kind: 'tool-result', id: `r-${id}`, at, toolUseId: `use-${id}`, text, isError: false })
const say = (id: string, text: string): ChatItem => ({ kind: 'assistant', id, at, text })
const user = (id: string, text: string): ChatItem => ({ kind: 'user', id, at, text })
const info = (o: Partial<SubagentInfo> = {}): SubagentInfo => ({ agentId: 'af7fd77650e06ccb2', toolUseId: 'tu', type: 'fork', description: 'Show delivery photos to vendor and TB officers', startedAt: 0, updatedAt: 0, done: false, calls: [], result: '', depth: 1, background: true, spawns: [], stopped: false, ...o })

describe('a fork\'s opening', () => {
  it('is shown as the task it was given, not as a call to start a subagent with the fork\'s own instructions after it', () => {
    const items = [tool('a', 'Agent', { description: 'Photos', prompt: 'Build the photo block.' }), result('a', 'Fork started — processing in background'), user('b', '<fork-boilerplate>\nYou are a worker fork.\n</fork-boilerplate>'), say('c', 'Starting.'), tool('d', 'Bash', { command: 'ls' })]
    expect(trimFork(items)).toEqual([{ kind: 'user', id: 'a', at, text: 'Build the photo block.' }, say('c', 'Starting.'), tool('d', 'Bash', { command: 'ls' })])
  })
  it('leaves any other conversation alone, including one that starts with a plain prompt', () => {
    const plain = [user('u', 'Map the auth module'), say('a', 'On it.')]
    expect(trimFork(plain)).toEqual(plain)
    expect(trimFork([])).toEqual([])
  })
  it('keeps a later call to start a subagent of its own', () => {
    const items = [user('u', 'go'), tool('a', 'Agent', { description: 'Helper', prompt: 'x' })]
    expect(trimFork(items)).toEqual(items)
  })
})

describe('what the subagent is doing now', () => {
  it('says it is running a command or reading, from the call that has no answer yet', () => {
    expect(liveLine([tool('a', 'Bash', { command: 'npm test' })], 'working')).toBe('running a command')
    expect(liveLine([tool('a', 'Read', { file_path: '/r/a.ts' })], 'working')).toBe('reading')
    expect(liveLine([tool('a', 'Edit', { file_path: '/r/a.ts' })], 'working')).toBe('writing code')
  })
  it('says thinking when every call has been answered, and nothing once it is over', () => {
    expect(liveLine([tool('a', 'Bash'), result('a', 'ok')], 'working')).toBe('thinking')
    expect(liveLine([tool('a', 'Bash')], 'done')).toBeNull()
    expect(liveLine([tool('a', 'Bash')], 'stopped')).toBeNull()
  })
})

describe('telling a changed conversation from the same one', () => {
  it('differs when a line is added, and is the same when nothing changed', () => {
    const a = [say('1', 'x')]
    expect(signature(a)).toBe(signature([say('1', 'x')]))
    expect(signature([...a, say('2', 'y')])).not.toBe(signature(a))
    expect(signature([])).toBe('0:')
  })
})

describe('the name on a subagent\'s tab', () => {
  it('is its task, cut to fit', () => {
    expect(tabLabel(info())).toBe('Show delivery photos to ve…')
    expect(tabLabel(info({ description: 'Short' }))).toBe('Short')
    expect(tabLabel(info({ description: '' }))).toBe('fork')
  })
})
