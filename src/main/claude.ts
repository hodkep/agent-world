const OBSERVED = [
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'UserPromptSubmit',
  'Stop',
  'Notification',
  'SubagentStart',
  'SubagentStop',
  'SessionEnd'
] as const

// Observation hooks must never slow Claude down; if the app is gone they fail fast and are ignored.
const OBSERVE_TIMEOUT_SEC = 5
// Claude's own cancel must come after our server's fallback answer, or the user gets no dialog at all.
const PERMISSION_GRACE_SEC = 30

export function hookSettings(o: { url: string; token: string; permissionTimeoutSec: number }) {
  const hook = (timeout: number) => [
    { hooks: [{ type: 'http', url: o.url, timeout, headers: { Authorization: `Bearer ${o.token}` } }] }
  ]
  const hooks: Record<string, ReturnType<typeof hook>> = {}
  for (const e of OBSERVED) hooks[e] = hook(OBSERVE_TIMEOUT_SEC)
  hooks.PermissionRequest = hook(o.permissionTimeoutSec + PERMISSION_GRACE_SEC)
  return { hooks } as { hooks: Record<(typeof OBSERVED)[number] | 'PermissionRequest', ReturnType<typeof hook>> }
}

export function launchArgs(o: { sessionId: string; name: string; started: boolean; settingsFile: string; permissionMode?: string }) {
  const base = o.started
    ? ['--resume', o.sessionId, '--settings', o.settingsFile]
    : ['--session-id', o.sessionId, '--name', o.name, '--settings', o.settingsFile]
  return o.permissionMode ? [...base, '--permission-mode', o.permissionMode] : base
}

// Set by a parent Claude Code session (when this app is started from inside one). Passed on, they make
// every agent a child of that session: no transcript saving, shared messaging socket, host session id.
const HOST_SESSION_VARS = /^(CLAUDECODE|CLAUDE_PID|CLAUDE_EFFORT|CLAUDE_AGENT_SDK_VERSION|CLAUDE_PREVIEW_.*|CLAUDE_CODE_.*)$/
// User configuration that must survive the filter: provider selection and auth/limits knobs.
const USER_CLAUDE_VARS = /^CLAUDE_CODE_(USE_|SKIP_.*_AUTH|MAX_OUTPUT_TOKENS|API_KEY_HELPER)/

export function agentEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([k]) => !HOST_SESSION_VARS.test(k) || USER_CLAUDE_VARS.test(k)))
}
