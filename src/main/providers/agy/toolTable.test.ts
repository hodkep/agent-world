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
  it('search and lookup: grep, find, list, fetch', () => {
    expect(t('grep_search', { Query: 'todo', SearchPath: '/p' })[0]).toMatchObject({ name: 'Grep', input: { pattern: 'todo', path: '/p' } })
    expect(t('find_by_name', { Pattern: '*.ts', SearchDirectory: '/p' })[0]).toMatchObject({ name: 'Glob', input: { pattern: '*.ts', path: '/p' } })
    expect(t('read_url_content', { Url: 'https://x.dev' })[0]).toMatchObject({ name: 'WebFetch', input: { url: 'https://x.dev' } })
  })
  it('missing or odd arguments never throw', () => {
    expect(t('write_to_file', {})[0]).toMatchObject({ name: 'Write', input: { file_path: '', content: '' } })
    expect(t('multi_replace_file_content', { TargetFile: 'a', ReplacementChunks: 'nope' })[0]).toMatchObject({ name: 'MultiEdit', input: { edits: [] } })
    expect(t('invoke_subagent', {})).toEqual([])
  })
  it('the answer to starting subagents is silent: each subagent answers for itself', () => {
    expect(agyCalls.silentResult('invoke_subagent')).toBe(true)
    expect(agyCalls.silentResult('run_command')).toBe(false)
  })
})
