import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { dropPromptSnapshots } from './promptSnapshot'

const line = (o: object) => JSON.stringify(o)
const snapshot = line({ type: 'attachment', attachment: { type: 'prompt_snapshot', systemPrompt: '["You are a code reviewer."]' } })
const user = line({ type: 'user', message: { role: 'user', content: 'hello' } })
const reply = line({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'hi' }] } })

describe('forgetting the system prompt a saved session remembers', () => {
  it('drops the prompt snapshots and keeps every other line, so a resume uses the new launch flags', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'aw-snap-')), 's.jsonl')
    writeFileSync(file, [user, snapshot, reply, snapshot].join('\n') + '\n')
    expect(dropPromptSnapshots(file)).toBe(2)
    expect(readFileSync(file, 'utf8')).toBe([user, reply].join('\n') + '\n')
  })

  it('leaves a session without snapshots untouched, and a missing file alone', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'aw-snap-')), 's.jsonl')
    writeFileSync(file, `${user}\nnot json at all\n`)
    expect(dropPromptSnapshots(file)).toBe(0)
    expect(readFileSync(file, 'utf8')).toBe(`${user}\nnot json at all\n`)
    expect(dropPromptSnapshots(join(file, 'nope'))).toBe(0)
  })
})
