import { describe, expect, it } from 'vitest'
import { agentEnv, hookSettings, launchArgs, mcpConfig } from './launch'

describe('claude launch', () => {
  it('starts a fresh session with a fixed id and name', () => {
    expect(launchArgs({ sessionId: 'abc', name: 'ada', started: false, settingsFile: '/s.json' })).toEqual([
      '--session-id', 'abc', '--name', 'ada', '--settings', '/s.json'
    ])
  })

  it('resumes a session that already ran', () => {
    expect(launchArgs({ sessionId: 'abc', name: 'ada', started: true, settingsFile: '/s.json' })).toEqual([
      '--resume', 'abc', '--settings', '/s.json'
    ])
  })

  it('forks another session on its first launch, then resumes its own', () => {
    const o = { sessionId: 'new', name: 'ada2', forkOf: 'src', settingsFile: '/s.json' }
    expect(launchArgs({ ...o, started: false })).toEqual(['--resume', 'src', '--fork-session', '--name', 'ada2', '--settings', '/s.json'])
    expect(launchArgs({ ...o, started: true })).toEqual(['--resume', 'new', '--settings', '/s.json'])
  })

  it('lets the agent read the folder where attachments are kept without asking', () => {
    expect(launchArgs({ sessionId: 'abc', name: 'ada', started: false, settingsFile: '/s.json', addDirs: ['/home/aw/attachments'] })).toEqual([
      '--session-id', 'abc', '--name', 'ada', '--settings', '/s.json', '--add-dir', '/home/aw/attachments'
    ])
  })

  it('passes an explicit permission mode through when one is set', () => {
    expect(launchArgs({ sessionId: 'abc', name: 'ada', started: false, settingsFile: '/s.json', permissionMode: 'default' })).toEqual([
      '--session-id', 'abc', '--name', 'ada', '--settings', '/s.json', '--permission-mode', 'default'
    ])
  })

  it('gives each agent the office MCP server under its own identity', () => {
    expect(launchArgs({ sessionId: 'abc', name: 'ada', started: false, settingsFile: '/s.json', mcpFile: '/m.json' })).toEqual([
      '--session-id', 'abc', '--name', 'ada', '--settings', '/s.json', '--mcp-config', '/m.json'
    ])
    expect(mcpConfig({ url: 'http://127.0.0.1:9/mcp', agentToken: 'secret-a1' })).toEqual({
      mcpServers: { 'agent-world': { type: 'http', url: 'http://127.0.0.1:9/mcp', headers: { Authorization: 'Bearer secret-a1' } } }
    })
  })

  it('launches with the options chosen when hiring', () => {
    const args = launchArgs({
      sessionId: 'abc', name: 'ada', started: false, settingsFile: '/s.json',
      options: { model: 'sonnet', effort: 'high', permissionMode: 'acceptEdits', instructions: 'Prefer small commits.', chrome: true }
    })
    expect(args).toEqual([
      '--session-id', 'abc', '--name', 'ada', '--settings', '/s.json',
      '--model', 'sonnet', '--effort', 'high', '--permission-mode', 'acceptEdits', '--append-system-prompt', 'Prefer small commits.', '--chrome'
    ])
  })

  it('a resumed session relaunches with its current model and effort, so switching never touches global settings', () => {
    expect(launchArgs({ sessionId: 'abc', name: 'ada', started: true, settingsFile: '/s.json', options: { model: 'opus', effort: 'max' } })).toEqual([
      '--resume', 'abc', '--settings', '/s.json', '--model', 'opus', '--effort', 'max'
    ])
  })

  it('an explicit hire option wins over the app-wide permission mode', () => {
    const args = launchArgs({ sessionId: 'abc', name: 'ada', started: false, settingsFile: '/s.json', permissionMode: 'manual', options: { permissionMode: 'plan' } })
    expect(args.slice(-2)).toEqual(['--permission-mode', 'plan'])
  })

  it('pipes the statusline JSON to the app with curl, and curl.exe on Windows', () => {
    const mac = hookSettings({ url: 'http://127.0.0.1:9/hook', token: 't', permissionTimeoutSec: 300, platform: 'darwin' })
    expect(mac.statusLine).toEqual({
      type: 'command',
      command: 'curl -s --max-time 2 -X POST -H "Authorization: Bearer t" -H "Content-Type: application/json" --data-binary @- http://127.0.0.1:9/status'
    })
    const win = hookSettings({ url: 'http://127.0.0.1:9/hook', token: 't', permissionTimeoutSec: 300, platform: 'win32' })
    expect(win.statusLine.command.startsWith('curl.exe ')).toBe(true)
  })

  it('routes every watched event to our HTTP hook with the token', () => {
    const s = hookSettings({ url: 'http://127.0.0.1:9/hook', token: 't0k', permissionTimeoutSec: 300, platform: 'darwin' })
    const pre = s.hooks.PreToolUse[0]!.hooks[0]!
    expect(pre).toMatchObject({ type: 'http', url: 'http://127.0.0.1:9/hook', headers: { Authorization: 'Bearer t0k' } })
    expect(Object.keys(s.hooks).sort()).toEqual(
      ['Notification', 'PermissionRequest', 'PostCompact', 'PostToolUse', 'PostToolUseFailure', 'PreCompact', 'PreToolUse', 'SessionEnd', 'SessionStart', 'Stop', 'StopFailure', 'SubagentStart', 'SubagentStop', 'UserPromptSubmit'].sort()
    )
  })

  it('gives Claude a longer permission hook timeout than ours, so our fallback answer always lands first', () => {
    const s = hookSettings({ url: 'http://127.0.0.1:9/hook', token: 't', permissionTimeoutSec: 300, platform: 'darwin' })
    expect(s.hooks.PermissionRequest[0]!.hooks[0]!.timeout).toBeGreaterThan(300)
    expect(s.hooks.PreToolUse[0]!.hooks[0]!.timeout).toBeLessThanOrEqual(5)
  })
})

describe('agent environment', () => {
  it('drops the launching Claude session\'s link variables so each agent is its own session', () => {
    const env = agentEnv({
      PATH: '/bin',
      CLAUDECODE: '1',
      CLAUDE_PID: '9',
      CLAUDE_CODE_CHILD_SESSION: '1',
      CLAUDE_CODE_SESSION_ID: 'host',
      CLAUDE_CODE_MESSAGING_TOKEN: 'secret',
      CLAUDE_CODE_ENTRYPOINT: 'desktop',
      CLAUDE_PREVIEW_CLASSIFIER_FLOOR: 'x'
    })
    expect(env).toEqual({ PATH: '/bin' })
  })

  it('keeps the user\'s own provider and API configuration', () => {
    const env = agentEnv({ CLAUDE_CODE_USE_BEDROCK: '1', ANTHROPIC_API_KEY: 'k', ANTHROPIC_BASE_URL: 'u', AWS_REGION: 'r' })
    expect(env).toEqual({ CLAUDE_CODE_USE_BEDROCK: '1', ANTHROPIC_API_KEY: 'k', ANTHROPIC_BASE_URL: 'u', AWS_REGION: 'r' })
  })
})


describe('house rules', () => {
  const base = { sessionId: 'abc', name: 'ada', started: false, settingsFile: '/s.json' }
  const prompt = (a: string[]) => a[a.indexOf('--append-system-prompt') + 1]
  it('come before the agent\'s own instructions', () => {
    expect(prompt(launchArgs({ ...base, houseRules: ' Small commits. ', options: { instructions: 'Review only.' } }))).toBe('Small commits.\n\nReview only.')
  })
  it('stand alone when the agent has none, and add nothing when empty', () => {
    expect(prompt(launchArgs({ ...base, houseRules: 'Small commits.' }))).toBe('Small commits.')
    expect(launchArgs({ ...base, houseRules: '  ' })).not.toContain('--append-system-prompt')
  })

  it('loads each plugin folder for this session only', () => {
    const args = launchArgs({ sessionId: 'abc', name: 'ada', started: false, settingsFile: '/s.json', addDirs: ['/lib'], pluginDirs: ['/lib/run/a1'] })
    expect(args.slice(-4)).toEqual(['--add-dir', '/lib', '--plugin-dir', '/lib/run/a1'])
    expect(launchArgs({ sessionId: 'abc', name: 'ada', started: false, settingsFile: '/s.json' })).not.toContain('--plugin-dir')
  })

  it('allows the tools it is told to without asking, as the last flag', () => {
    const args = launchArgs({ sessionId: 'abc', name: 'ada', started: false, settingsFile: '/s.json', pluginDirs: ['/p'], allowTools: ['mcp__agent-world__library_get', 'mcp__agent-world__library_index'] })
    expect(args.slice(-3)).toEqual(['--allowedTools', 'mcp__agent-world__library_get', 'mcp__agent-world__library_index'])
    expect(launchArgs({ sessionId: 'abc', name: 'ada', started: false, settingsFile: '/s.json' })).not.toContain('--allowedTools')
  })
})
