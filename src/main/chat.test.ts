import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { newestSession, parseTranscriptLine, transcriptPath } from './chat'

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
    expect(parseTranscriptLine(line({ ...base, type: 'user', message: blocks }))).toMatchObject([{ toolUseId: 'toolu_2', text: 'nope', isError: true }])
  })

  it('keeps pictures the user attached, as data URLs', () => {
    const img = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } }
    const msg = { role: 'user', content: [{ type: 'text', text: 'what is this?' }, img] }
    expect(parseTranscriptLine(line({ ...base, type: 'user', message: msg }))).toEqual([
      { kind: 'user', id: 'u1:0', at: Date.parse(base.timestamp), text: 'what is this?' },
      { kind: 'image', id: 'u1:1', at: Date.parse(base.timestamp), mediaType: 'image/png', src: 'data:image/png;base64,AAAA' }
    ])
  })

  it('carries pictures in tool results, and drops ones too big to send across', () => {
    const big = 'A'.repeat(7 * 1024 * 1024)
    const res = { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: [{ type: 'text', text: 'shot' }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'BBBB' } }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: big } }] }] }
    expect(parseTranscriptLine(line({ ...base, type: 'user', message: res }))).toMatchObject([{ kind: 'tool-result', text: 'shot', images: ['data:image/jpeg;base64,BBBB', ''] }])
  })

  it('reads shell-mode commands (the ! prefix) and their output', () => {
    expect(parseTranscriptLine(line({ ...base, type: 'user', message: { role: 'user', content: '<bash-input>git status</bash-input>' } }))).toMatchObject([{ kind: 'shell', command: 'git status' }])
    expect(
      parseTranscriptLine(line({ ...base, type: 'user', message: { role: 'user', content: '<bash-stdout>On branch main</bash-stdout><bash-stderr>warn</bash-stderr>' } }))
    ).toMatchObject([{ kind: 'shell-out', stdout: 'On branch main', stderr: 'warn' }])
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


describe('finding the session a rewind forked to', () => {
  it('is the newest transcript written since, other than the current one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aw-news-'))
    try {
      mkdirSync(dir, { recursive: true })
      const put = (id: string, at: number) => {
        writeFileSync(join(dir, `${id}.jsonl`), '{}\n')
        utimesSync(join(dir, `${id}.jsonl`), at, at)
      }
      put('current', 2000)
      put('old', 500)
      put('fork', 1900)
      expect(newestSession(dir, 'current', 1_000_000)).toBe('fork')
      expect(newestSession(dir, 'current', 1_950_000)).toBeNull()
      expect(newestSession(join(dir, 'nope'), 'current', 0)).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
