import type { AgentEvent, AgentRecord, Decision, PermissionRequest } from './types'

export type RemoveResult = { ok: true } | { ok: false; dirty: string }

export interface AwApi {
  pickFolder(): Promise<string | null>
  listAgents(): Promise<AgentRecord[]>
  addAgent(folder: string): Promise<AgentRecord>
  wakeAgent(id: string): Promise<void>
  removeAgent(id: string, mode?: 'discard' | 'keep-worktree'): Promise<RemoveResult>
  ptyWrite(id: string, data: string): void
  ptyResize(id: string, cols: number, rows: number): void
  // `end` is the stream offset after the returned text, so live chunks already in it can be skipped.
  ptyBuffer(id: string): Promise<{ text: string; end: number }>
  decide(requestId: string, d: Decision): void
  answerTrust(agentId: string, trust: boolean): void
  onAgentEvent(cb: (e: AgentEvent) => void): () => void
  onPtyData(cb: (id: string, data: string, end: number) => void): () => void
  onPtyExit(cb: (id: string) => void): () => void
  onPermission(cb: (r: PermissionRequest) => void): () => void
  onPermissionSettled(cb: (id: string) => void): () => void
  /** Claude's "trust this folder?" menu opened (path) or closed (null) in an agent's terminal. */
  onTrustPrompt(cb: (agentId: string, path: string | null) => void): () => void
}
