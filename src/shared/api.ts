import type { Overview, TokensReport, UsageReport, WeekReport } from './ledger'
import type { ChatItem, SubagentInfo } from './chat'
import type { Run } from './runs'
import type { HandoffKind } from './handoff'
import type { Role } from './roles'
import type { UsageLimits } from './usage'
import type { LibraryCandidate, LibraryItem, LibraryKind, LibraryPreview, PlaybookRule, Summary as LibraryStats, Use as LibraryUse } from './library'
import type { TodoBoard, TodoStatus } from './todos'
import type { AccountInfo, Prefs, TerminalMenu, AgentEvent, AgentMessage, AgentOptions, AgentProfile, AgentRecord, AgentStats, Decision, LimitWindow, PermissionRequest, ProviderId, ProviderInfo, QuestionAnswer } from './types'

export type RemoveResult = { ok: true } | { ok: false; dirty: string }
export type ChangeStatus = 'added' | 'modified' | 'deleted'
export interface Changes {
  base: string
  branch: string | null
  files: { path: string; status: ChangeStatus }[]
  /** Set when the stored base leaves far more files changed than the branch the repo's checkout is on would: that branch, and how many files differ from it. */
  hint?: { branch: string; files: number } | null
}
/** What is not committed in an agent's worktree: ready to commit, edited since (a file can be in both), and new. */
export interface WorktreeStatus {
  staged: { path: string; status: ChangeStatus }[]
  changed: { path: string; status: ChangeStatus }[]
  untracked: { path: string; status: ChangeStatus }[]
}
export interface CommitInfo {
  hash: string
  short: string
  subject: string
  author: string
  /** Milliseconds. */
  at: number
  files: number
  added: number
  deleted: number
  /** The commit the worktree is on. */
  head: boolean
  /** Not pushed to the branch's upstream yet (said only for a branch that has one). */
  local: boolean
}
export interface CommitPage {
  commits: CommitInfo[]
  total: number
  more: boolean
}
export interface CommitDetail {
  subject: string
  body: string
  author: string
  at: number
  files: { path: string; status: ChangeStatus }[]
}
export interface Branch {
  name: string
  kind: 'local' | 'remote'
  checkedOut: boolean
}
/** A repo's branches to pick a base from, and the one in use (the checkout's own, for a repo not yet hired into). */
export interface BranchList {
  current: string
  branches: Branch[]
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
  /** The repo's branches, and the base this agent has now. */
  branches(agentId: string): Promise<BranchList>
  /** Compare this agent's work with, and land it on, another branch. Git and the worktree are not touched. */
  setBase(agentId: string, base: string): Promise<void>
  diff(agentId: string, path: string): Promise<{ original: string; current: string }>
  files(agentId: string): Promise<string[]>
  /** The files the message box offers when you type @: the folder's files, or none for an agent in a folder that is not a repository (not an error). */
  mentionFiles(agentId: string): Promise<string[]>
  read(agentId: string, path: string): Promise<string>
  write(agentId: string, path: string, content: string): Promise<void>
  commit(agentId: string, message: string): Promise<void>
  discard(agentId: string, path: string): Promise<void>
  /** What is uncommitted: staged, edited and new files. */
  status(agentId: string): Promise<WorktreeStatus>
  stage(agentId: string, paths: string[]): Promise<void>
  unstage(agentId: string, paths: string[]): Promise<void>
  /** Commits what is staged and nothing else. */
  commitStaged(agentId: string, message: string): Promise<void>
  /** An uncommitted file: the last commit's version and the worktree's. */
  dirtyDiff(agentId: string, path: string): Promise<{ original: string; current: string }>
  /** The branch's commits, newest first: those since its base ("branch") or all of them. */
  log(agentId: string, o: { scope: 'branch' | 'all'; search?: string; limit?: number; skip?: number }): Promise<CommitPage>
  commitDetail(agentId: string, hash: string): Promise<CommitDetail>
  commitDiff(agentId: string, hash: string, path: string): Promise<{ original: string; current: string }>
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
  /** `base` starts the agent's branch from, and lands it on, another branch than the one the folder is on. */
  addAgent(folder: string, options?: AgentOptions, name?: string, base?: string): Promise<AgentRecord>
  repoBranches(folder: string): Promise<BranchList>
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
  /** One subagent's own conversation: what it thought and said, each call and what it returned. */
  subagentChat(agentId: string, subagentId: string): Promise<ChatItem[]>
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
  /** Which git the app and its agents use: the computer's own, or the one bundled with the app; null when there is neither. */
  gitInfo(): Promise<{ source: 'system' | 'bundled'; bin: string; version?: string } | null>
  /** A shell in the home folder with the provider's own program started, so the user can sign in; gives its terminal id. */
  openSignIn(provider: ProviderId, account?: string): Promise<string>
  /** Runs the installer of a program that was not found in a terminal (its id is returned, and `onPtyExit` says when it ended). */
  installProvider(provider: ProviderId): Promise<string>
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
  /** A project's todo board changed (by the person or an agent): read it again with todos.get. */
  onTodosChanged(cb: (workspace: string) => void): () => void
  /** An agent has a new entry in the library's log (read it again with library.uses). */
  onLibraryUse(cb: (agentId: string, how: string, item: string) => void): () => void
  /** An agent opened a page in a browser: the app shows it in that agent's Preview tab. `path` is the file, as found on this computer. */
  onOpenPage(cb: (agentId: string, path: string) => void): () => void
  onChatItems(cb: (agentId: string, sessionId: string, items: ChatItem[]) => void): () => void
  /** Whether an agent's branch is ready to land on its base branch. */
  finishStatus(agentId: string): Promise<{ branch: string; base: string; ahead: number; uncommitted: number; baseReady: boolean; conflicts: string[]; /** Where the plan stands and what the audit found; null when workflows or the merge gate are off. */ merge: import('./mergeCheck').MergeCheck | null }>
  /** Run the audit of the branch again (after one failed). */
  finishAudit(agentId: string): Promise<void>
  /** The merges into the base branch that git held for want of the person's say, by agent, until they land or the person says not yet. */
  landingHolds(): Promise<LandingHold[]>
  /** The person allows the held branch of this agent to land anyway; the agent's next try goes through. */
  landingAllow(agentId: string): Promise<void>
  /** The person says not yet: the band is put away and the marker on the run's track stays. */
  landingDecline(agentId: string): Promise<void>
  /** The person opens the band again from the marker. */
  landingReopen(agentId: string): Promise<void>
  /** The person has seen these findings (by position) of the audit of the branch as it is now. */
  finishSeen(agentId: string, which: number[]): Promise<void>
  /** Merge (or squash) the branch into the base branch; with `cleanup` the agent, its worktree and branch go too. */
  finishRun(agentId: string, o: { squash: boolean; message: string; cleanup: boolean; /** Land although the merge gate holds it back; the choice is recorded. */ anyway?: boolean }): Promise<{ base: string; removed: boolean }>
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
  updateState(): Promise<{ state: 'off' | 'checking' | 'none' | 'available' | 'ready' | 'error'; detail?: string; latest?: string; url?: string }>
  checkUpdates(): Promise<{ state: 'off' | 'checking' | 'none' | 'available' | 'ready' | 'error'; detail?: string; latest?: string; url?: string }>
  onUpdateState(cb: (s: { state: 'off' | 'checking' | 'none' | 'available' | 'ready' | 'error'; detail?: string; latest?: string; url?: string }) => void): () => void
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
  /** `restore` is the last message sent when nothing came after it: if Claude took it back into its input box, it is moved back to the message box. */
  chatInterrupt(agentId: string, restore?: string): Promise<void>
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
  /** The todo board of a project: lists of tasks the person and the agents both add to and finish. */
  todos: {
    get(folder: string): Promise<{ board: TodoBoard; key: string }>
    add(folder: string, i: { title: string; list?: string; notes?: string; needsYou?: boolean }): Promise<void>
    update(folder: string, id: string, p: { title?: string; notes?: string; needsYou?: boolean; status?: TodoStatus; blockedWhy?: string }): Promise<void>
    /** Ask an agent about a task, or put it on one: recorded on the board; the message to send that agent is returned. */
    ask(folder: string, id: string, agentId: string, mode: 'ask' | 'work', words: string): Promise<{ message: string }>
    /** Names and sorts the tasks waiting in the Inbox, by asking a small model; how many were named. */
    tidyInbox(folder: string): Promise<number>
    remove(folder: string, id: string): Promise<void>
    done(folder: string, id: string): Promise<void>
    reopen(folder: string, id: string): Promise<void>
    move(folder: string, id: string, list: string, index: number): Promise<void>
    addList(folder: string, name: string): Promise<void>
    renameList(folder: string, from: string, to: string): Promise<void>
    removeList(folder: string, name: string): Promise<void>
    /** How many open tasks wait on the person, for the top bar. */
    needsYou(folder: string): Promise<number>
    /** Does one thing to several tasks at once; how many it changed. */
    bulk(folder: string, ids: string[], op: { do: 'done' } | { do: 'reopen' } | { do: 'remove' } | { do: 'needsYou'; on: boolean } | { do: 'move'; list: string }): Promise<number>
    /** The scratch pad: markdown the person jots tasks in. */
    padGet(folder: string): Promise<string>
    padSet(folder: string, text: string): Promise<void>
    /** Makes tasks of the pad's checklist lines and takes them out of the pad; how many. */
    padMake(folder: string): Promise<number>
    /** Takes back the last conversion; how many tasks were removed. */
    padUndo(folder: string): Promise<number>
  }
  /** The shared library of skills, instructions and prompts, and the playbooks that say how agents use it. */
  workflows: {
    /** Every run recorded, oldest first, and how many are still open. */
    summary(): Promise<{ runs: Run[]; open: number; /** What each run cost, by run id, from the ledger. */ spend: Record<string, import('./runStats').RunSpend>; /** The runs whose workflow file has checks the person has not approved the commands of. */ unapproved: string[] }>
    /** The person's answer to a plan that is waiting; it is typed into the agent's prompt. A release lifts the hold on edits without approving. */
    decide(runId: string, state: 'approved' | 'changes' | 'released', o?: { note?: string; answers?: { question: string; answer: string }[] }): Promise<void>
    /** Close every open run as stopped ("Stop them now" when workflows are turned off). */
    stopAll(): Promise<void>
    /** The person's answer to a step of a run that waits for them; it is typed into the agent. */
    approveStep(runId: string, step: string, decision: 'approved' | 'changes', note?: string): Promise<void>
    /** What the person is shown before approving a project file's check commands. */
    checkApproval(runId: string): Promise<{ workflow: string; file: string; hash: string; commands: string[]; before?: { hash: string; at: number; diff: { change: 'added' | 'removed' | 'same'; text: string }[] } }>
    /** Approve the commands of the run's workflow file (this exact version); the checks run at once. */
    approveChecks(runId: string): Promise<void>
    /** Do not approve them: the checks that wait are marked failed. */
    declineChecks(runId: string): Promise<void>
    /** Run a check again, with all its tries back. */
    rerunCheck(runId: string, step: string): Promise<void>
    /** Pass a check over; it no longer holds landing. */
    skipCheck(runId: string, step: string): Promise<void>
    /** The workflows a project can use: Standard, the global files and the project's own, with what is wrong with any that do not read. */
    definitions(project: string | null): Promise<import('./workflow').WorkflowEntry[]>
    /** Copies a workflow into the project or for everything; says the new one. */
    duplicate(project: string | null, id: string, to: 'global' | 'project'): Promise<import('./workflow').WorkflowEntry>
    /** Deletes a workflow's file from the project or the global folder. */
    remove(project: string | null, id: string, scope: 'global' | 'project'): Promise<void>
    /** The project's workflow builder, made on first use and woken if asleep. What the person typed is sent to it once it can take it. */
    builder(project: string, first?: string): Promise<AgentRecord>
    /** The builder's draft against what is saved; null when it has none. */
    proposal(agentId: string, project: string | null): Promise<import('./builder').ProposalView | null>
    /** Saves the draft where the person chose, approving its commands for that exact file; says the saved workflow. */
    saveProposal(agentId: string, project: string | null, how: import('./builder').SaveHow): Promise<import('./workflow').WorkflowEntry>
    /** Throws the draft away. */
    discardProposal(agentId: string): Promise<void>
  }
  /** Fires when a run began, finished, got a commit or was stopped. */
  onWorkflows(cb: () => void): () => void
  onLanding(cb: () => void): () => void
  library: {
    list(): Promise<{ items: LibraryItem[]; usage: Record<string, { claude: number; agy: number; total: number }> }>
    /** What the library did for one agent, oldest first: what it started with, what was pointed at, what it read. */
    uses(agentId: string): Promise<LibraryUse[]>
    /** Per item, program and agent: delivered, pointed at, answered and used. */
    stats(): Promise<LibraryStats>
    /** Which items a message would point an agent of this project at, best first. */
    /** Agents whose program reports by hooks, that have worked since starting and never got one through to the office. */
    silent(folder: string): Promise<{ id: string; name: string }[]>
    /** The agents of this project that were given an opening text, and whether it is older than the playbook now. */
    holders(folder: string): Promise<{ id: string; name: string; provider: string; stale: boolean }[]>
    save(i: { id?: string; kind: LibraryKind; name: string; description: string; body: string }): Promise<LibraryItem>
    remove(id: string): Promise<void>
    /** Skills found on this computer that could be copied in. */
    sources(folder?: string): Promise<LibraryCandidate[]>
    /** Copies the skills in these folders (found by a fresh scan) into the library. */
    import(folder: string | undefined, dirs: string[]): Promise<{ added: string[]; skipped: { name: string; reason: string }[] }>
    /** The global playbook and the workspace's. */
    playbook(folder?: string): Promise<{ global: PlaybookRule[]; workspace: PlaybookRule[] }>
    /** Saves a playbook: the global one when the scope is null, else that workspace's. */
    setPlaybook(scope: string | null, rules: PlaybookRule[]): Promise<PlaybookRule[]>
    /** The switches of the global playbook (what the check before acting is set to). */
    /** What an agent of that program would be told for this workspace. */
    preview(folder: string, provider: ProviderId): Promise<LibraryPreview>
  }
  /** Entries of ours the program still lists for a build that was removed (each makes the program fail when it tries the office). */
  mailStale(provider: ProviderId): Promise<{ name: string; program: string }[]>
  /** Takes one of those out through the program's own command; what is left behind is returned. */
  forgetMail(provider: ProviderId, name: string): Promise<{ name: string; program: string }[]>
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

/** A merge into the base branch that git held back: which agent, which commit of its branch, what holds it, and whether the person said not yet (the band is put away, the marker stays). */
export interface LandingHold {
  agentId: string
  head: string
  held: string[]
  declined: boolean
}
