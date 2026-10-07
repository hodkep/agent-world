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

/** How much an agent may do alone, whatever program runs it. Each provider maps these to its own modes. */
export type AutonomyLevel = 'ask' | 'edit' | 'plan' | 'full'

export type PermissionMode = 'manual' | 'acceptEdits' | 'plan' | 'auto' | 'dontAsk'
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** Chosen in the hire dialog; applied as launch flags every time the agent starts. */
export interface AgentOptions {
  model?: string
  effort?: Effort
  permissionMode?: PermissionMode
  /** Which program runs the agent; the default provider in Settings when unset. */
  provider?: ProviderId
  /** Soft cap: the app warns as the session's cost approaches it (Claude only enforces budgets in --print mode). */
  budgetUsd?: number
  instructions?: string
  chrome?: boolean
  /** The job this agent was hired for (a role's title), shown next to its name. */
  role?: string
  /** Work in the folder itself instead of a worktree on its own branch. */
  inPlace?: boolean
  /** Which signed-in account runs it (an id from Prefs.accounts); empty or unset is the program's own login on this computer. */
  account?: string
}

/** The agent programs the office can run. */
export const PROVIDER_IDS = ['claude', 'agy'] as const
export type ProviderId = (typeof PROVIDER_IDS)[number]
/** The program of an agent saved before there was a choice. */
export const DEFAULT_PROVIDER: ProviderId = 'claude'
export const isProviderId = (v: unknown): v is ProviderId => (PROVIDER_IDS as readonly unknown[]).includes(v)

/** What a provider can do; the screens hide what it cannot, instead of showing it broken. */
export interface Capabilities {
  permissionsInWorld: boolean
  liveModeSwitch: boolean
  subagents: boolean
  rewind: boolean
  compact: boolean
  limits: boolean
  tools: boolean
  /** An agent can be cloned: a copy that continues from the same conversation. */
  clone: boolean
  /** An agent's job can be changed while it is running. */
  changeRole: boolean
  /** It can be allowed to use Chrome. */
  chrome: boolean
  /** It reports a price, so a spending budget can be set and warned about. */
  budget: boolean
  /** It has a side-question overlay that answers without interrupting the task (/btw). */
  sideQuestion: boolean
  /** The program loads skills from a folder it is given for the session (Claude's --plugin-dir), so a skill can be named, not just read. */
  nativeSkills?: boolean
  /** Its limits arrive with each agent's own reports, so the agent's controls can show them (otherwise they are in the Usage tab). */
  liveLimits: boolean
  /** It can use the office's message box and notes: agents can write to each other and share what they learn. */
  mail: boolean
  /** Several logins of this program can be kept apart and an agent moved between them (the provider offers `accounts`). */
  accounts: boolean
}

/** One usage allowance of a provider, as it reports it: how much is left and when it refills. */
export interface LimitWindow {
  provider: ProviderId
  /** A provider can limit models in groups ("Gemini Models"); one group is named after the provider. */
  group: string
  kind: 'five_hour' | 'weekly'
  remainingPct: number
  resetsAt: string
  /** Which account it belongs to (an id from Prefs.accounts; '' is the program's own login on this computer); unset for a program with no accounts. */
  account?: string
}

/** What the machine says about a provider: whether it can be used now, and what to do if not. */
export interface Detection {
  state: 'ready' | 'needs-sign-in' | 'not-installed' | 'unsupported'
  version?: string
  path?: string
  /** A command that installs it, shown when it is not found. */
  install?: string
  /** What to tell the user, e.g. "Run `agy` once to sign in". */
  hint?: string
}

/** A provider as the screens see it: what it is called, whether it works here, and what it offers. */
export interface ProviderInfo {
  id: ProviderId
  label: string
  capabilities: Capabilities
  detection: Detection
  models: { value: string; label: string; efforts?: string[] }[]
  modes: import('./modes').ModeInfo[]
  /** The modes it can only reach by restarting the agent (chosen from the picker, which says so). */
  relaunchModes: string[]
  /** The choices in the hire form for how much it may do alone, in the provider's own words; the empty value is its default. */
  hireModes: { value: string; label: string; hint: string }[]
  /** The file of standing project notes its program reads (CLAUDE.md, AGENTS.md). */
  handbook: string
  /** The mode each neutral level means for this provider (null when it has none). */
  autonomy: Record<AutonomyLevel, string | null>
  /** Whether it can use the office message box: always, once connected (and what that changes), or not at all. */
  mail: 'yes' | 'connected' | 'missing' | 'no'
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
  /** For a program that reports tokens: what was already counted into the history, so the next report adds only what is new. */
  tokensSeen?: { input: number; output: number }
  /** The running cost Claude last reported, so the next report adds only what is new to the usage history. */
  costSeen?: number
  /** Live state, filled in by list-agents only (not persisted). */
  online?: boolean
  activity?: Activity
  options?: AgentOptions
  /** The account it runs on (an id from Prefs.accounts), and that account's config folder; unset means the program's own login on this computer. */
  account?: string
  configDir?: string
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
  /** For a program that reports tokens rather than a price: everything read and written so far, and roughly how much its context holds now. */
  tokens?: { input: number; output: number; context: number }
  /** What a program that also reports a price says it has read and written so far (the price is `costUsd`): counted in the history, nothing more. */
  tokenTotals?: { input: number; output: number }
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
  /** First-run setup: whether it was finished or skipped, and which provider new agents use unless told otherwise. */
  setup: { done: boolean; defaultProvider: ProviderId | '' }
  /** Where each provider's program is, when it is not on the PATH. Empty means its usual name. */
  providers: Partial<Record<ProviderId, { path: string }>>
  /** Where new builds are published; empty means the app does not look for updates. */
  updateUrl: string
  /** Standing instructions added to every agent, whatever its role. */
  houseRules: string
  /** Which model a job (a role's title) uses when the role does not set one. */
  roleModels: Record<string, string>
  /** What the hire form starts with. */
  defaults: { /** Which program new agents use; empty means the one chosen in setup. */ provider: ProviderId | ''; model: string; permissionMode: string; inPlace: boolean; /** The account new agents of each program use; unset or empty means that program's own login on this computer. */ accounts: Partial<Record<ProviderId, string>> }
  /** Extra accounts, each signed in once in a config folder of its own. Each program's own login on this computer is always there and is not listed. */
  accounts: Account[]
}

/** A login of one program kept apart from the others: its folder holds its sign-in, settings and conversations. */
export interface Account {
  id: string
  name: string
  provider: ProviderId
}

/** What the Accounts screen shows for one account; `id` is '' for the program's own login on this computer. */
export interface AccountInfo extends Account {
  /** Where its config folder is, as shown to the user. */
  dir: string
  loggedIn: boolean
  email: string
  /** How many agents run on it. */
  agents: number
}
