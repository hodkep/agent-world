import type { ChatItem, SubagentInfo } from '../../shared/chat'
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

export interface PastSession {
  id: string
  title: string
  /** Last modified, ms since epoch. */
  updated: number
  /** Size of the saved conversation on disk. */
  bytes: number
}

/** Where an agent's conversation is kept, and how to read it. */
export interface TranscriptSource {
  /** Follows the conversation, calling `onItems`; `replace` means the items are the whole conversation now (after a rewind). */
  follow(agent: AgentRecord, onItems: (items: ChatItem[], replace: boolean) => void): { start(): void; stop(): void }
  /** The whole saved conversation, read once. */
  readAll(agent: AgentRecord): ChatItem[]
  subagents(agent: AgentRecord): SubagentInfo[]
  /** Sessions saved for this folder, including ones its agents ran in worktrees under `worktreeRoot`. */
  history(folder: string, worktreeRoot: string): Promise<PastSession[]>
  /** The session this agent moved to since `sinceMs` (a rewind forks to a new one), if any. */
  forkedSession(agent: AgentRecord, sinceMs: number): string | null
  /** Forget the instructions the saved session remembers, so a relaunch can give it new ones (a changed role). */
  forgetInstructions(agent: AgentRecord): void
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
  readonly transcript: TranscriptSource
  /** Tells the office what the agents are doing and asking. */
  readonly events: { start(o: EventSourceOptions): Promise<EventHandle> }
  /** Environment for its sessions, without whatever a parent session of the same program left behind. */
  env(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv
  /** Writes this agent's own settings and message-box config; returns their paths. */
  prepare(i: PrepareInput): { settingsFile: string; mcpFile?: string }
  args(i: LaunchInput): string[]
}
