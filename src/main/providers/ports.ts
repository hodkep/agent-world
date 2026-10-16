import type { RawCall, ToolTranslator } from '../../shared/tools'
import type { ChatItem, SubagentInfo } from '../../shared/chat'
import type { PaletteCommand } from '../../shared/commands'
import type { ModeInfo } from '../../shared/modes'
import type { AgentEvent, AgentOptions, AgentRecord, AgentStats, AutonomyLevel, Capabilities, LimitWindow, Decision, Detection, ManageAction, PermissionRequest, ProviderId, Question, QuestionAnswer } from '../../shared/types'

export interface TrustPrompt {
  path: string
  highlighted: 'yes' | 'no'
}

export interface TerminalIO {
  screen: () => string
  write: (keys: string) => void
  sleep: (ms: number) => Promise<void>
}

/** Reads which option of a menu is highlighted from a rendered screen; null when the menu is not showing. */
/** `key` names the question on screen, so a different one after a key press is told from the same one still there. */
export type Menu = (screen: string) => { highlighted: number; key?: string } | null

export interface GenericMenu {
  /** The first line of the block the menu belongs to ("Bash command", "Rewind"…). */
  title: string
  /** The lines between the title and the options: what is being asked about. */
  context: string
  options: string[]
  highlighted: number
  /** The key hint under the options ("Esc to cancel · Tab to amend"). */
  hint: string
  /** False when Esc does nothing on this screen (a new Claude Code's first questions), so a Cancel would be dead. */
  cancellable?: boolean
  /** The screen takes typing or a browser and can only be finished in the terminal. */
  terminalOnly?: boolean
}

export interface RewindList {
  entries: { text: string; current: boolean }[]
  highlighted: number
}

export interface AskRow {
  n: number
  label: string
  /** Multi-select rows only. */
  checked?: boolean
}
export interface AskScreen {
  kind: 'question' | 'review'
  prompt: string
  /** Row number under the `❯` cursor (0 if none). */
  cursor: number
  rows: AskRow[]
  multi: boolean
}

export interface Btw {
  question: string
  /** null while Claude is still working on it. */
  answer: string | null
}


/** Reads one provider's terminal screen, and drives its menus with keys. A screen is the rendered text. */
export interface ScreenAdapter {
  /** The "do you trust this folder?" menu of a first run. */
  trustPrompt(screen: string): TrustPrompt | null
  answerTrust(io: TerminalIO, trust: boolean): Promise<boolean>
  /** The input box is showing and ready for a message. */
  inputReady(screen: string): boolean
  /** A working indicator is on the screen. */
  looksWorking(screen: string): boolean
  anyMenu(screen: string): boolean
  planMenu: Menu
  genericMenu(screen: string): GenericMenu | null
  answerMenu(io: TerminalIO, detect: Menu, want: number): Promise<boolean>
  parseAsk(screen: string): AskScreen | null
  driveAnswers(io: TerminalIO, questions: Question[], answers: QuestionAnswer[], o?: { timeoutMs?: number }): Promise<boolean>
  /** The autonomy level named in the footer, in the provider's own words, or null. */
  /** `chosen` is the mode the agent was started in: a program whose footer cannot show it (agy's skip-permissions) keeps it. */
  readMode(screen: string, chosen?: string): string | null
  setMode(io: TerminalIO, want: string): Promise<boolean>
  autoUnavailable(screen: string): boolean
  rewindList(screen: string): RewindList | null
  openRewindList(io: TerminalIO): Promise<string | null>
  driveRewind(io: TerminalIO, target: string): Promise<boolean>
  /** What is typed in the input box right now. */
  typedText?(screen: string): string
  /** The model and effort the screen's footer names, for a provider that reports no statistics itself. */
  readModel?(screen: string): { model: string; effort: string | null } | null
  /** The side-question overlay, if it is showing. */
  btwOverlay(screen: string): Btw | null
}

/** The keys that drive a provider's terminal. */
export interface Keys {
  /** Wraps a message so several lines go in as one prompt. */
  paste(text: string): string
  submit: string
  /** Wait between the pasted text and `submit`, so the input has taken it. */
  submitDelayMs: number
  /** Empties what is typed in the input box. */
  clearInput: string
  /** Closes an open menu or overlay. */
  cancel: string
  /** Moves to the next autonomy level. */
  nextMode: string
  /** Stops a turn: `first` at once, then the escalations as `[delayMs, keys]` while it still looks busy. */
  interrupt: { first: string; then: readonly (readonly [number, string])[] }
}

export interface ModelOption {
  /** What the program is given; empty means its own default. */
  value: string
  label: string
  /** The thinking levels this model offers; not given means all of Claude's five, an empty list means it has no switch for it. */
  efforts?: string[]
}

/** Looks at and changes what an agent can reach: tool servers and plugins, through the provider's own commands. */
export interface ToolsManager {
  /** Arguments that list servers and plugins; the output is read by `parse`. */
  list: { servers: string[]; plugins: string[] }
  parse(servers: string, plugins: string): { mcp: ToolServer[]; plugins: ToolPlugin[] }
  /** Arguments for a management action; anything that could be mistaken for an option is refused. */
  manage(a: ManageAction): string[]
}
export interface ToolServer {
  name: string
  target: string
  health: 'ok' | 'attention' | 'failed'
  status: string
}
export interface ToolPlugin {
  id: string
  version: string
  scope: string
  enabled: boolean
}

export interface LaunchInput {
  agent: AgentRecord
  /** Per-agent files from `prepare`. */
  files: { settingsFile?: string; mcpFile?: string; env?: Record<string, string> }
  permissionMode?: string
  options?: AgentOptions
  houseRules?: string
  addDirs?: string[]
  /** Folders of plugins to load for this session only (for a program that has such a flag). */
  pluginDirs?: string[]
  /** Tools that need no permission prompt (the office's read-only library tools), for a program that has such a flag. */
  allowTools?: string[]
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

/** A provider's way to look at and press keys on its agents' terminals, for providers that report nothing themselves. */
export interface TerminalAccess {
  /** This provider's agents. */
  agents(): AgentRecord[]
  /** The rendered screen of an agent's terminal; empty when it is not running. */
  screen(agentId: string): string
  write(agentId: string, keys: string): void
  /** When its terminal was started (ms since 1970); 0 when it is not running. */
  startedAt(agentId: string): number
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
  /** The provider found the name of the agent's conversation (its first one, or after a restart): the app keeps it to resume. */
  onSession?: (agentId: string, sessionId: string) => void
  /** Text to add to what an agent is told each time you send it a message (a rule it must not drift from, what its message points at), or null. */
  reminderFor?: (agentId: string, prompt: string) => string | null
  /** The agent is about to edit `file` (in a session started in `cwd`): why it must wait, or null to let it. The program is told no, with the reason. */
  blockEdit?: (agentId: string, file: string, cwd: string) => string | null
  /** The agent is about to call a tool, with what it was given. */
  onToolUse?: (agentId: string, tool: string, input: Record<string, unknown>) => void
  /** The agent's earlier conversation was just replaced by a summary. */
  onCompact?: (agentId: string) => void
  terminal?: TerminalAccess
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
  follow(agent: AgentRecord, onItems: (items: ChatItem[], replace: boolean) => void): { start(): void; stop(): void; poll?(): void }
  /** The whole saved conversation, read once. */
  readAll(agent: AgentRecord): ChatItem[]
  subagents(agent: AgentRecord): SubagentInfo[]
  /** One subagent's own conversation, for a program that keeps one per subagent. */
  subagentConversation?(agent: AgentRecord, subagentId: string): ChatItem[]
  /** Tokens used so far, for a program whose conversation file records them. */
  usage?(agent: AgentRecord): { input: number; output: number; context: number } | null
  /** Sessions saved for this folder, including ones its agents ran in worktrees under `worktreeRoot`. */
  history(folder: string, worktreeRoot: string): Promise<PastSession[]>
  /** The session this agent moved to since `sinceMs` (a rewind forks to a new one), if any. */
  forkedSession(agent: AgentRecord, sinceMs: number): string | null
  /** Forget the instructions the saved session remembers, so a relaunch can give it new ones (a changed role). */
  forgetInstructions(agent: AgentRecord): void
}

/** For a provider that reaches the office message box through a change in its own settings, which the user approves first. */
export interface MailSetup {
  status(): 'connected' | 'missing'
  /** What connecting would change, word for word, shown before the user approves it. */
  plan(): { files: string[]; commands: string[]; note: string }
  connect(bin: string): Promise<void>
  disconnect(bin: string): Promise<void>
  /** The plugin it installed is older than the one this app writes, so it lacks a hook (connecting again replaces it). */
  outdated?(): boolean
  /** Entries of ours the program still lists that start something no longer installed (a build that was removed), each of which makes it fail. */
  stale?(): { name: string; program: string }[]
  /** Takes one of those out, and only one of those. */
  removeStale?(bin: string, name: string): Promise<void>
}

/** What a provider's hooks may ask of the library: the line to add for a message, and a note that a file was read. */
export interface LibraryHookIO {
  remind(prompt: string): string
  used(path: string): void
  /** Why an edit to this file must wait, or null when it may go ahead. */
  editBlock?(file: string): string | null
}

/** Everything the core needs from an agent program. The core never names a provider; it asks the registry for one. */
/**
 * How a program keeps one login apart from another, so an agent can run on a personal or a work subscription and move between
 * them without signing in again. A program offers it when it can be pointed at a folder that holds its sign-in, settings and
 * conversations (`capabilities.accounts`); the rest of the app only talks to this interface.
 */
export interface AccountSupport {
  /** The program's own folder: added accounts link your instructions and skills from it (read only; it is never written). */
  ownHome(): string
  /** Names inside it that every account shares. */
  readonly shared: readonly string[]
  /** The environment that points the program at an account's folder. */
  env(configDir: string): Record<string, string>
  /** The arguments of the program's own sign-in, run in a terminal the user sees (the app never handles credentials). */
  readonly signInArgs: readonly string[]
  /** Who is signed in under `env`, asked of the program itself; read only. */
  status(bin: string, env: NodeJS.ProcessEnv, run?: (file: string, args: string[], env: NodeJS.ProcessEnv) => Promise<string>): Promise<{ loggedIn: boolean; email: string }>
  /** Makes an agent's saved conversation reachable from another account's folder (undefined is the program's own), so the same session resumes there. */
  shareConversation(a: AgentRecord, from: string | undefined, to: string | undefined): void
}

export interface Provider {
  readonly id: ProviderId
  readonly label: string
  /** The program's usual name on the PATH. */
  readonly bin: string
  readonly capabilities: Capabilities
  /** Answers this program's own hooks (a plugin it was given calls the office, which asks here), for one that has them. */
  readonly libraryHook?: (event: string, payload: Record<string, unknown>, io: LibraryHookIO) => Record<string, unknown>
  /** Is it here, and usable? `run` lets tests answer instead of starting a program. */
  detect(bin: string, run?: (file: string, args: string[]) => Promise<string>): Promise<Detection>
  readonly transcript: TranscriptSource
  /** Says this program's tool calls in the chat's vocabulary (shared/tools.ts), so its work is drawn like everyone's. */
  readonly calls: ToolTranslator
  /** Real calls of its own, one per tool it has been seen to use: the contract test checks each translates to something the chat draws. */
  readonly callSamples: RawCall[]
  readonly screen: ScreenAdapter
  readonly keys: Keys
  readonly models: ModelOption[]
  /** The autonomy levels it offers, in its own words, with how the app shows each. */
  readonly modes: ModeInfo[]
  /** Choosing a message in the rewind list leads to a question (what to restore) that the user answers; false when the rewind is done at once. */
  readonly rewindConfirms: boolean
  /** Modes the mode key reaches while the agent runs, and modes that need a relaunch between turns. */
  readonly liveModes: string[]
  readonly relaunchModes: string[]
  /** The file of standing project notes this program reads, which the Handbook button opens. */
  readonly handbook: string
  /** How many tokens the named model keeps in context, where known: with it the context is a share, like Claude's, not just a count. */
  contextWindow?(model: string): number | null
  /** What the hire form offers for how much it may do alone; the empty value is the provider's own default. */
  readonly hireModes: { value: string; label: string; hint: string }[]
  /** The mode each neutral level means here (null when it has none). */
  readonly autonomy: Record<AutonomyLevel, string | null>
  /** Present when `capabilities.accounts`. */
  readonly accounts?: AccountSupport
  /** For a provider whose limits have to be asked for (the others report them as they go, through the event source). */
  readonly limits?: { read(bin: string, run?: (file: string, args: string[]) => Promise<string>): Promise<LimitWindow[]> }
  /** What the composer offers after a slash: the program's own commands and the skills it would find for an agent working in `cwd`. */
  readonly commands: { list(cwd: string, home: string): Promise<PaletteCommand[]> }
  /** Present when the provider needs a change of its own settings to use the message box (see `capabilities.mail`). */
  readonly mail?: MailSetup
  /** Present when `capabilities.tools`. */
  readonly tools?: ToolsManager
  /** Tells the office what the agents are doing and asking. */
  readonly events: { start(o: EventSourceOptions): Promise<EventHandle> }
  /** Environment for its sessions, without whatever a parent session of the same program left behind. */
  env(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv
  /** Writes this agent's own settings and message-box config; returns their paths. */
  prepare(i: PrepareInput): { settingsFile?: string; mcpFile?: string; /** Added to the terminal's environment. */ env?: Record<string, string> }
  args(i: LaunchInput): string[]
}
