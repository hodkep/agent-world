import { describe, expect, it } from 'vitest'
import { agyCalls } from './toolTable'

const t = (name: string, args: Record<string, unknown>) => agyCalls.translate({ id: 'c1', name, args })

describe("agy's tools in the chat's vocabulary", () => {
  it('files: write, one replacement and several replacements', () => {
    expect(t('write_to_file', { TargetFile: '/p/a.ts', CodeContent: 'hi' })).toEqual([{ id: 'c1', name: 'Write', input: { file_path: '/p/a.ts', content: 'hi' } }])
    expect(t('replace_file_content', { TargetFile: '/p/a.ts', TargetContent: 'a', ReplacementContent: 'b' })).toEqual([{ id: 'c1', name: 'Edit', input: { file_path: '/p/a.ts', old_string: 'a', new_string: 'b' } }])
    expect(t('multi_replace_file_content', { TargetFile: '/p/a.ts', ReplacementChunks: [{ TargetContent: 'a', ReplacementContent: 'b' }, { TargetContent: 'c', ReplacementContent: 'd' }] })).toEqual([
      { id: 'c1', name: 'MultiEdit', input: { file_path: '/p/a.ts', edits: [{ old_string: 'a', new_string: 'b' }, { old_string: 'c', new_string: 'd' }] } }
    ])
  })
  it('a question is the chat\'s question: its text, its answers and whether several may be picked', () => {
    const out = t('ask_question', { questions: [{ is_multi_select: false, options: ['A', 'B'], question: 'Which?' }, { is_multi_select: true, options: ['X'], question: 'Any?' }] })
    expect(out).toEqual([{ id: 'c1', name: 'AskUserQuestion', input: { questions: [
      { question: 'Which?', header: '', options: [{ label: 'A', description: '' }, { label: 'B', description: '' }], multiSelect: false },
      { question: 'Any?', header: '', options: [{ label: 'X', description: '' }], multiSelect: true }
    ] } }])
    expect(t('ask_question', {})[0]).toMatchObject({ name: 'AskUserQuestion', input: { questions: [] } })
  })
  it('agy 1.4\'s own names for reading and writing a file are drawn like the older ones', () => {
    expect(t('read_file', { Path: '/p/a.ts', StartLine: 1, EndLine: 100 })[0]).toMatchObject({ name: 'Read', input: { file_path: '/p/a.ts' } })
    expect(t('write_file', { Path: '/p/a.ts', Content: 'hi' })[0]).toMatchObject({ name: 'Write', input: { file_path: '/p/a.ts', content: 'hi' } })
  })
  it('search and lookup: grep, find, list, fetch', () => {
    expect(t('grep_search', { Query: 'todo', SearchPath: '/p' })[0]).toMatchObject({ name: 'Grep', input: { pattern: 'todo', path: '/p' } })
    expect(t('find_by_name', { Pattern: '*.ts', SearchDirectory: '/p' })[0]).toMatchObject({ name: 'Glob', input: { pattern: '*.ts', path: '/p' } })
    expect(t('read_url_content', { Url: 'https://x.dev' })[0]).toMatchObject({ name: 'WebFetch', input: { url: 'https://x.dev' } })
  })
  it('a timer is a schedule in seconds with what it will do', () => {
    expect(t('schedule', { DurationSeconds: 10, Prompt: 'Wait for subagent to finish', TimerCondition: 'c-1' })).toEqual([{ id: 'c1', name: 'Schedule', input: { inSeconds: 10, reason: '', prompt: 'Wait for subagent to finish' } }])
    expect(t('schedule', {})[0]).toMatchObject({ name: 'Schedule', input: { inSeconds: 0, prompt: '' } })
  })
  it('missing or odd arguments never throw', () => {
    expect(t('write_to_file', {})[0]).toMatchObject({ name: 'Write', input: { file_path: '', content: '' } })
    expect(t('multi_replace_file_content', { TargetFile: 'a', ReplacementChunks: 'nope' })[0]).toMatchObject({ name: 'MultiEdit', input: { edits: [] } })
    expect(t('invoke_subagent', {})).toEqual([])
  })
  it('a tool name that is also an Object method is an unknown tool, never a lookup into Object', () => {
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
      expect(t(name, { name: 'Bash', input: { command: 'rm -rf /' } }), name).toEqual([{ id: 'c1', name, input: { name: 'Bash', input: { command: 'rm -rf /' } } }])
    }
  })
  it('the answer to starting subagents is silent: each subagent answers for itself', () => {
    expect(agyCalls.silentResult('invoke_subagent')).toBe(true)
    expect(agyCalls.silentResult('run_command')).toBe(false)
  })
})
