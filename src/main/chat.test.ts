import { describe, expect, it } from 'vitest'
import { parseTranscriptLine, transcriptPath } from './chat'

const line = (o: object) => JSON.stringify(o)
const base = { uuid: 'u1', timestamp: '2026-09-30T07:33:23.872Z', isSidechain: false }

describe('reading Claude\'s transcript for the chat view', () => {
  it('turns a typed prompt into a user message', () => {
    expect(parseTranscriptLine(line({ ...base, type: 'user', message: { role: 'user', content: 'add a health check' } }))).toEqual([
      { kind: 'user', id: 'u1', at: Date.parse(base.timestamp), text: 'add a health check' }
    ])
  })

  it('reads slash commands and their output from the wrapper tags Claude saves', () => {
    const cmd = '<command-name>/compact</command-name>\n<command-message>compact</command-message>\n<command-args>keep notes</command-args>'
    expect(parseTranscriptLine(line({ ...base, type: 'user', message: { role: 'user', content: cmd } }))).toMatchObject([{ kind: 'command', name: '/compact', args: 'keep notes' }])
    const out = '<local-command-stdout>Compacted</local-command-stdout>'
    expect(parseTranscriptLine(line({ ...base, type: 'user', message: { role: 'user', content: out } }))).toMatchObject([{ kind: 'note', text: 'Compacted' }])
  })

  it('leaves out meta lines, hook chatter and subagent work', () => {
    expect(parseTranscriptLine(line({ ...base, type: 'user', isMeta: true, message: { role: 'user', content: '<local-command-caveat>x</local-command-caveat>' } }))).toEqual([])
    expect(parseTranscriptLine(line({ ...base, type: 'attachment', attachment: { type: 'hook_success' } }))).toEqual([])
    expect(parseTranscriptLine(line({ ...base, isSidechain: true, type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'sub' }] } }))).toEqual([])
    expect(parseTranscriptLine('not json')).toEqual([])
  })

  it('splits an assistant message into its text, thinking and tool calls', () => {
    const msg = { role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: 'x' }, { type: 'text', text: 'Looking.' }, { type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'ls' } }] }
    expect(parseTranscriptLine(line({ ...base, type: 'assistant', message: msg }))).toEqual([
      { kind: 'thinking', id: 'u1:0', at: Date.parse(base.timestamp) },
      { kind: 'assistant', id: 'u1:1', at: Date.parse(base.timestamp), text: 'Looking.' },
      { kind: 'tool', id: 'u1:2', at: Date.parse(base.timestamp), toolUseId: 'toolu_1', name: 'Bash', input: { command: 'ls' } }
    ])
  })

  it('reads tool results, from a string or from text blocks, and flags errors', () => {
    const one = { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'a.ts\nb.ts', is_error: false }] }
    expect(parseTranscriptLine(line({ ...base, type: 'user', message: one }))).toEqual([{ kind: 'tool-result', id: 'u1:0', at: Date.parse(base.timestamp), toolUseId: 'toolu_1', text: 'a.ts\nb.ts', isError: false }])
    const blocks = { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_2', content: [{ type: 'text', text: 'nope' }, { type: 'image' }], is_error: true }] }
    expect(parseTranscriptLine(line({ ...base, type: 'user', message: blocks }))).toMatchObject([{ toolUseId: 'toolu_2', text: 'nope\n[image]', isError: true }])
  })

  it('notes a compaction and an interrupt', () => {
    expect(parseTranscriptLine(line({ ...base, type: 'system', subtype: 'compact_boundary', content: 'Conversation compacted' }))).toMatchObject([{ kind: 'note', text: 'Conversation compacted' }])
    expect(parseTranscriptLine(line({ ...base, type: 'user', message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user]' }] } }))).toMatchObject([{ kind: 'note', text: 'Interrupted' }])
  })
})

describe('transcript location', () => {
  it('is <projects>/<project slug>/<session>.jsonl', () => {
    expect(transcriptPath('/home/u/.claude/projects', '/work/my.app', 'abc')).toBe('/home/u/.claude/projects/-work-my-app/abc.jsonl')
  })
})
