import type { Overview, TokensReport, UsageReport, WeekReport } from './ledger'
import type { ChatItem, SubagentInfo } from './chat'
import type { HandoffKind } from './handoff'
import type { Role } from './roles'
import type { UsageLimits } from './usage'
import type { AccountInfo, Prefs, TerminalMenu, AgentEvent, AgentMessage, AgentOptions, AgentProfile, AgentRecord, AgentStats, Decision, LimitWindow, PermissionRequest, ProviderId, ProviderInfo, QuestionAnswer } from './types'

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
  source: 'built-in' | 'project skill' | 'project command' | 'your skill' | 'your command' | 'plugin skill' | 'plugin command'
  args: boolean
}

export interface PastSession {
  id: string
  title: string
  updated: number
  bytes: number
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

export interface DevServer {
  port: number
  url: string
  /** Something is accepting connections on it right now. */
  alive: boolean
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
  /** Another window onto the same agents; it starts on the project picker. */
  newWindow(): Promise<void>
  listAgents(): Promise<AgentRecord[]>
  addAgent(folder: string, options?: AgentOptions, name?: string): Promise<AgentRecord>
  /** Relaunch the agent's session with a different model or effort (between turns only). */
  reconfigure(agentId: string, change: Pick<AgentOptions, 'model' | 'effort'>): Promise<void>
  /** What the profile card shows for an agent: counted from its conversation, its branch and its work clock. */
  profile(agentId: string): Promise<AgentProfile>
  /** Shows the system's Copy / Paste menu for a terminal; resolves to the text to paste, or null. */
  terminalMenu(selected: string): Promise<string | null>
  /** The week starting at `start` (Monday 00:00), from the history the app keeps of its agents' work and spending. */
  weekReport(start: number): Promise<WeekReport>
  /** Spending per day over the last `days` days. */
  /** Tokens used per day, for the programs that report tokens instead of a price. */
  tokensReport(days: number): Promise<TokensReport>
  usageReport(days: number): Promise<UsageReport>
  overview(days: number): Promise<Overview>
  /** What an agent's subagents have done so far. */
  subagents(agentId: string): Promise<SubagentInfo[]>
  /** Give a running agent another job (null: none) and relaunch it on the same conversation. */
  setRole(agentId: string, role: Role | null): Promise<AgentOptions>
  /** Renames the agent (unique, plain characters); resolves to the cleaned name. */
  renameAgent(id: string, name: string): Promise<string>
  setGroup(id: string, group: string): Promise<void>
  /** Ask another agent (or a fresh read-only reviewer, with 'new') to review this agent's branch. Resolves to the new reviewer, if one was hired. */
  /** Hand an agent's branch to another agent (or a new one of either provider) to review, continue from, or answer a question about; gives the new agent when one was hired. */
  sendHandoff(fromId: string, to: { agent: string } | { hire: ProviderId }, kind: HandoffKind, note: string): Promise<AgentRecord | null>
  requestReview(authorId: string, reviewer: string): Promise<AgentRecord | null>
  /** A second agent that continues a copy of this one's conversation, in its own worktree branched from this one's. */
  /** A second agent that continues a copy of this conversation, optionally on another model. */
  cloneAgent(id: string, model?: string): Promise<AgentRecord>
  /** Earlier Claude conversations in this folder (and worktrees of it), newest first. */
  listHistory(folder: string): Promise<PastSession[]>
  /** Every provider the app knows, with whether it is ready on this machine. */
  listProviders(): Promise<ProviderInfo[]>
  /** A shell in the home folder with the provider's own program started, so the user can sign in; gives its terminal id. */
  openSignIn(provider: ProviderId, account?: string): Promise<string>
  /** Claude accounts: this computer's own login first (id ''), then the ones added. */
  listAccounts(): Promise<AccountInfo[]>
  /** Makes the account's folder; returns its id. Sign-in follows with openSignIn. */
  addAccount(provider: ProviderId, name: string): Promise<string>
  removeAccount(id: string): Promise<Prefs>
  /** Moves an agent to another account ('' for this computer's own login); a running one restarts on it and keeps its conversation. */
  setAccount(agentId: string, account: string): Promise<void>
  /** Continue that conversation as a new agent. */
  resumeSession(folder: string, sessionId: string): Promise<AgentRecord>
  /** MCP servers and plugins available to this agent (runs `claude mcp list`, which health-checks each server: slow). */
  listTools(agentId: string): Promise<ToolsInfo>
  manageTools(agentId: string, action: import('./types').ManageAction): Promise<string>
  wakeAgent(id: string): Promise<void>
  removeAgent(id: string, mode?: 'discard' | 'keep-worktree'): Promise<RemoveResult>
  /** A shell in the project folder for a grid cell; its id starts with `term:` and works with the pty calls below. */
  openShell(folder: string): Promise<string>
  closeShell(id: string): void
  listShells(): Promise<string[]>
  /** Is anything accepting connections on this local port? */
  probePort(port: number): Promise<boolean>
  /** For each shell: what is running in front now, and what the shell itself was called when it first showed its prompt. */
  shellProcesses(): Promise<Record<string, { front: string; idle: string }>>
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
  /** The conversation so far (from Claude's saved transcript) and later additions to it. */
  chatGet(agentId: string): Promise<{ sessionId: string; items: ChatItem[] }>
  onChatItems(cb: (agentId: string, sessionId: string, items: ChatItem[]) => void): () => void
  /** Whether an agent's branch is ready to land on its base branch. */
  finishStatus(agentId: string): Promise<{ branch: string; base: string; ahead: number; uncommitted: number; baseReady: boolean; conflicts: string[] }>
  /** Merge (or squash) the branch into the base branch; with `cleanup` the agent, its worktree and branch go too. */
  finishRun(agentId: string, o: { squash: boolean; message: string; cleanup: boolean }): Promise<{ base: string; removed: boolean }>
  /** Notes saved for this agent's project, newest first (shared by every agent in it). */
  memoryList(agentId: string): Promise<{ id: string; text: string; by: string; at: number }[]>
  memoryAdd(agentId: string, text: string): Promise<{ id: string; text: string; by: string; at: number }>
  memoryForget(agentId: string, entryId: string): Promise<void>
  /** Which of these paths (as an agent wrote them) are real files, with what kind each is. */
  fileInfo(agentId: string, paths: string[]): Promise<(import('./files').FileInfo | null)[]>
  fileRead(agentId: string, path: string): Promise<{ info: import('./files').FileInfo; text: string; truncated: boolean }>
  fileUrl(agentId: string, path: string): Promise<{ info: import('./files').FileInfo; url: string }>
  fileImage(agentId: string, path: string): Promise<{ info: import('./files').FileInfo; src: string }>
  /** Open a file with the program this machine uses for that type; resolves to an error message, or '' when it opened. */
  openFileExternal(agentId: string, path: string): Promise<string>
  /** The last few lines each of these agents' terminals shows. */
  peek(agentIds: string[]): Promise<Record<string, string[]>>
  /** Write a short record of this conversation to the notes folder and show it; returns the file. */
  saveNotes(agentId: string): Promise<string>
  /** Ask the main process to say again what is waiting on the user (after this window reloaded). */
  resync(): Promise<void>
  checkUpdates(): Promise<{ state: 'off' | 'checking' | 'none' | 'available' | 'ready' | 'error'; detail?: string }>
  onUpdateState(cb: (s: { state: 'off' | 'checking' | 'none' | 'available' | 'ready' | 'error'; detail?: string }) => void): () => void
  getPrefs(): Promise<import('./types').Prefs>
  setPrefs(prefs: import('./types').Prefs): Promise<import('./types').Prefs>
  onBtw(cb: (agentId: string, btw: { question: string; answer: string | null } | null) => void): () => void
  closeBtw(agentId: string): Promise<void>
  onChatReset(cb: (agentId: string, sessionId: string) => void): () => void
  /** Types the text into the agent's terminal as a prompt and presses Enter. Rejects while a menu is open. */
  chatSend(agentId: string, text: string): Promise<void>
  /** Saves an attached picture or file where the agent can read it; resolves to its path. */
  saveAttachment(agentId: string, name: string, bytes: ArrayBuffer, mime: string): Promise<string>
  /** A picture a message mentions by path, as a data URL ('' if it is not a small picture). */
  readImage(agentId: string, path: string): Promise<string>
  /** Switch to a permission mode: live for the ones in Claude's Shift+Tab cycle, by relaunching (same conversation) for the rest. */
  setMode(agentId: string, mode: string): Promise<void>
  /** Shift+Tab: move to the next permission mode. */
  chatCycleMode(agentId: string): Promise<void>
  /** A choice menu Claude is showing in its own terminal appeared (or, with null, went away). */
  onTerminalMenu(cb: (agentId: string, menu: TerminalMenu | null) => void): () => void
  /** Pick option `index` (0-based) in that menu, checking the highlight before pressing Enter. */
  answerMenu(agentId: string, index: number): Promise<void>
  /** After a rewind, the restored prompt is offered back to you to edit and send again. */
  onComposerPrefill(cb: (agentId: string, text: string) => void): () => void
  /** Esc: back out of the open menu. */
  cancelMenu(agentId: string): Promise<void>
  /** Open /rewind and go to the prompt that starts with this text; Claude's own confirmation follows as a menu. */
  rewindTo(agentId: string, promptText: string): Promise<void>
  /** Esc: interrupt what the agent is doing. */
  chatInterrupt(agentId: string): Promise<void>
  /** Ready-made agents for a project: built in, from Claude subagent files, and saved by the user. */
  listRoles(folder: string): Promise<Role[]>
  saveRole(r: { title: string; blurb: string; options: AgentOptions; nameHint?: string }): Promise<Role>
  deleteRole(id: string): Promise<void>
  getUsage(): Promise<UsageLimits>
  /** Every provider's usage allowances, as share left; agy's are asked for, so this can take a moment. */
  getLimits(refresh?: boolean): Promise<LimitWindow[]>
  /** What connecting a provider to the message box would change; null when there is nothing to connect. */
  mailPlan(provider: ProviderId): Promise<{ files: string[]; commands: string[]; note: string } | null>
  /** Connects or disconnects it, after the user approved the plan; says the new state. */
  setMail(provider: ProviderId, on: boolean): Promise<ProviderInfo['mail']>
  /** Dev servers each agent has started, by agent id. */
  listProcs(agentId: string): Promise<import('./types').ProcInfo[]>
  stopProc(agentId: string, pid: number): Promise<boolean>
  getServers(): Promise<Record<string, DevServer[]>>
  onServers(cb: (s: Record<string, DevServer[]>) => void): () => void
  /** Open a local address in the system browser. */
  openExternal(url: string): Promise<void>
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
