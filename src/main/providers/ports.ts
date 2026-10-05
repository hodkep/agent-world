import type { ChatItem, SubagentInfo } from '../../shared/chat'
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
export type Menu = (screen: string) => { highlighted: number } | null

export interface GenericMenu {
  /** The first line of the block the menu belongs to ("Bash command", "Rewind"…). */
  title: string
  /** The lines between the title and the options: what is being asked about. */
  context: string
  options: string[]
  highlighted: number
  /** The key hint under the options ("Esc to cancel · Tab to amend"). */
  hint: string
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
  readMode(screen: string): string | null
  setMode(io: TerminalIO, want: string): Promise<boolean>
  autoUnavailable(screen: string): boolean
  rewindList(screen: string): RewindList | null
  openRewindList(io: TerminalIO): Promise<string | null>
  driveRewind(io: TerminalIO, target: string): Promise<boolean>
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
  files: { settingsFile?: string; mcpFile?: string }
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
  readonly screen: ScreenAdapter
  readonly keys: Keys
  readonly models: ModelOption[]
  /** The autonomy levels it offers, in its own words, with how the app shows each. */
  readonly modes: ModeInfo[]
  /** What the hire form offers for how much it may do alone; the empty value is the provider's own default. */
  readonly hireModes: { value: string; label: string; hint: string }[]
  /** The mode each neutral level means here (null when it has none). */
  readonly autonomy: Record<AutonomyLevel, string | null>
  /** For a provider whose limits have to be asked for (the others report them as they go, through the event source). */
  readonly limits?: { read(bin: string, run?: (file: string, args: string[]) => Promise<string>): Promise<LimitWindow[]> }
  /** Present when `capabilities.tools`. */
  readonly tools?: ToolsManager
  /** Tells the office what the agents are doing and asking. */
  readonly events: { start(o: EventSourceOptions): Promise<EventHandle> }
  /** Environment for its sessions, without whatever a parent session of the same program left behind. */
  env(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv
  /** Writes this agent's own settings and message-box config; returns their paths. */
  prepare(i: PrepareInput): { settingsFile?: string; mcpFile?: string }
  args(i: LaunchInput): string[]
}
