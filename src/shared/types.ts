import type { UsageLimits } from './usage'
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
  /** Claude's permission mode changed, as read from the footer of its screen (hooks only report it on their next event). */
  | { type: 'mode'; sessionId: string; mode: string }
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
  /** The job this agent was hired for (a role's title), shown next to its name. */
  role?: string
  /** Work in the folder itself instead of a worktree on its own branch. */
  inPlace?: boolean
}

/** The agent programs the office can run. */
export type ProviderId = 'claude' | 'agy'

/** What a provider can do; the screens hide what it cannot, instead of showing it broken. */
export interface Capabilities {
  permissionsInWorld: boolean
  liveModeSwitch: boolean
  subagents: boolean
  rewind: boolean
  compact: boolean
  limits: boolean
  tools: boolean
}

/** What the machine says about a provider: whether it can be used now, and what to do if not. */
export interface Detection {
  state: 'ready' | 'needs-sign-in' | 'not-installed' | 'unsupported'
  version?: string
  path?: string
  /** What to tell the user, e.g. "Run `agy` once to sign in". */
  hint?: string
}

export interface AgentRecord {
  id: string
  /** Which program runs this agent. Agents saved before providers existed are Claude Code. */
  provider?: ProviderId
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
  /** The agent this one was cloned from, so it sits next to it in the office. */
  cloneOf?: string
  /** A label the roster groups agents under, chosen by the user. */
  group?: string
  /** When it was hired (ms since 1970); older agents were hired before this was kept. */
  hiredAt?: number
  /** Milliseconds it has spent working, added up as it goes. */
  workedMs?: number
  /** The running cost Claude last reported, so the next report adds only what is new to the usage history. */
  costSeen?: number
  /** Live state, filled in by list-agents only (not persisted). */
  online?: boolean
  activity?: Activity
  options?: AgentOptions
}

/** What the profile card shows beyond the live numbers: counted or looked up on demand. */
export interface AgentProfile {
  hiredAt: number | null
  /** The hire time was worked out from its folder or conversation, not stored. */
  hiredEstimated: boolean
  workedMs: number
  turns: number
  tools: [string, number][]
  files: number
  subagents: number
  /** Commits on its branch beyond where it started; null when it has no branch of its own. */
  commits: number | null
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
  limits: UsageLimits
}

/** A choice menu Claude is showing in its own terminal (a permission dialog it insists on, the rewind confirmation…). */
/** A process running under an agent (a dev server, a long command). */
export interface ProcInfo {
  pid: number
  command: string
}

export interface TerminalMenu {
  title: string
  context: string
  options: string[]
  hint: string
}

/** Changes to the MCP servers and plugins an agent's Claude uses. */
export type ManageAction =
  | { kind: 'mcp-add-http'; name: string; url: string }
  | { kind: 'mcp-add-stdio'; name: string; command: string; args: string[] }
  | { kind: 'mcp-remove'; name: string }
  | { kind: 'plugin-enable' | 'plugin-disable' | 'plugin-uninstall'; id: string }

/** What the user can change in Settings. */
export interface Prefs {
  /** 'all' also tells you when an agent finishes; 'attention' only when something needs you; 'off' never. */
  notifications: 'all' | 'attention' | 'off'
  /** Keep the computer awake while an agent works. */
  keepAwake: boolean
  /** When the app quits: stop the commands the agents started and commit their unfinished work. */
  wrapUp: boolean
  /** Where each provider's program is, when it is not on the PATH. Empty means its usual name. */
  providers: Partial<Record<ProviderId, { path: string }>>
  /** Where new builds are published; empty means the app does not look for updates. */
  updateUrl: string
  /** Standing instructions added to every agent, whatever its role. */
  houseRules: string
  /** Which model a job (a role's title) uses when the role does not set one. */
  roleModels: Record<string, string>
  /** What the hire form starts with. */
  defaults: { model: string; permissionMode: string; inPlace: boolean }
}
