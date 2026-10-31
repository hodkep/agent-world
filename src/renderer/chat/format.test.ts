import { describe, expect, it } from 'vitest'
import type { ChatItem } from '../../shared/chat'
import type { SubagentInfo } from '../../shared/chat'
import { elapsedLabel, hasMarkdown, highlight, markdownSpans, isImagePath, modeLabel, rowText, spanLabel, splitMentions, subagentState, toMarkdown, toRows } from './format'

const t0 = 1_000_000
const user = (id: string, at: number, text: string): ChatItem => ({ kind: 'user', id, at, text })
const say = (id: string, at: number, text: string): ChatItem => ({ kind: 'assistant', id, at, text })

describe('work this agent handed to another', () => {
  const sentText = 'Hand-off (review) from ada: branch aw/ada, based on main.\nRead it with: git diff main...aw/ada\nNote from ada: the auth part'
  const out = (at: number): ChatItem => ({ kind: 'handoff-out', id: 'h1', at, to: 'grace', status: 'queued', text: sentText })
  it('is a row of its own, in the place it was sent, with where it went and what it said', () => {
    const rows = toRows([user('u1', t0, 'hand it over'), out(t0 + 5), say('a1', t0 + 10, 'Done')], [])
    expect(rows.map((r) => r.kind)).toEqual(['user', 'handoff-out', 'assistant'])
    expect(rows[1]).toMatchObject({ kind: 'handoff-out', to: 'grace', status: 'queued', handoff: { kind: 'review', branch: 'aw/ada', note: 'the auth part' } })
  })
  it('is left out when the text is not a hand-off', () => {
    expect(toRows([{ kind: 'handoff-out', id: 'x', at: t0, to: 'grace', status: 'delivered', text: 'hello' }], [])).toEqual([])
  })
})

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

  it('counts a send as arrived when Claude merged it into one prompt with the next', () => {
    const merged = user('u', t0 + 5000, 'Summarise the doc.Summarise it again.')
    const sent = [{ id: '1', text: 'Summarise the doc.', queued: false, at: t0 }, { id: '2', text: 'Summarise it again.', queued: true, at: t0 + 1000 }]
    expect(toRows([merged], sent).some((r) => r.kind === 'user' && r.pending)).toBe(false)
  })

  it('does not count an older message that merely contains a short send', () => {
    const sent = [{ id: '1', text: 'ok', queued: false, at: t0 + 10_000 }]
    expect(toRows([user('u', t0, 'ok then, look at the book')], sent).some((r) => r.kind === 'user' && r.pending)).toBe(true)
  })

  it('shows a call that starts a subagent through the office as a delegation, named by its task and program', () => {
    const items: ChatItem[] = [
      user('u', t0, 'go'),
      { kind: 'tool', id: 'a', at: t0 + 1, toolUseId: 't1', name: 'mcp__agent-world__spawn_subagent', input: { provider: 'agy', task: 'Read  src/main/prefs.ts\nand say what it checks' } },
      { kind: 'tool', id: 'b', at: t0 + 2, toolUseId: 't2', name: 'mcp__agent-world__spawn_subagent', input: { provider: 'claude', task: 'Count the files' } },
      { kind: 'tool', id: 'c', at: t0 + 3, toolUseId: 't3', name: 'mcp__agent-world__await_subagents', input: { ids: ['x'] } }
    ]
    const rows = toRows(items, [])
    // The wait for its answer is not drawn: the subagent's row shows how it is getting on.
    expect(rows.map((r) => r.kind)).toEqual(['user', 'delegation'])
    expect(rows[1]).toMatchObject({ kind: 'delegation', calls: [{ toolUseId: 't1', description: 'Read src/main/prefs.ts and say what it checks', subagentType: 'agy' }, { toolUseId: 't2', description: 'Count the files', subagentType: 'claude' }] })
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

describe('highlighting paths typed in the message box', () => {
  it('does not take an absolute path for a slash command', () => {
    const parts = highlight('/private/tmp/claude-501/scratchpad/mcp-cards-preview.html\nopen this link')
    expect(parts[0]).toEqual({ kind: 'file', text: '/private/tmp/claude-501/scratchpad/mcp-cards-preview.html' })
    expect(parts.some((p) => p.kind === 'command')).toBe(false)
  })
  it('marks paths in the middle of a sentence, home and relative ones too', () => {
    expect(highlight('open ~/notes/a.md and ./src/app.ts please').filter((p) => p.kind === 'file').map((p) => p.text)).toEqual(['~/notes/a.md', './src/app.ts'])
  })
  it('still marks a real command, with and without arguments', () => {
    expect(highlight('/compact')[0]).toEqual({ kind: 'command', text: '/compact' })
    expect(highlight('/compact now')[0]).toEqual({ kind: 'command', text: '/compact' })
  })
  it('leaves plain slashes and fractions alone', () => {
    expect(highlight('and/or 1/2 a/b')).toEqual([{ kind: 'plain', text: 'and/or 1/2 a/b' }])
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

  it('marks a command or plugin skill anywhere in the message, not only at the start', () => {
    const text = 'please run /compact then /impeccable:polish on it'
    const parts = highlight(text)
    expect(parts.map((p) => p.text).join('')).toBe(text)
    expect(parts.filter((p) => p.kind !== 'plain')).toEqual([
      { kind: 'command', text: '/compact' },
      { kind: 'plugin', text: '/impeccable:polish' }
    ])
    expect(highlight('line one\n/review this')[1]).toEqual({ kind: 'command', text: '/review' })
  })

  it('leaves a slash inside a word, a fraction, a URL, email addresses and lone @ signs plain', () => {
    for (const t of ['and/or 1/2 w/o a/b', 'see https://example.com/docs now', 'a@b.com or @ x', 'a // b']) expect(highlight(t), t).toEqual([{ kind: 'plain', text: t }])
  })

  it('still reads a longer path in the middle as a file, not a command', () => {
    expect(highlight('open /usr/bin/env now').filter((p) => p.kind !== 'plain')).toEqual([{ kind: 'file', text: '/usr/bin/env' }])
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

describe('subagents started in one reply', () => {
  const agent = (id: string, name: 'Agent' | 'Task', description: string): ChatItem => ({ kind: 'tool', id, at: t0, toolUseId: `use-${id}`, name, input: { description, subagent_type: 'Explore' } })
  const result = (id: string): ChatItem => ({ kind: 'tool-result', id: `r-${id}`, at: t0, toolUseId: `use-${id}`, text: 'Async agent launched', isError: false })

  it('are one delegation row, in the order they were started, whatever they are called and wherever the results landed', () => {
    const rows = toRows([user('u', t0, 'audit'), say('a', t0, 'Splitting this up'), agent('1', 'Agent', 'Map auth'), agent('2', 'Task', 'Find callers'), result('1'), agent('3', 'Agent', 'Draft plan'), result('2'), result('3')], [])
    expect(rows.map((r) => r.kind)).toEqual(['user', 'assistant', 'delegation'])
    const d = rows[2]!
    if (d.kind !== 'delegation') throw new Error('not a delegation')
    expect(d.calls.map((c) => [c.toolUseId, c.description, c.subagentType])).toEqual([['use-1', 'Map auth', 'Explore'], ['use-2', 'Find callers', 'Explore'], ['use-3', 'Draft plan', 'Explore']])
  })

  it('make a second row when something else was said in between, and leave other tools alone', () => {
    const grep: ChatItem = { kind: 'tool', id: 'g', at: t0, toolUseId: 'use-g', name: 'Grep', input: { pattern: 'x' } }
    const rows = toRows([agent('1', 'Agent', 'One'), say('a', t0, 'and then'), agent('2', 'Agent', 'Two'), grep], [])
    expect(rows.map((r) => r.kind)).toEqual(['delegation', 'assistant', 'delegation', 'tool'])
  })
})

describe('where a subagent is at', () => {
  const info = (over: Partial<SubagentInfo> = {}): SubagentInfo => ({ agentId: 'a', toolUseId: 'u', type: 'Explore', description: 'd', startedAt: 1000, updatedAt: 5000, done: false, calls: [], result: '', depth: 1, background: true, spawns: [], stopped: false, ...over })

  it('is waiting before its file exists, working while it makes calls, and done once it has answered', () => {
    expect(subagentState(undefined, 9000)).toBe('waiting')
    expect(subagentState(info(), 6000)).toBe('working')
    expect(subagentState(info({ done: true, result: 'ok' }), 9_000_000)).toBe('done')
  })

  it('is stopped at once when it was stopped, however recently it was active', () => {
    expect(subagentState(info({ stopped: true }), 5100)).toBe('stopped')
    expect(subagentState(info({ stopped: true, done: true }), 5100)).toBe('done')
  })

  it('is stopped when it never answered and has gone quiet for ten minutes', () => {
    expect(subagentState(info(), 5000 + 9 * 60_000)).toBe('working')
    expect(subagentState(info(), 5000 + 11 * 60_000)).toBe('stopped')
  })

  it('writes elapsed time the way the world does: tenths under a minute, then minutes and seconds', () => {
    expect([elapsedLabel(400), elapsedLabel(6700), elapsedLabel(65_000), elapsedLabel(3_725_000)]).toEqual(['0.4 s', '6.7 s', '1m 05s', '62m 05s'])
  })
})

describe('styling markdown in place in the message box', () => {
  const kinds = (t: string) => markdownSpans(t).map((p) => [p.kind, p.text])
  const joined = (t: string) => markdownSpans(t).map((p) => p.text).join('')

  it('keeps every character, so the styled copy lines up with what is typed', () => {
    for (const t of ['1. I mean sub-agent only\n2. ', '**bold** and *it* and `code`', '> quoted\n- item', 'a ** b * c ` d', '']) expect(joined(t)).toBe(t)
  })

  it('marks list numbers and bullets, and the words after them stay plain', () => {
    expect(kinds('1. I mean sub-agent only\n2. ')).toEqual([['list', '1. '], ['plain', 'I mean sub-agent only\n'], ['list', '2. ']])
    expect(kinds('- one')).toEqual([['list', '- '], ['plain', 'one']])
  })

  it('styles bold, italic and code with their markers set apart', () => {
    expect(kinds('a **b** c')).toEqual([['plain', 'a '], ['mark', '**'], ['bold', 'b'], ['mark', '**'], ['plain', ' c']])
    expect(kinds('*i*')).toEqual([['mark', '*'], ['italic', 'i'], ['mark', '*']])
    expect(kinds('use `x`')).toEqual([['plain', 'use '], ['mark', '`'], ['code', 'x'], ['mark', '`']])
  })

  it('marks a quote line', () => {
    expect(kinds('> hi')).toEqual([['quote', '> '], ['plain', 'hi']])
  })

  it('leaves stray stars and a half-typed span alone', () => {
    expect(kinds('2 * 3 * 4')).toEqual([['plain', '2 * 3 * 4']])
    expect(kinds('**not closed')).toEqual([['plain', '**not closed']])
  })
})

describe('how long things took', () => {
  const call = (id: string, at: number): ChatItem => ({ kind: 'tool', id, at, toolUseId: id, name: 'Bash', input: { command: 'ls' } })
  const result = (id: string, at: number): ChatItem => ({ kind: 'tool-result', id: `${id}-r`, at, toolUseId: id, text: 'ok', isError: false })
  const think = (id: string, at: number): ChatItem => ({ kind: 'thinking', id, at })

  it('says a span of seconds the way a reply does', () => {
    expect([spanLabel(4), spanLabel(59), spanLabel(72), spanLabel(3600)]).toEqual(['4s', '59s', '1m 12s', '60m 0s'])
  })

  it('gives a tool call the seconds between the call and its result, once they are worth saying', () => {
    const rows = toRows([user('u', t0, 'go'), call('a', t0 + 1000), result('a', t0 + 5400), call('b', t0 + 6000), result('b', t0 + 6300), call('c', t0 + 7000)], [])
    const sec = rows.filter((r) => r.kind === 'tool').map((r) => (r.kind === 'tool' ? r.run.sec : null))
    expect(sec).toEqual([4, undefined, undefined])
  })

  it('gives thinking the seconds since the step before it, summing a run of thinking blocks', () => {
    const rows = toRows([user('u', t0, 'go'), think('t1', t0 + 9000), think('t2', t0 + 12_000), say('a', t0 + 12_500, 'done')], [])
    expect(rows.find((r) => r.kind === 'thinking')).toMatchObject({ took: 12 })
  })

  it('leaves out a thinking time that cannot be true, like one counted from a session picked up hours later', () => {
    const rows = toRows([user('u', t0, 'go'), think('t1', t0 + 3 * 3600_000)], [])
    expect(rows.find((r) => r.kind === 'thinking')).not.toHaveProperty('took')
  })

  it('says nothing for thinking that took under a second, or that has nothing before it', () => {
    expect(toRows([user('u', t0, 'go'), think('t1', t0 + 400)], [])[1]).not.toHaveProperty('took')
    expect(toRows([think('t1', t0 + 9000)], [])[0]).not.toHaveProperty('took')
  })
})

describe('a note with details behind a button', () => {
  it('keeps the button wording the note asked for, and the plain summary wording when it asked for none', () => {
    const hook: ChatItem = { kind: 'note', id: 'h', at: t0, text: 'lint · Stop hook: 2 problems', detail: 'full text', detailLabel: 'details' }
    const summary: ChatItem = { kind: 'note', id: 's', at: t0, text: 'Conversation summary', detail: 'the summary' }
    expect(toRows([hook], [])).toMatchObject([{ kind: 'note', text: 'lint · Stop hook: 2 problems', detail: 'full text', detailLabel: 'details' }])
    expect(toRows([summary], [])[0]).not.toHaveProperty('detailLabel')
  })
})

describe('a hook note belongs to the reply it caused', () => {
  const hook = (id: string, extra: object = {}): ChatItem => ({ kind: 'note', id, at: t0, text: 'lint · Stop hook: 1 problem', detail: 'raw', detailLabel: 'details', hook: { source: 'lint', event: 'Stop', title: '1 problem', findings: [] }, ...extra }) as ChatItem
  const kinds = (items: ChatItem[]) => toRows(items, []).map((r) => r.kind)

  it('rides on the agent reply that comes right after it, and no longer shows as a note of its own', () => {
    const rows = toRows([say('a0', t0 - 1, 'done'), hook('h'), say('a1', t0 + 1, 'fixing it')], [])
    expect(rows.map((r) => r.kind)).toEqual(['assistant', 'assistant'])
    expect(rows[0]).not.toHaveProperty('hooks')
    expect(rows[1]).toMatchObject({ kind: 'assistant', text: 'fixing it', hooks: [{ source: 'lint', event: 'Stop' }] })
  })

  it('reaches over thinking, and keeps several hooks in the order they came', () => {
    const rows = toRows([hook('h1'), hook('h2', { hook: { event: 'PostToolUse:Edit', title: 't', findings: [] } }), { kind: 'thinking', id: 'k', at: t0 }, say('a', t0 + 1, 'ok')], [])
    expect(rows.filter((r) => r.kind === 'assistant')).toMatchObject([{ hooks: [{ event: 'Stop' }, { event: 'PostToolUse:Edit' }] }])
    expect(rows.some((r) => r.kind === 'note')).toBe(false)
  })

  it('stays a note of its own when no reply follows it: at the end, or before a tool or a message of yours', () => {
    expect(kinds([hook('h')])).toEqual(['note'])
    expect(kinds([hook('h'), user('u', t0 + 1, 'next')])).toEqual(['note', 'user'])
    expect(kinds([hook('h'), { kind: 'tool', id: 't', at: t0, toolUseId: 'x', name: 'Bash', input: {} } as ChatItem])).toEqual(['note', 'tool'])
  })

  const flagged = (id: string): ChatItem => hook(id, { hook: { source: 'lint', event: 'Stop', title: 't', issues: 1, findings: [{ ref: 'L1', rule: 'r', text: 'x' }] } })
  const tool = (id: string): ChatItem => ({ kind: 'tool', id, at: t0, toolUseId: id, name: 'Bash', input: {} }) as ChatItem

  it('a note with findings reaches the reply that follows the agent\'s own tool calls, since that is how it answers a hook', () => {
    const rows = toRows([flagged('h'), { kind: 'thinking', id: 'k', at: t0 }, tool('t1'), tool('t2'), say('a', t0 + 1, 'fixed it')], [])
    expect(rows.map((r) => r.kind)).toEqual(['thinking', 'tool', 'tool', 'assistant'])
    expect(rows[3]).toMatchObject({ hooks: [{ event: 'Stop', issues: 1 }] })
  })

  it('a note without findings (a clean scan, or a hook that words things its own way) is not carried over tool calls', () => {
    expect(kinds([hook('h'), tool('t1'), say('a', t0 + 1, 'ok')])).toEqual(['note', 'tool', 'assistant'])
  })

  it('stops at your next message: a note with findings does not jump over it to a later reply', () => {
    expect(kinds([flagged('h'), tool('t1'), user('u', t0 + 1, 'next'), say('a', t0 + 2, 'ok')])).toEqual(['note', 'tool', 'user', 'assistant'])
    expect(toRows([flagged('h'), tool('t1'), user('u', t0 + 1, 'next'), say('a', t0 + 2, 'ok')], []).at(-1)).not.toHaveProperty('hooks')
  })

  it('leaves a note without hook details (the compact summary) alone', () => {
    const summary: ChatItem = { kind: 'note', id: 's', at: t0, text: 'Conversation summary', detail: 'the summary' }
    expect(kinds([summary, say('a', t0 + 1, 'ok')])).toEqual(['note', 'assistant'])
  })
})

describe('system events drawn as chips', () => {
  const ev = (id: string, at: number, extra: object): ChatItem => ({ kind: 'note', id, at, text: 'Wait for backend 8081', event: 'monitor', key: 'm1', ...extra }) as ChatItem
  it('folds a monitor that fires again into its first chip, keeping every line in order, even with a reply between', () => {
    const rows = toRows([say('a', t0, 'waiting'), ev('e1', t0 + 1, { detail: 'refused' }), say('b', t0 + 2, 'still waiting'), ev('e2', t0 + 3, { detail: 'up on :8081' })], [])
    expect(rows.map((r) => r.kind)).toEqual(['assistant', 'events', 'assistant'])
    const chip = (rows[1] as Extract<(typeof rows)[number], { kind: 'events' }>).chips[0]!
    expect(chip.lines).toEqual([{ at: t0 + 1, text: 'refused' }, { at: t0 + 3, text: 'up on :8081' }])
  })
  it('puts events that follow one another into one row of chips, and a message of yours starts a new one', () => {
    const stop = { kind: 'note', id: 's', at: t0 + 5, text: 'Interrupted', event: 'interrupted' } as ChatItem
    const cmd = { kind: 'note', id: 'c', at: t0 + 6, text: 'Set model to opus', event: 'command' } as ChatItem
    const rows = toRows([say('a', t0, 'x'), ev('e1', t0 + 1, {}), stop, cmd, user('u', t0 + 9, 'go on'), stop && { ...stop, id: 's2', at: t0 + 10 } as ChatItem], [])
    expect(rows.map((r) => r.kind)).toEqual(['assistant', 'events', 'user', 'events'])
    expect((rows[1] as { chips: unknown[] }).chips).toHaveLength(3)
  })
  it('can be searched for by what a chip says and what a monitor printed', () => {
    const rows = toRows([ev('e1', t0 + 1, { detail: 'refused on 8081' }), ev('e2', t0 + 3, { detail: 'up on :8081' })], [])
    expect(rowText(rows[0]!)).toContain('Wait for backend 8081')
    expect(rowText(rows[0]!)).toContain('refused on 8081')
    expect(rowText(rows[0]!)).toContain('up on :8081')
  })
  it('leaves a note with no event kind as it was', () => {
    expect(toRows([{ kind: 'note', id: 'n', at: t0, text: 'plain' }], []).map((r) => r.kind)).toEqual(['note'])
  })
})

describe('a monitor, a schedule and what became of them', () => {
  const call = (id: string, name: string, input: Record<string, unknown>, at = t0): ChatItem => ({ kind: 'tool', id, at, toolUseId: `use-${id}`, name, input })
  const answer = (id: string, text: string, at = t0 + 100): ChatItem => ({ kind: 'tool-result', id: `r-${id}`, at, toolUseId: `use-${id}`, text, isError: false })
  const fired = (id: string, at: number, line: string, key = 'bnfx5vv1z'): ChatItem => ({ kind: 'note', id, at, text: 'Wait for the backend', event: 'monitor', key, detail: line })
  const ended = (id: string, at: number, key: string): ChatItem => ({ kind: 'note', id, at, text: '', event: 'monitor', key, ended: true })
  const started = 'Monitor started (task bnfx5vv1z, expires in 4m).'
  const tools = (rows: ReturnType<typeof toRows>) => rows.flatMap((r) => (r.kind === 'tool' ? [r] : []))

  it('puts what a monitor printed on its own call, not on separate chips', () => {
    const rows = toRows([call('m', 'Monitor', { command: 'x' }), answer('m', started), fired('f1', t0 + 9_000, 'waiting…'), fired('f2', t0 + 21_000, 'HTTP/1.1 200 OK')], [])
    expect(rows.map((r) => r.kind)).toEqual(['tool'])
    expect(tools(rows)[0]!.run.firings).toEqual([{ at: t0 + 9_000, text: 'waiting…' }, { at: t0 + 21_000, text: 'HTTP/1.1 200 OK' }])
    expect(tools(rows)[0]!.run.at).toBe(t0)
  })
  it('marks a monitor whose source ended, and leaves the end of anything else out of the chat', () => {
    const rows = toRows([call('m', 'Monitor', { command: 'x' }), answer('m', started), ended('e1', t0 + 35_000, 'bnfx5vv1z'), ended('e2', t0 + 40_000, 'some-subagent')], [])
    expect(rows.map((r) => r.kind)).toEqual(['tool'])
    expect(tools(rows)[0]!.run.ended).toBe(t0 + 35_000)
  })
  it('a monitor it cannot place still reads as chips, as before', () => {
    expect(toRows([fired('f1', t0, 'waiting…', 'unknown-task')], []).map((r) => r.kind)).toEqual(['events'])
  })
  it('a cancel marks the schedule it names, and a stopped loop marks the wake-ups', () => {
    const sch = (id: string, input: Record<string, unknown>, reply: string): ChatItem[] => [call(id, 'Schedule', input), answer(id, reply)]
    const rows = toRows([...sch('a', { cron: '0 9 * * 1-5', repeat: true, prompt: 'x' }, 'Job ID: ab12cd34'), ...sch('b', { inSeconds: 600, prompt: 'y' }, '{}'), call('d', 'Unschedule', { id: 'ab12cd34' }), answer('d', 'ok')], [])
    expect(tools(rows).map((r) => [r.run.name, r.run.cancelled ?? false])).toEqual([['Schedule', true], ['Schedule', false], ['Unschedule', false]])
    const loop = toRows([...sch('b', { inSeconds: 600, prompt: 'y' }, '{}'), call('d', 'Unschedule', {}), answer('d', 'Loop stopped')], [])
    expect(tools(loop)[0]!.run.cancelled).toBe(true)
  })
})

describe('messages waiting in Claude\'s queue, typed in the terminal', () => {
  const queue = (id: string, op: 'enqueue' | 'dequeue' | 'remove', text = ''): ChatItem => ({ kind: 'queue', id, at: t0, op, text })
  it('show as queued rows until Claude takes them: a dequeue takes the oldest, a remove takes the one it names', () => {
    const waiting = (items: ChatItem[]) => toRows(items, []).filter((r) => r.kind === 'user' && r.waiting).map((r) => (r as { text: string }).text)
    expect(waiting([queue('1', 'enqueue', 'done yet'), queue('2', 'enqueue', 'and now?')])).toEqual(['done yet', 'and now?'])
    expect(waiting([queue('1', 'enqueue', 'done yet'), queue('2', 'enqueue', 'and now?'), queue('3', 'dequeue')])).toEqual(['and now?'])
    expect(waiting([queue('1', 'enqueue', 'done yet'), queue('2', 'enqueue', 'and now?'), queue('3', 'remove', 'and now?')])).toEqual(['done yet'])
  })
  it('are marked pending and queued, like one queued from the chat', () => {
    expect(toRows([queue('1', 'enqueue', 'done yet')], [])).toMatchObject([{ kind: 'user', text: 'done yet', pending: true, queued: true, waiting: true }])
  })
  it('are not shown twice when the chat queued the same message', () => {
    const rows = toRows([queue('1', 'enqueue', 'done yet')], [{ id: 'p', text: 'done yet', at: t0, queued: true }])
    expect(rows.filter((r) => r.kind === 'user')).toHaveLength(1)
  })
})
