# Providers: Claude Code and agy side by side

Status: built on branch `aw/charlie`, not merged. Claude Code and agy both run behind the provider interface (`src/main/providers/`), with first-run setup, provider colour on agents, limits in the Usage tab, an approved MCP bridge for agy mail, and hand-offs. Spike results below are from agy 1.2.17.

Known gaps: agy has no manual compact (it compacts by itself), so Compact is not offered for it; the agy token fields are matched against what agy itself draws, not documented by Google, so a context share is shown only for models whose window was measured (Gemini, 1M, from agy's own /context panel) and other models show a token count; agy saves its conversation file in batches, so its rewind and a clone's copied history can appear a few seconds late. Verified against live agy 1.2.17 (Flash, low effort): rewind, subagents, model, trust, a message from an agy agent to a Claude agent through the shared message tool, /btw, and clone through /fork.

## Why

The app is Claude Code from the inside out. We want two providers, **Claude Code** and **agy** (Antigravity CLI), working in the same office: each agent shows which provider it belongs to, each provider's limits are tracked, and agents of either kind can hand work to each other. The Gemini CLI is retired (its sign-in now fails with "client no longer supported"), so it is never offered; if it is the only thing found, setup says "use agy".

Parity is the bar: an agy agent should get the same depth as a Claude agent where agy allows it, and where it does not the app says so plainly instead of faking it.

## Rules the design follows

1. The core never names a provider. It talks to small interfaces ("ports"); a provider is the set of ports it implements.
2. Providers never import each other, and the core never imports a provider directly. A lint rule on import paths enforces both.
3. What flows between provider and core is a **normalized** shape (`AgentEvent`, `ChatItem`, `AgentStats`, plus the new `LimitWindow` and `Handoff`). Each provider translates its own formats into those.
4. A port a provider lacks falls back to a safe default (a null object), and the UI hides the feature through `capabilities`. No `if (provider === 'claude')` anywhere outside `providers/claude/`.
5. Composition over inheritance: no `BaseProvider` to extend. Shared helpers (pty launch, JSONL tailing, hook shims) are plain functions providers choose to use.
6. Per-agent settings live under `~/.agent-world/agents/<id>/`, and the first version never edits a provider's own folders (`~/.claude`, `~/.gemini`). Later features (skills, agents, plugins, extensions, workflows) will need to; when they do, each change is an explicit, listed action the user approves, not a side effect of setup.

## The interface

```ts
type ProviderId = 'claude' | 'agy'

interface Provider {
  readonly id: ProviderId
  readonly label: string                    // "Claude Code", "Antigravity (agy)"
  readonly capabilities: Capabilities
  detect(env: DetectEnv): Promise<Detection>   // found, version, usable, fix hint
  readonly launcher: Launcher
  readonly events: EventSource
  readonly transcript: TranscriptSource
  readonly screen: ScreenAdapter
  readonly limits: LimitSource
  readonly models: ModelCatalog
  readonly autonomy: AutonomyMap
  readonly commands: CommandCatalog
  readonly mail: MailChannel
  readonly tools?: ToolsManager             // optional, with `capabilities.tools`
}

interface Detection {
  state: 'ready' | 'needs-sign-in' | 'not-installed' | 'unsupported'
  version?: string
  path?: string
  hint?: string                              // "Run `agy` once to sign in"
}

interface Capabilities {
  chat: boolean               // a conversation view can be built
  permissionsInWorld: boolean // allow/deny from the office
  liveModeSwitch: boolean     // change autonomy without a relaunch
  subagents: boolean
  rewind: boolean
  compact: boolean
  fork: boolean               // clone / hand over a conversation
  limits: boolean
  tools: boolean              // MCP servers and plugins view
}

interface Launcher {
  command(o: LaunchOptions): { file: string; args: string[]; env: Record<string, string> }
  prepare(agent: AgentRecord, dir: string): Promise<void> // writes per-agent files under ~/.agent-world/agents/<id>/
  interrupt(): string[]                       // key sequences, in order
}

interface EventSource {                       // what the agent is doing, and what it asks
  start(agent: AgentRecord, emit: (e: AgentEvent) => void): Disposable
}

interface TranscriptSource {
  locate(agent: AgentRecord): string | null   // where its conversation is stored
  read(agent: AgentRecord, after?: Cursor): Promise<{ items: ChatItem[]; cursor: Cursor }>
  history(cwd: string): Promise<SessionInfo[]>
}

interface ScreenAdapter {                     // parses that provider's terminal screen
  inputReady(screen: string): boolean
  working(screen: string): boolean
  menu(screen: string): Menu | null
  answer(menu: Menu, choice: number): string[]
}

interface LimitSource {
  read(): Promise<LimitWindow[]>              // may poll
}
type LimitWindow = { provider: ProviderId; group: string; kind: 'five_hour' | 'weekly'; remainingPct: number; resetsAt: string }

interface AutonomyMap {                       // the four neutral levels
  levels: Record<'ask' | 'edit' | 'plan' | 'full', { flags: string[]; live: boolean } | null>
}

interface MailChannel {
  mcpConfigFor(agent: AgentRecord, url: string, token: string): { flags: string[]; files: Record<string, string> }
  deliver(agent: AgentRecord, text: string): string[]   // keys or an API call
  toolName(tool: 'send_message' | 'list_agents' | 'remember' | 'recall'): string
}
```

## Where it lives

```
src/main/core/        agents, sessions, ptys, worktrees, mailbox, MCP server, workspaces, prefs
src/main/providers/
  registry.ts         id -> Provider; the only place providers are named
  ports.ts            the interfaces above
  contract/           one test suite every provider must pass, run against its own fake
  claude/             launch, hooks, transcript, screen, stats, tools, fake
  agy/                launch, events, transcript, screen, limits, fake
src/shared/           normalized types and capability flags
```

"In-repo folders" only means each provider's code sits in the app's own source tree, as above, built and tested with everything else. The alternative, a plugin loader that picks provider add-ons up from outside the app, is not needed for two providers and is left for later.

`index.ts` (1,457 lines) is split into a few classes with one job each: `AgentManager`, `SessionRuntime` (one per agent, owning that provider's handles), `ProviderRegistry`, `MailService`. Claude moves behind the interface first with no behaviour change, and the existing 593 unit tests plus the e2e suite are the safety net.

## What each provider can do

| Port | Claude Code (today) | agy (verified on 1.2.15) |
|---|---|---|
| detect | `claude --version` | `agy --version`; signed-in check is `agy -p "/usage"` |
| launch | `--settings`, `--mcp-config`, `--session-id/--resume`, `--model`, `--effort`, `--permission-mode` | `--model`, `--effort`, `--mode accept-edits\|plan`, `--continue`, `--conversation <id>`, `--dangerously-skip-permissions`, `--add-dir`, `--agent`, `--log-file` |
| events | 13 HTTP hooks plus a status line | **no hooks found.** Headless `--output-format stream-json` gives tool, step, token and duration events, but headless cannot ask for permission (it auto-denies). Interactive events: see spikes. |
| transcript | JSONL under `~/.claude/projects` | one SQLite file per conversation under `~/.gemini/antigravity-cli/conversations/<id>.db`; `steps` rows hold protobuf blobs (readable, undocumented) |
| screen | `❯` prompt, rules, mode footer | not yet mapped |
| limits | status line (`rate_limits`) | `agy -p "/usage"` prints, tab separated: model group, **Weekly / Five Hour** limit remaining %, reset time (UTC when piped). Two groups: *Gemini models*, *Claude and GPT models*. This maps straight onto our two windows. |
| models | opus, sonnet, haiku | `agy models`: Gemini 3.x flash/pro, plus Claude Sonnet/Opus 4.6 and GPT-OSS 120B |
| autonomy | six permission modes | `request-review` (default), `accept-edits`, `plan`, skip-permissions |
| commands | `~/.claude/{commands,skills}`, plugins | `/config`, `/usage`, `/resume`, `/model`, `/effort`, `/plugin`, `/agents`; customisation in `.agents/` and `~/.gemini/config/` |
| mail | `--mcp-config <file>` per launch | MCP is one **global** file, `~/.gemini/antigravity/mcp_config.json`. A per-agent override is not found yet. |
| tools | `claude mcp`, `claude plugin` | `agy mcp`, `agy plugin` (it can import Claude plugins) |

Neutral autonomy levels: `ask`, `edit`, `plan`, `full`. Claude: default, acceptEdits, plan, bypass/auto. agy: request-review, accept-edits, plan, skip-permissions.

## Limits

One `LimitWindow` list for the whole app, grouped by provider. The limits move into the **Usage tab**, which opens on one common summary (worked time this week, busiest limit across providers, spend, turns) with a row per provider; clicking a provider drills into its own card, with five-hour and weekly bars and reset times (agy shows both its model groups), and a table of the week by agent. Claude Code spend is dollars; agy reports tokens, not a price, so it is shown as tokens. The top bar keeps only the Usage icon, with a dot when any provider is under 15%, and the office power plant draws the busiest limit. agy is polled with `agy -p "/usage"` (it makes no model call) every few minutes and after each turn. The ledger records which provider an agent belongs to, so cost and work stay separable.

## Agent-to-agent and hand-offs

Agents already message each other through the app's MCP server. Across providers that stays the transport, with two changes: the message text names the tool the receiver actually has (`toolName`), and delivery goes through the receiver's own `MailChannel` (paste into its terminal after its input is ready, or a native queue where one exists).

A **hand-off** is a neutral envelope, not a conversation transplant:

```ts
interface Handoff {
  from: AgentRef; to: AgentRef          // each carries its provider
  goal: string
  worktree: string; branch: string      // the shared place of work
  files?: string[]; notes?: string
  expect: 'review' | 'implement' | 'answer'
  replyTo: AgentRef
}
```

Because worktrees are plain git, a Claude agent and an agy agent can work on or review each other's branch directly. A conversation cannot move between providers; the receiver starts fresh with the envelope, a short summary and the diff.

## The app records and shows the provider

- `AgentRecord.provider` (default `'claude'` for every existing agent, by migration), shown as a small tag on the roster row, on the office character's name plate, in the profile card and in chat headers.
- Preferences: `claudePath` becomes `providers.<id>.path`; the default provider and per-role default model are per provider.
- Anything a provider cannot do is hidden through `capabilities`, never shown broken.

## First-run setup

Opens on first launch and whenever no provider is ready. It is skippable except where a choice is truly required: you cannot hire until at least one provider is **ready**, so step 2 cannot be skipped when none is. Steps 3 to 5 (project folder, defaults, first agent) are skippable with sane defaults. There is no "how it stays safe" step for now, since later features will touch provider and system files and that promise would not hold. It can be re-run from Settings. Setup never handles credentials: "needs sign-in" opens the terminals drawer with the provider's own login command.

## Spike results (agy 1.2.17)

1. **Interactive events: there are none to subscribe to.** No hooks; `cli.log` is noise; the conversation database fills in batches, after a step finishes. So agy gets a **screen adapter**, as Claude has. Verified screens: idle (`>` prompt, footer `? for shortcuts`), working (spinner `Generating…` / `Running…`, footer `esc to cancel`), permission asked (`Requesting permission for:`, `Run this command?`, a numbered menu with a `>` cursor), and a trust menu for a new folder.
2. **Rules and MCP.** Rules: agy reads global rules and the workspace's `.agents/rules`, `AGENTS.md`, `GEMINI.md`; adding a folder did not reliably inject rules, so per-launch house rules are sent as the first message (`agy -i`). MCP is global only; the plan is one global `agent-world` bridge entry that reads the agent's token from the environment the app sets on its terminal. Adding it changes `~/.gemini`, so it is an explicit, approved action; whether child servers inherit that environment is not yet verified.
3. **Transcript.** The protobuf in `steps` decodes with a small parser and stable-looking field numbers (user text, model text and tool calls, tool output, allow/deny). Read it with `sqlite3 -readonly`; it is undocumented, so a fixture test pins what was seen.
4. **Keys.** Esc interrupts a turn and cancels a permission; Ctrl+C twice exits; Shift+Tab cycles request-review, accept-edits, plan (the footer names the mode), so the mode can change live.

## Phases

1. Provider seam with Claude behind it, detection, preference migration, `provider` on agents. No visible change except the setup screens being ready to ship.
2. First-run setup, the provider tag, and the "no Claude installed" path.
3. agy at the level the spikes allow, then raised as each spike lands.
4. Limits for both providers, then cross-provider hand-offs.

## Decisions taken

- Only Claude Code and agy; no custom-command provider and no Gemini CLI in this version.
- Provider code in-repo, plain folders.
- Setup: required only where nothing else works, otherwise skippable and re-runnable.
