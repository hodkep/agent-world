import { describe, expect, it } from 'vitest'
import { normalize } from './events'

const base = { session_id: 's1', cwd: '/repo', transcript_path: '/t.jsonl' }

describe('normalize hook payload → AgentEvent', () => {
  it('search tools mean the agent is researching', () => {
    expect(normalize({ ...base, hook_event_name: 'PreToolUse', tool_name: 'Grep', tool_input: { pattern: 'foo' } })).toEqual({
      type: 'activity',
      sessionId: 's1',
      activity: 'researching',
      tool: 'Grep',
      detail: 'foo'
    })
  })

  it('edit tools mean implementing, detail is the file name', () => {
    expect(
      normalize({ ...base, hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: '/repo/src/app.ts' } })
    ).toMatchObject({ activity: 'implementing', detail: 'app.ts' })
  })

  it('Bash means running a command', () => {
    expect(
      normalize({ ...base, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'pnpm test' } })
    ).toMatchObject({ activity: 'running', detail: 'pnpm test' })
  })

  it('spawning a subagent means delegating', () => {
    expect(normalize({ ...base, hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: {} })).toMatchObject({
      activity: 'delegating'
    })
  })

  it('unknown tools (e.g. MCP) fall back to thinking', () => {
    expect(normalize({ ...base, hook_event_name: 'PreToolUse', tool_name: 'mcp__x__y', tool_input: {} })).toMatchObject({
      activity: 'thinking',
      tool: 'mcp__x__y'
    })
  })

  it('tool use inside a subagent is attributed to that subagent', () => {
    expect(
      normalize({ ...base, agent_id: 'sub1', hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: '/a/b.md' } })
    ).toMatchObject({ sessionId: 's1', subagentId: 'sub1', activity: 'researching', detail: 'b.md' })
  })

  it('prompt submit and post-tool mean thinking; Stop means idle', () => {
    expect(normalize({ ...base, hook_event_name: 'UserPromptSubmit', prompt: 'hi' })).toMatchObject({ activity: 'thinking' })
    expect(normalize({ ...base, hook_event_name: 'PostToolUse', tool_name: 'Read' })).toMatchObject({ activity: 'thinking' })
    expect(normalize({ ...base, hook_event_name: 'Stop' })).toMatchObject({ activity: 'idle' })
  })

  it('idle_prompt notification means waiting for the user', () => {
    expect(normalize({ ...base, hook_event_name: 'Notification', notification_type: 'idle_prompt' })).toMatchObject({
      activity: 'waiting'
    })
    expect(normalize({ ...base, hook_event_name: 'Notification', notification_type: 'auth_success' })).toBeNull()
  })

  it('subagent lifecycle', () => {
    expect(normalize({ ...base, hook_event_name: 'SubagentStart', agent_id: 'sub1', agent_type: 'Explore' })).toEqual({
      type: 'subagent-start',
      sessionId: 's1',
      subagentId: 'sub1',
      subagentType: 'Explore'
    })
    expect(normalize({ ...base, hook_event_name: 'SubagentStop', agent_id: 'sub1' })).toEqual({
      type: 'subagent-stop',
      sessionId: 's1',
      subagentId: 'sub1'
    })
  })

  it('session start means the terminal is ready for input', () => {
    expect(normalize({ ...base, hook_event_name: 'SessionStart', source: 'startup' })).toEqual({ type: 'session-start', sessionId: 's1' })
  })

  it('a message to another agent shows who it is for', () => {
    expect(
      normalize({ ...base, hook_event_name: 'PreToolUse', tool_name: 'mcp__agent-world__send_message', tool_input: { to: 'linus', message: 'review auth.ts please' } })
    ).toMatchObject({ activity: 'thinking', detail: '→ linus: review auth.ts please' })
  })

  it('session end', () => {
    expect(normalize({ ...base, hook_event_name: 'SessionEnd' })).toEqual({ type: 'session-end', sessionId: 's1' })
  })

  it('rejects payloads without session id or event name', () => {
    expect(normalize({ hook_event_name: 'Stop' })).toBeNull()
    expect(normalize({ session_id: 's1' })).toBeNull()
    expect(normalize('nope')).toBeNull()
  })

  it('long commands are truncated for speech bubbles', () => {
    const e = normalize({ ...base, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'x'.repeat(200) } })
    expect(e && e.type === 'activity' && e.detail?.length).toBe(60)
  })
})
