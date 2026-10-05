import type { AgentOptions, AgentRecord, Capabilities, Detection, ProviderId } from '../../shared/types'

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

/** Everything the core needs from an agent program. The core never names a provider; it asks the registry for one. */
export interface Provider {
  readonly id: ProviderId
  readonly label: string
  /** The program's usual name on the PATH. */
  readonly bin: string
  readonly capabilities: Capabilities
  /** Is it here, and usable? `run` lets tests answer instead of starting a program. */
  detect(bin: string, run?: (file: string, args: string[]) => Promise<string>): Promise<Detection>
  /** Environment for its sessions, without whatever a parent session of the same program left behind. */
  env(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv
  /** Writes this agent's own settings and message-box config; returns their paths. */
  prepare(i: PrepareInput): { settingsFile: string; mcpFile?: string }
  args(i: LaunchInput): string[]
}
