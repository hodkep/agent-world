import { describe, expect, it } from 'vitest'
import type { ChatItem } from '../../shared/chat'
import { hasMarkdown, highlight, isImagePath, modeLabel, rowText, splitMentions, toMarkdown, toRows } from './format'

const t0 = 1_000_000
const user = (id: string, at: number, text: string): ChatItem => ({ kind: 'user', id, at, text })
const say = (id: string, at: number, text: string): ChatItem => ({ kind: 'assistant', id, at, text })

describe('a compaction', () => {
  const cmd: ChatItem = { kind: 'command', id: 'c', at: t0, name: '/compact', args: '' }
  const boundary: ChatItem = { kind: 'note', id: 'b', at: t0, text: 'Conversation compacted · 82k → 9k tokens (manual, 22s)' }
  const summary: ChatItem = { kind: 'note', id: 's', at: t0, text: 'Conversation summary', detail: 'the summary' }

  it('is one card, in place, with the /compact chip before it whichever way round they were saved', () => {
    for (const saved of [[cmd, boundary, summary], [boundary, summary, cmd], [summary, boundary, cmd]]) {
      const rows = toRows([user('u', t0, 'before'), ...saved, say('a', t0, 'after')], [])
      expect(rows.map((r) => r.kind)).toEqual(['user', 'command', 'note', 'assistant'])
      expect(rows[2]).toMatchObject({ text: boundary.kind === 'note' && boundary.text, detail: 'the summary' })
    }
  })

  it('is one card on its own for an automatic compaction', () => {
    expect(toRows([user('u', t0, 'before'), boundary, summary], []).map((r) => r.kind)).toEqual(['user', 'note'])
  })

  it('keeps other commands where they are', () => {
    expect(toRows([boundary, { ...cmd, name: '/clear' }], []).map((r) => r.kind)).toEqual(['note', 'command'])
  })
})

describe('chat rows', () => {
  it('folds a tool result into its call and joins a shell command with its output', () => {
    const items: ChatItem[] = [
      { kind: 'tool', id: 'a', at: t0, toolUseId: 't1', name: 'Bash', input: { command: 'ls' } },
      { kind: 'tool-result', id: 'b', at: t0, toolUseId: 't1', text: 'x.ts', isError: false, images: ['data:image/png;base64,AA'] },
      { kind: 'shell', id: 'c', at: t0, command: 'git status' },
      { kind: 'shell-out', id: 'd', at: t0, stdout: 'clean', stderr: '' }
    ]
    const rows = toRows(items, [])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ kind: 'tool', run: { name: 'Bash', result: { text: 'x.ts' }, images: ['data:image/png;base64,AA'] } })
    expect(rows[1]).toMatchObject({ kind: 'shell', command: 'git status', out: { stdout: 'clean' } })
  })

  it('shows what was just sent until the transcript has it, marking it queued when the agent was busy', () => {
    const rows = toRows([user('u', t0, 'old')], [{ id: 'p1', text: 'new', queued: true }, { id: 'p2', text: 'old', queued: false }])
    expect(rows.map((r) => r.kind === 'user' && [r.text, r.pending, r.queued])).toEqual([['old', undefined, undefined], ['new', true, true]])
  })

  it('counts a shell command, a slash command and a message with attachments as arrived', () => {
    const items: ChatItem[] = [
      { kind: 'shell', id: 's', at: t0, command: 'git status' },
      { kind: 'command', id: 'c', at: t0, name: '/compact', args: 'keep notes' },
      user('u', t0, 'what is this?')
    ]
    const sent = [
      { id: '1', text: '!git status', queued: false },
      { id: '2', text: '/compact keep notes', queued: false },
      { id: '3', text: '@"/a/b.png"\nwhat is this?', queued: false }
    ]
    expect(toRows(items, sent).some((r) => r.kind === 'user' && r.pending)).toBe(false)
  })

  it('says how long a longer turn took, on its last reply', () => {
    const items = [user('u1', t0, 'do it'), say('a1', t0 + 2000, 'working'), say('a2', t0 + 45_000, 'done'), user('u2', t0 + 60_000, 'ok'), say('a3', t0 + 61_000, 'hi')]
    const rows = toRows(items, [])
    const took = rows.filter((r) => r.kind === 'assistant').map((r) => r.kind === 'assistant' && r.took)
    expect(took).toEqual([undefined, 45, undefined])
  })

  it('does not time a greeting that comes before any message of yours', () => {
    const rows = toRows([say('a0', t0, 'Environment ready.'), user('u1', t0 + 1000, 'hi'), say('a1', t0 + 2000, 'hello')], [])
    expect(rows.filter((r) => r.kind === 'assistant').map((r) => r.kind === 'assistant' && r.took)).toEqual([undefined, undefined])
  })
})

describe('searching and exporting', () => {
  const rows = toRows([user('u', t0, 'add a health check'), { kind: 'tool', id: 't', at: t0, toolUseId: 't1', name: 'Edit', input: { file_path: '/r/src/health.ts', old_string: 'a', new_string: 'b' } }, say('a', t0, 'Done **now**')], [])

  it('finds rows by what is on them, whatever the kind', () => {
    expect(rows.filter((r) => rowText(r).toLowerCase().includes('health.ts')).map((r) => r.kind)).toEqual(['tool'])
    expect(rows.filter((r) => rowText(r).includes('Done')).map((r) => r.kind)).toEqual(['assistant'])
  })

  it('exports the conversation as markdown', () => {
    const md = toMarkdown(rows, 'ada')
    expect(md).toContain('**You:** add a health check')
    expect(md).toContain('**ada:** Done **now**')
    expect(md).toContain('Edited `/r/src/health.ts`')
  })
})

describe('permission mode names', () => {
  it('uses the words the Claude interface uses', () => {
    expect(modeLabel('default')).toBe('Ask first')
    expect(modeLabel('acceptEdits')).toBe('Edit automatically')
    expect(modeLabel('plan')).toBe('Plan')
    expect(modeLabel(undefined)).toBe('Ask first')
  })
})

describe('file mentions in a message', () => {
  it('splits @-mentions from the words around them, quoted or not', () => {
    expect(splitMentions('look at @"/a b/shot.png" and @src/app.ts please')).toEqual([
      { file: false, text: 'look at ' },
      { file: true, text: '/a b/shot.png' },
      { file: false, text: ' and ' },
      { file: true, text: 'src/app.ts' },
      { file: false, text: ' please' }
    ])
  })

  it('leaves email addresses and lone @ signs alone', () => {
    expect(splitMentions('mail me at a@b.com or @ someone')).toEqual([{ file: false, text: 'mail me at a@b.com or @ someone' }])
  })

  it('knows which mentions are pictures', () => {
    expect(isImagePath('/x/Shot.PNG')).toBe(true)
    expect(isImagePath('a.jpeg')).toBe(true)
    expect(isImagePath('notes.md')).toBe(false)
  })
})

describe('highlighting what is typed in the message box', () => {
  it('marks a leading command, a plugin skill and @file mentions, keeping every character', () => {
    const text = '/impeccable:impeccable polish @"a b/shot.png" and @src/app.ts now'
    const parts = highlight(text)
    expect(parts.map((p) => p.text).join('')).toBe(text)
    expect(parts.filter((p) => p.kind !== 'plain')).toEqual([
      { kind: 'plugin', text: '/impeccable:impeccable' },
      { kind: 'file', text: '@"a b/shot.png"' },
      { kind: 'file', text: '@src/app.ts' }
    ])
    expect(highlight('/compact now')[0]).toEqual({ kind: 'command', text: '/compact' })
  })

  it('leaves a slash in the middle, email addresses and lone @ signs plain', () => {
    expect(highlight('see /compact or a@b.com or @ x')).toEqual([{ kind: 'plain', text: 'see /compact or a@b.com or @ x' }])
  })
})

describe('spotting markdown in a message', () => {
  it('sees quotes, bold, italic, code and lists', () => {
    for (const t of ['> again', 'a **bold** word', 'an *italic* word', 'run `ls`', '- one\n- two', '1. one']) expect(hasMarkdown(t), t).toBe(true)
  })

  it('leaves plain sentences, commands and mentions alone', () => {
    for (const t of ['just words', '/compact', 'fix @src/app.ts please', 'a * b and c * d', '2 > 1', 'well - maybe']) expect(hasMarkdown(t), t).toBe(false)
  })
})
