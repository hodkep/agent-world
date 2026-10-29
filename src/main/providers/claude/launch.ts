const OBSERVED = [
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'UserPromptSubmit',
  'Stop',
  'Notification',
  'SubagentStart',
  'SubagentStop',
  'SessionStart',
  'SessionEnd',
  'PreCompact',
  'PostCompact',
  'StopFailure'
] as const

// Observation hooks must never slow Claude down; if the app is gone they fail fast and are ignored.
const OBSERVE_TIMEOUT_SEC = 5
// Claude's own cancel must come after our server's fallback answer, or the user gets no dialog at all.
const PERMISSION_GRACE_SEC = 30

import type { AgentOptions } from '../../../shared/types'

// The statusline command gets Claude's live session JSON on stdin, so the token cannot take curl's stdin as the agy hook does:
// it is read from a private config file (`-K`), never put on the command line, where another user's `ps` would show it.
// Windows PowerShell aliases `curl`, so name the real binary.
export const curlHeaderConfig = (token: string) => `header = "Authorization: Bearer ${token}"\n`

function statusLine(url: string, headerFile: string, platform: NodeJS.Platform) {
  const curl = platform === 'win32' ? 'curl.exe' : 'curl'
  return {
    type: 'command',
    command: `${curl} -s --max-time 2 -X POST -K "${headerFile}" -H "Content-Type: application/json" --data-binary @- ${url}`
  }
}

export function hookSettings(o: { url: string; token: string; headerFile: string; permissionTimeoutSec: number; platform: NodeJS.Platform }) {
  const hook = (timeout: number) => [
    { hooks: [{ type: 'http', url: o.url, timeout, headers: { Authorization: `Bearer ${o.token}` } }] }
  ]
  const hooks: Record<string, ReturnType<typeof hook>> = {}
  for (const e of OBSERVED) hooks[e] = hook(OBSERVE_TIMEOUT_SEC)
  hooks.PermissionRequest = hook(o.permissionTimeoutSec + PERMISSION_GRACE_SEC)
  return {
    hooks: hooks as Record<(typeof OBSERVED)[number] | 'PermissionRequest', ReturnType<typeof hook>>,
    statusLine: statusLine(o.url.replace(/\/hook$/, '/status'), o.headerFile, o.platform)
  }
}

export function launchArgs(o: {
  sessionId: string
  name: string
  started: boolean
  /** Session to fork on the first launch (a clone); afterwards the clone resumes its own session. */
  forkOf?: string
  settingsFile: string
  mcpFile?: string
  /** App-wide default (AW_PERMISSION_MODE); a per-agent option overrides it. */
  permissionMode?: string
  options?: AgentOptions
  /** Settings' standing instructions for every agent. */
  houseRules?: string
  /** Extra folders the agent may read without asking (where attached pictures and files are saved). */
  addDirs?: string[]
  /** Plugins to load for this session only. */
  pluginDirs?: string[]
  /** Tools allowed without asking. */
  allowTools?: string[]
}) {
  const args = o.started
    ? ['--resume', o.sessionId, '--settings', o.settingsFile]
    : o.forkOf
      ? ['--resume', o.forkOf, '--fork-session', '--name', o.name, '--settings', o.settingsFile]
      : ['--session-id', o.sessionId, '--name', o.name, '--settings', o.settingsFile]
  if (o.mcpFile) args.push('--mcp-config', o.mcpFile)
  const opt = o.options ?? {}
  // Continued from claude.ai/code or the phone app, under the agent's name.
  if (opt.remote) args.push('--remote-control', o.name)
  if (opt.model) args.push('--model', opt.model)
  if (opt.effort) args.push('--effort', opt.effort)
  const mode = opt.permissionMode ?? o.permissionMode
  if (mode) args.push('--permission-mode', mode)
  // House rules come first, then what this agent was hired to do.
  const instructions = [o.houseRules, opt.instructions].map((t) => t?.trim()).filter(Boolean).join('\n\n')
  if (instructions) args.push('--append-system-prompt', instructions)
  if (opt.chrome) args.push('--chrome')
  for (const d of o.addDirs ?? []) args.push('--add-dir', d)
  for (const d of o.pluginDirs ?? []) args.push('--plugin-dir', d)
  // Last, because the flag takes every word after it as a tool name.
  if (o.allowTools?.length) args.push('--allowedTools', ...o.allowTools)
  return args
}

/** Per-agent MCP config: same office server for everyone, a token of its own that identifies it. */
export function mcpConfig(o: { url: string; agentToken: string }) {
  return { mcpServers: { 'agent-world': { type: 'http', url: o.url, headers: { Authorization: `Bearer ${o.agentToken}` } } } }
}

// Set by a parent Claude Code session (when this app is started from inside one). Passed on, they make
// every agent a child of that session: no transcript saving, shared messaging socket, host session id.
const HOST_SESSION_VARS = /^(CLAUDECODE|CLAUDE_PID|CLAUDE_EFFORT|CLAUDE_AGENT_SDK_VERSION|CLAUDE_PREVIEW_.*|CLAUDE_CODE_.*)$/
// User configuration that must survive the filter: provider selection and auth/limits knobs.
const USER_CLAUDE_VARS = /^CLAUDE_CODE_(USE_|SKIP_.*_AUTH|MAX_OUTPUT_TOKENS|API_KEY_HELPER)/

export function agentEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([k]) => !HOST_SESSION_VARS.test(k) || USER_CLAUDE_VARS.test(k)))
}


/**
 * Makes Claude Code export the requests it makes (what it read fresh, from its cache, wrote to it and wrote back) to the office's own
 * server, under the agent's own token, so the Usage window counts tokens exactly. Logs only: no metrics, no traces, and no prompt or reply text.
 */
export function telemetryEnv(hookUrl: string, agentToken: string): Record<string, string> {
  if (!hookUrl) return {}
  return {
    CLAUDE_CODE_ENABLE_TELEMETRY: '1',
    OTEL_LOGS_EXPORTER: 'otlp',
    OTEL_METRICS_EXPORTER: 'none',
    OTEL_TRACES_EXPORTER: 'none',
    OTEL_EXPORTER_OTLP_LOGS_PROTOCOL: 'http/json',
    OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: `${new URL(hookUrl).origin}/v1/logs`,
    OTEL_EXPORTER_OTLP_LOGS_HEADERS: `Authorization=Bearer ${agentToken}`
  }
}
