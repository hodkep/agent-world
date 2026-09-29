import { describe, expect, it } from 'vitest'
import { agentEnv, hookSettings, launchArgs } from './claude'

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

  it('passes an explicit permission mode through when one is set', () => {
    expect(launchArgs({ sessionId: 'abc', name: 'ada', started: false, settingsFile: '/s.json', permissionMode: 'default' })).toEqual([
      '--session-id', 'abc', '--name', 'ada', '--settings', '/s.json', '--permission-mode', 'default'
    ])
  })

  it('routes every watched event to our HTTP hook with the token', () => {
    const s = hookSettings({ url: 'http://127.0.0.1:9/hook', token: 't0k', permissionTimeoutSec: 300 })
    const pre = s.hooks.PreToolUse[0]!.hooks[0]!
    expect(pre).toMatchObject({ type: 'http', url: 'http://127.0.0.1:9/hook', headers: { Authorization: 'Bearer t0k' } })
    expect(Object.keys(s.hooks).sort()).toEqual(
      ['Notification', 'PermissionRequest', 'PostToolUse', 'PostToolUseFailure', 'PreToolUse', 'SessionEnd', 'Stop', 'SubagentStart', 'SubagentStop', 'UserPromptSubmit'].sort()
    )
  })

  it('gives Claude a longer permission hook timeout than ours, so our fallback answer always lands first', () => {
    const s = hookSettings({ url: 'u', token: 't', permissionTimeoutSec: 300 })
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
