import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { newestSession, parseTranscriptLine, transcriptPath } from './chat'

const line = (o: object) => JSON.stringify(o)
const base = { uuid: 'u1', timestamp: '2026-09-30T07:33:23.872Z', isSidechain: false }

describe('a subagent\'s own lines', () => {
  it('are left out of the main conversation and kept when asked for', () => {
    const side = line({ ...base, isSidechain: true, type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'from the subagent' }] } })
    expect(parseTranscriptLine(side)).toEqual([])
    expect(parseTranscriptLine(side, { subagent: true })).toMatchObject([{ kind: 'assistant', text: 'from the subagent' }])
  })
})

describe('reading Claude\'s transcript for the chat view', () => {
  it('turns a typed prompt into a user message', () => {
    expect(parseTranscriptLine(line({ ...base, type: 'user', message: { role: 'user', content: 'add a health check' } }))).toEqual([
      { kind: 'user', id: 'u1', at: Date.parse(base.timestamp), text: 'add a health check' }
    ])
  })

  it('reads slash commands and their output from the wrapper tags Claude saves', () => {
    const cmd = '<command-name>/compact</command-name>\n<command-message>compact</command-message>\n<command-args>keep notes</command-args>'
    expect(parseTranscriptLine(line({ ...base, type: 'user', message: { role: 'user', content: cmd } }))).toMatchObject([{ kind: 'command', name: '/compact', args: 'keep notes' }])
    const out = '<local-command-stdout>Set model to opus</local-command-stdout>'
    expect(parseTranscriptLine(line({ ...base, type: 'user', message: { role: 'user', content: out } }))).toMatchObject([{ kind: 'note', text: 'Set model to opus' }])
  })

  it('shows a message typed while Claude was busy, which Claude saves as a queued command and not as a user line', () => {
    const queued = (prompt: string, origin: object | null) => line({ ...base, type: 'attachment', attachment: { type: 'queued_command', prompt, origin, commandMode: 'prompt' } })
    expect(parseTranscriptLine(queued('also add a test', { kind: 'human' }))).toEqual([{ kind: 'user', id: 'u1', at: Date.parse(base.timestamp), text: 'also add a test' }])
    // A finished background task is not something the user said.
    expect(parseTranscriptLine(queued('<task-notification>done</task-notification>', null))).toEqual([])
    expect(parseTranscriptLine(queued('hand-back', { kind: 'peer' }))).toEqual([])
  })

  it('shows what a hook told the agent as a note: who said it, and the full text behind a button', () => {
    const hook = (hookName: string, content: string[]) => line({ ...base, type: 'attachment', attachment: { type: 'hook_additional_context', hookName, hookEvent: hookName.split(':')[0], content } })
    const findings = '[impeccable@1] Design hook findings requiring review in src/renderer/styles.css (1 issue(s)):\n- L962 [side-tab] Side-tab accent border.\n\nTriage per the session policy.'
    expect(parseTranscriptLine(hook('Stop', [findings]))).toEqual([
      {
        kind: 'note',
        id: 'u1',
        at: Date.parse(base.timestamp),
        text: 'impeccable@1 · Stop hook: Design hook findings requiring review in src/renderer/styles.css (1 issue(s))',
        detail: findings,
        detailLabel: 'details',
        event: 'hook',
        tone: 'bad',
        hook: { source: 'impeccable@1', event: 'Stop', title: 'Design hook findings requiring review in src/renderer/styles.css', issues: 1, findings: [{ ref: 'L962', rule: 'side-tab', text: 'Side-tab accent border.' }] }
      }
    ])
    expect(parseTranscriptLine(hook('PostToolUse:Edit', ['[lint] 2 problems']))).toMatchObject([{ text: 'lint · PostToolUse:Edit hook: 2 problems' }])
    // Findings are told apart one per line; a hook that words things its own way keeps its text whole.
    const three = '[impeccable@1] Design hook findings requiring review in src/a.css (3 issue(s)):\n- L1 [side-tab] One.\n- L2 [design-system-color] Two: with a colon.\n- L3 [side-tab] Three.'
    expect(parseTranscriptLine(hook('Stop', [three]))).toMatchObject([{ hook: { issues: 3, findings: [{ ref: 'L1', rule: 'side-tab', text: 'One.' }, { ref: 'L2', rule: 'design-system-color', text: 'Two: with a colon.' }, { ref: 'L3', rule: 'side-tab', text: 'Three.' }] } }])
    expect(parseTranscriptLine(hook('PostToolUse:Write', ['[impeccable@1] Design hook scanned src/a.tsx. No deterministic design-quality issues found. That does not mean the design is good.']))).toMatchObject([{ hook: { source: 'impeccable@1', event: 'PostToolUse:Write', findings: [] } }])
    expect(parseTranscriptLine(hook('PostToolUse:Edit', ['[lint] 2 problems']))).toMatchObject([{ hook: { source: 'lint', title: '2 problems', findings: [] } }])
    // No source in brackets: the hook's own name is all there is.
    expect(parseTranscriptLine(hook('UserPromptSubmit', ['remember the budget']))).toMatchObject([{ text: 'UserPromptSubmit hook: remember the budget', detail: 'remember the budget' }])
    // The playbook's rulebook reminder is not a note: the mark under the message already says it was sent, and what it said.
    expect(parseTranscriptLine(hook('UserPromptSubmit', ['Reminder: tdd (building a feature, test first); research (looking something up). Decide silently which of these apply to this request; do not mention this in your reply.']))).toEqual([])
    expect(parseTranscriptLine(hook('UserPromptSubmit', ['Library items and when each applies. Read one with library_get(id) before the task it covers.\n- tdd: implementing new behaviour']))).toEqual([])
    // Someone else's reminder is still shown.
    expect(parseTranscriptLine(hook('UserPromptSubmit', ['Reminder: bring the budget to the meeting']))).toMatchObject([{ hook: { findings: [] } }])
    // What a session starts with is the user's own setup, not news.
    expect(parseTranscriptLine(hook('SessionStart', ['CAVEMAN MODE ACTIVE']))).toEqual([])
    expect(parseTranscriptLine(hook('Stop', ['  ']))).toEqual([])
    expect(parseTranscriptLine(line({ ...base, type: 'attachment', attachment: { type: 'hook_success' } }))).toEqual([])
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

describe('compaction in the chat view', () => {
  it('turns the compact summary into a note, not a user message', () => {
    const text = 'This session is being continued from a previous conversation...'
    expect(parseTranscriptLine(line({ ...base, type: 'user', isCompactSummary: true, message: { role: 'user', content: text } }))).toMatchObject([{ kind: 'note', text: 'Conversation summary', detail: text }])
  })

  it('says what the boundary compacted', () => {
    const o = { ...base, type: 'system', subtype: 'compact_boundary', content: 'Conversation compacted', compactMetadata: { trigger: 'manual', preTokens: 71000, postTokens: 18000, durationMs: 35000 } }
    expect(parseTranscriptLine(line(o))).toMatchObject([{ kind: 'note', text: 'Conversation compacted · 71k → 18k tokens (manual, 35s)' }])
  })

  it('strips colour codes from command output, with or without the escape byte', () => {
    const out = (t: string) => parseTranscriptLine(line({ ...base, type: 'user', message: { role: 'user', content: `<local-command-stdout>${t}</local-command-stdout>` } }))
    expect(out('\x1b[2mCompacted (ctrl+o to see full summary)\x1b[22m')).toEqual([])
    expect(out('[2mCompacted[22m')).toEqual([])
    expect(out('[2mSomething else[22m')).toMatchObject([{ text: 'Something else' }])
    expect(out('PreCompact [x] completed successfully\nPostCompact [y] completed successfully')).toEqual([])
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

describe('messages the harness adds about subagents', () => {
  const line = (o: object) => JSON.stringify({ uuid: 'u1', timestamp: '2026-01-01T00:00:00Z', ...o })
  const handback = 'Another Claude session sent a message:\n<agent-message from="a1">\n[Subagent hand-back] Model output. The report follows:\n  Found it.\n</agent-message>\n\nThat other session is an agent.'
  const notice = (status: string) => `<task-notification>\n<task-id>a1</task-id>\n<status>${status}</status>\n<summary>Agent "Map" ${status}</summary>\n</task-notification>`

  it('shows a hand-back report as a report, though the line is marked as not typed by the user', () => {
    expect(parseTranscriptLine(line({ type: 'user', isMeta: true, message: { role: 'user', content: handback } }))).toEqual([{ kind: 'subagent-report', id: 'u1', at: Date.parse('2026-01-01T00:00:00Z'), agentId: 'a1', body: 'Found it.' }])
  })

  it('says a task completed only as its end (the chat shows it on a monitor\'s own card and nowhere else), and says so briefly when it ended some other way', () => {
    expect(parseTranscriptLine(line({ type: 'user', message: { role: 'user', content: notice('completed') } }))).toMatchObject([{ kind: 'note', event: 'monitor', key: 'a1', ended: true, text: '' }])
    expect(parseTranscriptLine(line({ type: 'user', message: { role: 'user', content: '<task-notification>\n<status>completed</status>\n<summary>x</summary>\n</task-notification>' } }))).toEqual([])
    expect(parseTranscriptLine(line({ type: 'user', message: { role: 'user', content: notice('failed') } }))).toMatchObject([{ kind: 'note', text: 'Agent "Map" failed' }])
  })

  it('keeps what a Monitor printed, under the monitor\'s name, and not the instruction the harness adds for the agent', () => {
    const monitor = (event: string) => `<task-notification>\n<task-id>bq1</task-id>\n<summary>Monitor event: "Wait for backend 8081"</summary>\n<event>${event}</event>\nIf this event is something the user would act on now, send a PushNotification. Routine or benign output doesn't need one.\n</task-notification>`
    const [one] = parseTranscriptLine(line({ type: 'user', message: { role: 'user', content: monitor('curl: (7) Failed to connect\nretrying') } }))
    expect(one).toMatchObject({ kind: 'note', event: 'monitor', key: 'bq1', text: 'Wait for backend 8081', detail: 'curl: (7) Failed to connect\nretrying' })
    expect(JSON.stringify(one)).not.toContain('PushNotification')
    // A monitor that ends is not news: it is only marked, and the chat puts the mark on the monitor's card.
    expect(parseTranscriptLine(line({ type: 'user', message: { role: 'user', content: '<task-notification>\n<task-id>bq1</task-id>\n<status>completed</status>\n<summary>Monitor "Wait for backend 8081" stream ended</summary>\n</task-notification>' } }))).toMatchObject([{ kind: 'note', key: 'bq1', ended: true }])
  })

  it('marks a task that ended badly, an interrupt and a command\'s output, so the chat can draw each as an event', () => {
    const bad = '<task-notification>\n<task-id>b9</task-id>\n<status>failed</status>\n<summary>Background command "npm run e2e" failed with exit code 1</summary>\n</task-notification>'
    expect(parseTranscriptLine(line({ type: 'user', message: { role: 'user', content: bad } }))).toMatchObject([{ kind: 'note', event: 'failed', tone: 'bad', text: 'Background command "npm run e2e" failed with exit code 1' }])
    expect(parseTranscriptLine(line({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user]' }] } }))).toMatchObject([{ kind: 'note', event: 'interrupted', text: 'Interrupted' }])
    expect(parseTranscriptLine(line({ type: 'user', message: { role: 'user', content: '<local-command-stdout>Set model to opus\nmore</local-command-stdout>' } }))).toMatchObject([{ kind: 'note', event: 'command', text: 'Set model to opus', detail: 'more' }])
  })

  it('still drops other lines marked as not typed by the user', () => {
    expect(parseTranscriptLine(line({ type: 'user', isMeta: true, message: { role: 'user', content: 'caveat: something' } }))).toEqual([])
  })
})

describe('messages waiting in Claude\'s queue', () => {
  const q = (operation: string, extra: object = {}) => JSON.stringify({ type: 'queue-operation', operation, timestamp: '2026-10-02T10:01:01.472Z', sessionId: 's', ...extra })
  it('are items of their own: one when a message is queued, one when Claude takes it up or absorbs it', () => {
    expect(parseTranscriptLine(q('enqueue', { content: 'done yet' }))).toMatchObject([{ kind: 'queue', op: 'enqueue', text: 'done yet' }])
    expect(parseTranscriptLine(q('dequeue'))).toMatchObject([{ kind: 'queue', op: 'dequeue', text: '' }])
    expect(parseTranscriptLine(q('remove', { content: 'done yet', reason: 'absorbed_mid_turn' }))).toMatchObject([{ kind: 'queue', op: 'remove', text: 'done yet' }])
  })
  it('ignore an operation they do not know', () => {
    expect(parseTranscriptLine(q('something-else', { content: 'x' }))).toEqual([])
  })
})
