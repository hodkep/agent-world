import { describe, expect, it } from 'vitest'
import type { ChatItem } from '../shared/chat'
import { sessionNotes } from './notes'

const at = Date.UTC(2026, 8, 30, 10, 5)
const items: ChatItem[] = [
  { kind: 'user', id: '1', at, text: 'add a health\ncheck' },
  { kind: 'tool', id: '2', at, toolUseId: 't1', name: 'Edit', input: { file_path: '/p/src/health.ts' } },
  { kind: 'tool', id: '3', at, toolUseId: 't2', name: 'Edit', input: { file_path: '/p/src/health.ts' } },
  { kind: 'tool', id: '4', at, toolUseId: 't3', name: 'Bash', input: { command: 'npm test' } },
  { kind: 'tool-result', id: '5', at, toolUseId: 't3', text: 'boom', isError: true },
  { kind: 'shell', id: '6', at, command: 'git status' },
  { kind: 'assistant', id: '7', at, text: 'Done. Tests need a fix.' }
]

describe('sessionNotes', () => {
  const md = sessionNotes(items, { name: 'ada', branch: 'aw/ada', cost: 0.5 })
  it('lists what was asked, on one line each', () => expect(md).toContain('1. add a health check'))
  it('lists each changed file once', () => expect(md.match(/health\.ts/g)).toHaveLength(1))
  it('lists commands, marking the ones that failed', () => {
    expect(md).toContain('- `npm test` (failed)')
    expect(md).toContain('- `git status`')
  })
  it('ends with the last reply and carries the header facts', () => {
    expect(md).toContain('Done. Tests need a fix.')
    expect(md).toContain('Started 2026-09-30 10:05 · Branch `aw/ada` · Cost $0.50')
  })
  it('skips sections with nothing in them', () => expect(sessionNotes([{ kind: 'user', id: '1', at, text: 'hi' }], { name: 'x', branch: null })).not.toContain('Files changed'))
})
