import type { AgentEvent, AgentOptions, AgentRecord, AgentStats, Capabilities, Decision, Detection, PermissionRequest, ProviderId } from '../../shared/types'

export interface LaunchInput {
  agent: AgentRecord
  /** Per-agent files from `prepare`. */
  files: { settingsFile: string; mcpFile?: string }
  permissionMode?: string
  options?: AgentOptions
  houseRules?: string
  addDirs?: string[]
}

export interface PrepareInput {
  /** Where this agent's own files go: ~/.agent-world/agents/<id>/. Providers never write elsewhere. */
  dir: string
  hookUrl: string
  mcpUrl: string
  agentToken: string
  permissionTimeoutSec: number
  platform: NodeJS.Platform
}

export interface EventSourceOptions {
  /** Each agent's calls carry its own token; the token says which agent is talking. */
  agentForToken: (token: string) => string | null
  permissionTimeoutMs: number
  onEvent: (e: AgentEvent) => void
  onPermission: (r: PermissionRequest) => void
  onPermissionSettled: (id: string) => void
  onStatus: (s: AgentStats, agentId: string) => void
  /** What each tool call was given, as JSON: the addresses an agent works with turn up here (a browser tool's URL, a curl). */
  onToolInput?: (agentId: string, json: string) => void
}

/** A running listener for one provider's agents. */
export interface EventHandle {
  /** Where this provider's agents send their events; goes into their per-agent files. */
  url: string
  decide(requestId: string, d: Decision): void
  /** The agent's terminal prompt went away (answered there): drop its cards and resume what it asked about. */
  dismiss(agentId: string): void
  hasPending(agentId: string): boolean
  close(): void
}

/** Everything the core needs from an agent program. The core never names a provider; it asks the registry for one. */
export interface Provider {
  readonly id: ProviderId
  readonly label: string
  /** The program's usual name on the PATH. */
  readonly bin: string
  readonly capabilities: Capabilities
  /** Is it here, and usable? `run` lets tests answer instead of starting a program. */
  detect(bin: string, run?: (file: string, args: string[]) => Promise<string>): Promise<Detection>
  /** Tells the office what the agents are doing and asking. */
  readonly events: { start(o: EventSourceOptions): Promise<EventHandle> }
  /** Environment for its sessions, without whatever a parent session of the same program left behind. */
  env(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv
  /** Writes this agent's own settings and message-box config; returns their paths. */
  prepare(i: PrepareInput): { settingsFile: string; mcpFile?: string }
  args(i: LaunchInput): string[]
}
