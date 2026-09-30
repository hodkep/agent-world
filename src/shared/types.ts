export type Activity =
  | 'idle'
  | 'thinking'
  | 'researching'
  | 'implementing'
  | 'running'
  | 'delegating'
  | 'waiting'
  | 'permission'
  | 'compacting'
  | 'blocked'
  | 'asleep'

/** One of Claude's AskUserQuestion questions, as its hook reports it. */
export interface Question {
  question: string
  header: string
  options: { label: string; description: string }[]
  multiSelect: boolean
}

/** The user's answer: indexes of the chosen options, or free text typed on Claude's "Type something" row (single choice only). */
export interface QuestionAnswer {
  picks: number[]
  other?: string
}

/** What a hook payload says, in the app's terms. `sessionId` is Claude's, and changes on /clear. */
export type RawEvent =
  | { type: 'activity'; sessionId: string; subagentId?: string; activity: Activity; tool?: string; detail?: string; mode?: string }
  | { type: 'task'; sessionId: string; id: string; subject?: string; status?: TaskStatus }
  | { type: 'plan'; sessionId: string; plan: string; steps: string[] }
  | { type: 'question'; sessionId: string; questions: Question[] }
  | { type: 'subagent-start'; sessionId: string; subagentId: string; subagentType: string }
  | { type: 'subagent-stop'; sessionId: string; subagentId: string }
  | { type: 'session-start'; sessionId: string }
  | { type: 'session-end'; sessionId: string }

/** A hook event attributed to the agent whose per-agent token sent it. */
export type AgentEvent = RawEvent & { agentId: string }

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'deleted'

export type Decision = 'allow' | 'deny'

export interface PermissionRequest {
  id: string
  agentId: string
  sessionId: string
  tool: string
  detail: string
}

export type PermissionMode = 'manual' | 'acceptEdits' | 'plan' | 'auto' | 'dontAsk'
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** Chosen in the hire dialog; applied as launch flags every time the agent starts. */
export interface AgentOptions {
  model?: string
  effort?: Effort
  permissionMode?: PermissionMode
  /** Soft cap: the app warns as the session's cost approaches it (Claude only enforces budgets in --print mode). */
  budgetUsd?: number
  instructions?: string
  chrome?: boolean
}

export interface AgentRecord {
  id: string
  name: string
  sessionId: string
  repoPath: string
  cwd: string
  branch: string | null
  /** Branch the worktree was created from; null for agents working directly in a folder. */
  base?: string | null
  // Whether the session has a saved conversation (a turn has begun), so relaunch must use --resume.
  started: boolean
  /** Session this agent was cloned from, forked on its first launch. */
  forkOf?: string
  /** Live state, filled in by list-agents only (not persisted). */
  online?: boolean
  activity?: Activity
  options?: AgentOptions
}

export interface AgentMessage {
  id: string
  fromId: string
  toId: string
  text: string
  status: 'queued' | 'delivered' | 'dropped'
  at: number
}

/** Live numbers from Claude's statusline feed. */
export interface AgentStats {
  sessionId: string
  model: string | null
  contextPct: number | null
  costUsd: number
  linesAdded: number
  linesRemoved: number
  effort: string | null
  fast: boolean
  fiveHourPct: number | null
}
