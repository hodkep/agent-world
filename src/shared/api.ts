import type { UsageLimits } from './usage'
import type { AgentEvent, AgentMessage, AgentOptions, AgentRecord, AgentStats, Decision, PermissionRequest, QuestionAnswer } from './types'

export type RemoveResult = { ok: true } | { ok: false; dirty: string }
export type ChangeStatus = 'added' | 'modified' | 'deleted'
export interface Changes {
  base: string
  branch: string | null
  files: { path: string; status: ChangeStatus }[]
}

export interface PaletteCommand {
  name: string
  description: string
  source: 'built-in' | 'project skill' | 'project command' | 'your skill' | 'your command'
  args: boolean
}

export interface PastSession {
  id: string
  title: string
  updated: number
  /** An agent in this app already runs it. */
  inUse: boolean
  agentId?: string
  agentName?: string
}

export interface ToolsInfo {
  mcp: { name: string; target: string; health: 'ok' | 'attention' | 'failed'; status: string }[]
  plugins: { id: string; version: string; scope: string; enabled: boolean }[]
}

export interface WorkspaceInfo {
  path: string
  name: string
  exists: boolean
  /** Git is optional: agents in a git folder get their own branch and worktree, others share the folder. */
  git: boolean
  agents: number
  /** Remembered because an agent has worked here (as opposed to just being open right now). */
  saved: boolean
}
export interface Workspaces {
  /** The folder to open in: the one used last, if it is still there. */
  active: string | null
  items: WorkspaceInfo[]
}

/** One agent's unmerged work, as the delivery vans show it. */
export interface DockStatus {
  agentId: string
  name: string
  branch: string
  base: string
  ahead: number
  dirty: number
}

export interface CodeApi {
  changes(agentId: string): Promise<Changes>
  diff(agentId: string, path: string): Promise<{ original: string; current: string }>
  files(agentId: string): Promise<string[]>
  read(agentId: string, path: string): Promise<string>
  write(agentId: string, path: string, content: string): Promise<void>
  commit(agentId: string, message: string): Promise<void>
  discard(agentId: string, path: string): Promise<void>
  /** Merges the agent's branch into its base branch in the user's checkout; returns the base branch name. */
  merge(agentId: string): Promise<string>
  /** Pushes the branch and opens a pull request; returns the PR URL. */
  pr(agentId: string): Promise<string>
}

export interface AwApi {
  /** Absolute path of a file dropped into the window ('' if it is not on disk). */
  pathOf(file: File): string
  pickFolder(): Promise<string | null>
  getWorkspaces(): Promise<Workspaces>
  activateWorkspace(path: string): Promise<Workspaces>
  forgetWorkspace(path: string): Promise<Workspaces>
  listAgents(): Promise<AgentRecord[]>
  addAgent(folder: string, options?: AgentOptions, name?: string): Promise<AgentRecord>
  /** Relaunch the agent's session with a different model or effort (between turns only). */
  reconfigure(agentId: string, change: Pick<AgentOptions, 'model' | 'effort'>): Promise<void>
  /** Renames the agent (unique, plain characters); resolves to the cleaned name. */
  renameAgent(id: string, name: string): Promise<string>
  /** A second agent that continues a copy of this one's conversation, in its own worktree branched from this one's. */
  cloneAgent(id: string): Promise<AgentRecord>
  /** Earlier Claude conversations in this folder (and worktrees of it), newest first. */
  listHistory(folder: string): Promise<PastSession[]>
  /** Continue that conversation as a new agent. */
  resumeSession(folder: string, sessionId: string): Promise<AgentRecord>
  /** MCP servers and plugins available to this agent (runs `claude mcp list`, which health-checks each server: slow). */
  listTools(agentId: string): Promise<ToolsInfo>
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
  onAgentMessage(cb: (m: AgentMessage) => void): () => void
  onAgentStats(cb: (agentId: string, s: AgentStats) => void): () => void
  /** The subscription's 5-hour and weekly usage, as last reported by any agent. */
  getUsage(): Promise<UsageLimits>
  getDock(): Promise<DockStatus[]>
  onDock(cb: (d: DockStatus[]) => void): () => void
  onUsage(cb: (u: UsageLimits) => void): () => void
  onBudgetAlert(cb: (agentId: string, level: 'near' | 'over') => void): () => void
  /** Claude's plan approval menu opened (true) or closed (false) in an agent's terminal. */
  onPlanMenu(cb: (agentId: string, open: boolean) => void): () => void
  listCommands(agentId: string): Promise<PaletteCommand[]>
  /** Types /name args into the agent's terminal, between turns only. */
  runCommand(agentId: string, name: string, args: string): Promise<void>
  /** 0: approve and auto-accept edits · 1: approve, review each edit · 2: keep planning, with feedback. */
  answerPlan(agentId: string, choice: 0 | 1 | 2, feedback?: string): Promise<void>
  /** Claude's question menu opened (true) or closed (false) in an agent's terminal. */
  onQuestionMenu(cb: (agentId: string, open: boolean) => void): () => void
  /** Answers the open question menu key by key; rejects if the menu stopped matching (then finish it in the terminal). */
  answerQuestions(agentId: string, answers: QuestionAnswer[]): Promise<void>
  /** A notification was clicked: bring that agent up. */
  onSelectAgent(cb: (agentId: string) => void): () => void
  code: CodeApi
}
