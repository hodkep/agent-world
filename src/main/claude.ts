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

export function launchArgs(o: { sessionId: string; name: string; started: boolean; settingsFile: string }) {
  return o.started
    ? ['--resume', o.sessionId, '--settings', o.settingsFile]
    : ['--session-id', o.sessionId, '--name', o.name, '--settings', o.settingsFile]
}
