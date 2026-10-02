import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { callDetail, listSubagents } from './subagents'

const line = (o: object) => JSON.stringify(o)
const use = (at: string, name: string, input: object) => line({ type: 'assistant', timestamp: at, message: { role: 'assistant', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `t-${at}`, name, input }] } })
const text = (at: string, t: string, stop = 'end_turn') => line({ type: 'assistant', timestamp: at, message: { role: 'assistant', stop_reason: stop, content: [{ type: 'text', text: t }] } })

function session(files: Record<string, { meta: object; lines: string[] }>) {
  const dir = mkdtempSync(join(tmpdir(), 'aw-subs-'))
  mkdirSync(join(dir, 'subagents'))
  for (const [id, f] of Object.entries(files)) {
    writeFileSync(join(dir, 'subagents', `agent-${id}.meta.json`), JSON.stringify(f.meta))
    writeFileSync(join(dir, 'subagents', `agent-${id}.jsonl`), f.lines.join('\n') + '\n')
  }
  return dir
}

describe('reading the subagents a session started', () => {
  const dir = session({
    a1: {
      meta: { agentType: 'Explore', description: 'Map the auth module', toolUseId: 'toolu_A' },
      lines: [
        line({ type: 'user', timestamp: '2026-10-01T08:00:00.000Z', message: { role: 'user', content: 'go' } }),
        use('2026-10-01T08:00:02.000Z', 'Grep', { pattern: 'retry\\(' }),
        use('2026-10-01T08:00:05.000Z', 'Read', { file_path: '/repo/src/http/retry.ts' }),
        text('2026-10-01T08:00:09.000Z', 'Three call sites.')
      ]
    },
    b2: {
      meta: { agentType: 'Plan', description: 'Draft a plan', toolUseId: 'toolu_B' },
      lines: [line({ type: 'user', timestamp: '2026-10-01T08:00:01.000Z', message: { role: 'user', content: 'go' } }), use('2026-10-01T08:00:04.000Z', 'Bash', { command: 'pnpm test' })]
    }
  })

  it('gives each subagent its type, task, the call that started it, its calls in order, and its final answer', () => {
    const [a] = listSubagents(dir).filter((s) => s.toolUseId === 'toolu_A')
    expect(a).toMatchObject({ agentId: 'a1', type: 'Explore', description: 'Map the auth module', done: true, result: 'Three call sites.' })
    expect(a!.calls.map((c) => `${c.name} ${c.detail}`)).toEqual(['Grep retry\\(', 'Read retry.ts'])
    expect(a!.startedAt).toBe(Date.parse('2026-10-01T08:00:00.000Z'))
    expect(a!.updatedAt).toBe(Date.parse('2026-10-01T08:00:09.000Z'))
  })

  it('counts handing its report back as the answer, not as one more call', () => {
    const d = session({
      h1: {
        meta: { agentType: 'Explore', description: 'Report by hand-back', toolUseId: 'toolu_H' },
        lines: [line({ type: 'user', timestamp: '2026-10-01T08:00:00.000Z', message: { role: 'user', content: 'go' } }), use('2026-10-01T08:00:03.000Z', 'Read', { file_path: '/r/a.ts' }), use('2026-10-01T08:00:07.000Z', 'SubagentHandback', { message: 'Found it.\nIn a.ts.' })]
      }
    })
    const [h] = listSubagents(d)
    expect(h).toMatchObject({ done: true, result: 'Found it.\nIn a.ts.' })
    expect(h!.calls.map((c) => c.name)).toEqual(['Read'])
  })

  it('knows how deep it sits, whether it runs in the background, and which subagents it started itself', () => {
    const d = session({
      p1: { meta: { agentType: 'Plan', description: 'Parent', toolUseId: 'toolu_P', spawnDepth: 1, requestShape: 'background' }, lines: [use('2026-10-01T08:00:01.000Z', 'Agent', { description: 'Child' })] },
      c1: { meta: { agentType: 'Explore', description: 'Child', toolUseId: 't-2026-10-01T08:00:01.000Z', spawnDepth: 2, requestShape: 'foreground' }, lines: [use('2026-10-01T08:00:02.000Z', 'Read', { file_path: '/r/a.ts' })] }
    })
    const [parent, child] = listSubagents(d)
    expect(parent).toMatchObject({ depth: 1, background: true, spawns: ['t-2026-10-01T08:00:01.000Z'] })
    expect(parent!.calls.map((c) => c.name)).toEqual(['Agent'])
    expect(child).toMatchObject({ depth: 2, background: false, spawns: [] })
  })

  it('treats one that has not given a final answer as still running', () => {
    const b = listSubagents(dir).find((s) => s.toolUseId === 'toolu_B')!
    expect(b.done).toBe(false)
    expect(b.result).toBe('')
    expect(b.calls).toHaveLength(1)
  })

  it('returns nothing for a session with no subagents folder, and skips a file it cannot read', () => {
    expect(listSubagents(join(dir, 'nope'))).toEqual([])
    writeFileSync(join(dir, 'subagents', 'agent-bad.meta.json'), '{not json')
    expect(listSubagents(dir)).toHaveLength(2)
  })
})

describe('a one-line summary of a tool call', () => {
  it('names the file, command or pattern, and falls back to the first text input', () => {
    expect(callDetail('Edit', { file_path: '/a/b/c.ts' })).toBe('c.ts')
    expect(callDetail('Bash', { command: 'pnpm test --run' })).toBe('pnpm test --run')
    expect(callDetail('Glob', { pattern: '**/*.ts' })).toBe('**/*.ts')
    expect(callDetail('WebSearch', { query: 'electron notarize' })).toBe('electron notarize')
    expect(callDetail('Mystery', {})).toBe('')
    expect(callDetail('Bash', { command: 'x'.repeat(200) }).length).toBeLessThanOrEqual(60)
  })
})
