# Token usage: monitoring first, then saving

Research only, nothing built. Question: how can Agent World show how many tokens agents use (workflows, playbooks and to-dos all add to the context), and which free open-source tools can do that or cut the tokens, instead of building our own?

Facts below were read from each project's own repo or docs on 2026-10-27. Star counts and benchmark figures are what the projects say about themselves, not something we measured.

## What the app has today

- Claude's status line is parsed in `src/main/providers/claude/status.ts`: `context_window.used_percentage`, `total_input_tokens`, `total_output_tokens`. The chat's context ring (`AgentControls.tsx`) shows them for the agent that is open.
- agy reports tokens, not dollars; the same popover shows "N read · N written".
- Library slips estimate a library item as `length / 4` tokens (`LibrarySlips.tsx`).
- Missing: a history (per day, per project, per agent), cache read and write split, and any answer to "which of our additions (workflow plan, reminder, library item, to-do list) cost the most". Today there is only the current number for the open agent.

## Monitoring: options

| Option | What it is | Licence | Fit |
|---|---|---|---|
| Claude Code's own OpenTelemetry export ([docs](https://code.claude.com/docs/en/monitoring-usage)) | Built in. `CLAUDE_CODE_ENABLE_TELEMETRY=1` plus OTLP, Prometheus or console exporter. Metrics `claude_code.token.usage` (type input, output, cacheRead, cacheCreation; model; query_source) and `claude_code.cost.usage`. Event `claude_code.api_request` has tokens, cost and `request_id`, with `session.id` and `prompt.id` to join on. | Part of Claude Code, no extra software | Most exact, and it splits by query source and attributes cost to agent, skill, plugin and MCP, which is the "what added to the context" question. Needs a receiver; an exporter set in a repo's `.claude/settings.json` is ignored (managed settings or the agent's own environment only), so the app would set the environment when it launches an agent. Claude only. |
| [ccusage](https://github.com/ccusage/ccusage) | CLI that reads agents' local session logs. Daily, monthly, per session, 5-hour blocks, `--json`, cache tokens separate, `--by-agent`. Reads Claude Code, Codex, OpenCode, Amp, Gemini CLI, Antigravity and about a dozen more. | MIT, checked in four places (see Licences) | Best "do not reinvent": nothing to run beside the agent, works after the fact, covers agy's family too. Cost is computed from a price table, so it is an estimate. Its README marks the status-line mode Beta. Shelling out to `npx ccusage --json` from the main process is enough for a first version. |
| [Claude-Code-Usage-Monitor](https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor) | Terminal live monitor with burn-rate predictions. | MIT | Pretty, but a terminal UI of its own; little we could embed. Last push 2026-07. |
| [claude-code-otel](https://github.com/ColeMurray/claude-code-otel) | Grafana, Prometheus and Loki stack with ready dashboards for the OTel export above. | MIT | Heavy for a desktop app (three services). Last push 2025-06. Useful as a reference for which panels matter. |
| [ccmon](https://github.com/Yukaii/ccmon) | Terminal OTLP receiver. | Apache-2.0 | Tiny (0 stars), last push 2025-09. Not a base to build on. |
| [OpenTelemetry Collector](https://github.com/open-telemetry/opentelemetry-collector) | The standard receiver and router for OTLP. | Apache-2.0 | Only needed if the app should receive OTLP itself; a small OTLP/HTTP endpoint in the main process would do the same job for this one stream. |
| Ponytail's own band and board (see below) | Cost, tokens and agent time per task, in Claude Code. | MIT | Already in our library; Claude Code only. |

### Recommendation for monitoring

1. **Phase 1, no new code to run: ccusage.** Run it as a command for a project or session, show the numbers in the existing context popover (or a Usage tab): tokens by day and by session, input, output, cache read, cache write. Covers Claude and, per its README, other programs. Smallest change, MIT, maintained (pushed today).
2. **Phase 2, for "what costs what": Claude's OTel export.** The app launches each Claude agent, so it can set the exporter environment and receive OTLP/HTTP. Then each `api_request` is tied to a prompt, a session and a request; join it with the app's own marks (a workflow step started, a library item given, a to-do list read) to answer "this plan cost 14k tokens". This is the only source that is exact and attributes to skills, plugins and MCP. Claude only; agy stays on ccusage or its own counts.
3. Not worth taking: the Grafana stack, the live terminal monitors.

## Saving: the three named tools

### Ponytail ([DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail), MIT)

Already in our library (`ponytail`, `ponytail-gain`, `-audit`, `-review`, `-debt`). Its aim is less code, not fewer tokens: the README says "The rule was never fewest tokens". Its own benchmark (39 tasks, Opus 5.5, 5 runs each, Claude Code) reports -45% tokens, -26% cost, -53% code, with 98% of risky logic shipping with a test (68% without). Self-reported. It also has a band above the prompt (cost, tokens, agent time, reuse, tests; Claude Code 2.1.290+, not `claude -p`) and a local board over `~/.config/ponytail/band/`, with `/ponytail band import` for past sessions. That is a second free monitoring source for Claude, no work on our side.

### Headroom ([headroomlabs-ai/headroom](https://github.com/headroomlabs-ai/headroom), Apache-2.0)

Compresses what the agent reads (tool output, logs, files, RAG chunks, history) before it reaches the model; originals are kept locally and fetched back through `headroom_retrieve` (reversible). Runs locally. Forms: library (Python, TypeScript), a proxy (`headroom proxy`), `headroom wrap claude|codex|...`, an MCP server (`headroom_compress`, `headroom_retrieve`, `headroom_stats`), and `headroom dashboard` for live savings. It also offers `headroom learn` (writes corrections to `CLAUDE.local.md` and the like), cross-agent memory and output trimming. Its own proof table shows code search at -21% and JSON far more (claims of 60-95%); the headline "20% fewer tokens for coding agents" in the repo description is the honest figure for our kind of work. Costs and risks to weigh:

- The proxy sits between the agent and the provider. For the app that is a new moving part that every agent's traffic goes through, and a failure there stops agents. The MCP form is optional and safer to try.
- `wrap` registers Serena as an MCP server and edits `~/.claude.json`; `unwrap` undoes it. The app would have to own that, per account, since accounts have their own config.
- It could undo prompt caching if it rewrites early parts of the prompt; the README says CacheAligner only flags volatile content and never rewrites prompts. Check on a real session before trusting it.
- Python install (`uv tool install` or pip) is an extra dependency for a desktop app; the npm package is only an SDK.

### asd-ste100-skill ([danyuchn/asd-ste100-skill](https://github.com/danyuchn/asd-ste100-skill), MIT)

A Claude Code skill that rewrites agent-facing English (tool descriptions, error messages, instructions between agents) into ASD-STE100 Simplified Technical English, with a linter script `scripts/ste-lint.py`. Its page makes no token claim: the stated aim is less ambiguity. Short sentences and one meaning per word often shorten text a little, but it can also lengthen it (STE prefers full words over contractions and bans some compact phrasing), so treat it as a clarity tool for our own injected text (workflow reminders, plan-gate prompts, library hook text), not as a saver. Install sends anonymous telemetry unless `DISABLE_TELEMETRY=1`; copy the skill by hand instead of using `npx skills add`.

## Where our own context growth comes from

What the app puts into an agent's context, to measure first (none of it is measured yet):

- the workflow reminder and plan-gate text (the app adds a reminder to prompts; see `e2e/workflows-reminder.e2e.ts`; its size was not read here),
- the library hook (`libraryHook.ts`, `libraryReminder.ts`): index lines plus each item the agent reads,
- to-do board text and the shared notes the agent is told to recall,
- the project and global `CLAUDE.md`.

Measure these as before/after: a fixed prompt, with and without each item, through ccusage (per session totals) or OTel (per request). Only then choose what to trim; the cheap wins are probably shorter reminders (here asd-ste100 can help with wording) and reading library items on demand rather than listing them.

## Pilot measurement (2026-10-27)

Method: `claude -p --output-format json` (it returns exact usage and cost per run), Sonnet 5.5, a clean scratch project with no project `CLAUDE.md`, `--setting-sources ""`, three runs per cell. Variant `ponytail` = the library's `ponytail/SKILL.md` appended to the system prompt. Two tiny tasks: add `debounce` with a test, and fix an off-by-one in `cart.js`. Every run passed its tests. "in" counts input plus cache write plus cache read over all turns. The account-level `CLAUDE.md` still loaded, so about 24k tokens of fixed context are in every cell.

| Task | Variant | Turns | In | Out | Cost |
|---|---|---:|---:|---:|---:|
| debounce | base | 4.3 | 86,112 | 1,100 | $0.067 |
| debounce | ponytail | 5.3 | 82,411 | 1,307 | $0.080 |
| fixbug | base | 4.0 | 64,618 | 562 | $0.061 |
| fixbug | ponytail | 4.0 | 70,280 | 520 | $0.070 |

Read: no saving at this size. Ponytail's skill text adds roughly 2k tokens to every call, and a task this small cannot win that back; cost was +16% to +20%. What changed was the code, not the tokens: the debounce test went from 29 lines to 14. With three runs and tasks this small the differences in turns and tokens are within noise; it needs bigger tasks and more runs before it says anything. Total spend for the 13 runs: about $0.89.

Reproduce: the runner is a 15-line shell script (`run.sh <task> <variant> <n>`); it is in the session scratchpad, not in the repo.

## Licences, checked against the files (2026-10-27)

GitHub's licence badge can be wrong or empty, so each was read from the repo's own `LICENSE`, the package registry and the package's own metadata.

| Tool | Licence | Where it was read | Can we use it? |
|---|---|---|---|
| ccusage 20.0.45 | MIT | `LICENSE` at the repo root and `apps/ccusage/LICENSE` (same file, 21 lines, the full MIT text, "Copyright (c) 2025 ryoppippi"); `"license": "MIT"` in `apps/ccusage/package.json`; npm registry; the installed `ccusage` and `@ccusage/ccusage-darwin-arm64` packages both say MIT; the npm tarball ships a `LICENSE`. | Yes, as a dependency or a tool we run. GitHub shows "NOASSERTION" for this repo only because its detector did not match the file; the file itself is complete. Keep the copyright line and licence text if we ever bundle it. Not checked: the licences of the Rust crates compiled into its native binary (the MIT file covers ccusage's own code only). |
| Claude Code OpenTelemetry export | Not a separate package: a feature of Claude Code, which we already run as the agent. The OTLP wire format is an open standard. | [Claude Code docs](https://code.claude.com/docs/en/monitoring-usage) | Yes. Our receiver would be our own code. |
| asd-ste100-skill | MIT ("Copyright (c) 2026 Dustin Yuchen Teng") | `LICENSE`, `.claude-plugin/plugin.json` | Yes. It deliberately does not ship ASD's STE dictionary, which ASD does not allow to be redistributed; the skill says so. We must not copy that dictionary in either. |
| Ponytail | MIT | `LICENSE` | Yes. |
| Headroom | Apache-2.0 (`LICENSE` and a `NOTICE` file) | repo files. PyPI metadata for `headroom-ai` 0.42.0 has an empty licence field and no licence classifier, so do not rely on PyPI for it. Its model `kompress-v2-base` is Apache-2.0 on Hugging Face (built on ModernBERT-base). | Yes to use. If we ever bundle it, keep the `NOTICE`. It pulls in 113 dependencies (including `litellm`); a licence scan of that tree is still to do. |
| Serena (installed by `headroom wrap`) | **Split: GPL-3.0-or-later for the application, MIT for its SolidLSP part** (`LICENSE` overview in `oraios/serena`) | repo `LICENSE` | Fine to run as a separate tool on a person's machine. **Do not bundle or link it into Agent World** (Apache-2.0): GPL would then apply to the whole. This is the one real licence trap found. |
| Agent World | Apache-2.0 (`LICENSE`, `package.json`) | this repo | MIT and Apache-2.0 code can go in; GPL cannot. |

## Test 1: Claude's OpenTelemetry export

Method: a 15-line standard-library Python receiver on `127.0.0.1:4318` (OTLP over HTTP/JSON); one real `claude -p` run with `CLAUDE_CODE_ENABLE_TELEMETRY=1`, `OTEL_METRICS_EXPORTER=otlp`, `OTEL_LOGS_EXPORTER=otlp`, `OTEL_EXPORTER_OTLP_PROTOCOL=http/json`, `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318`, short export intervals. The run finished and the export arrived with no flush call from us (12 posts to `/v1/metrics` and `/v1/logs`).

| | Claude's own JSON result | OTel metric `claude_code.token.usage` / `cost.usage` | OTel `api_request` events (3, summed) |
|---|---:|---:|---:|
| input | 6 | 6 | 6 |
| output | 636 | 636 | 636 |
| cache read | 52,799 | 52,799 | 52,799 |
| cache write | 11,848 | 11,848 | 11,848 |
| cost | $0.05904 | $0.05904 | $0.05904 |

Exact match. Also seen:

- Events in one run: `user_prompt`, `api_request` (x3), `tool_decision` (x3), `tool_result` (x3), `assistant_response` (x2), `plugin_loaded`, `mcp_server_connection`, `managed_settings_resolved`. Each `api_request` has `prompt.id`, `request_id`, `query_source` (`main`), `model`, `effort`, `speed`, `duration_ms`, `ttft_ms`, `cost_usd_micros`, and the 5-minute and 1-hour cache-write split.
- **Personal data is in the stream.** `user.email`, `user.account_uuid`, `user.account_id`, `organization.id` and `user.id` were on the events. A receiver in the app should keep only what it needs and drop those. Prompt and reply text were not sent (they need `OTEL_LOG_USER_PROMPTS=1` and `OTEL_LOG_ASSISTANT_RESPONSES=1`; leave them off).
- The session id on the metrics is the same as the `session_id` Claude's JSON result gives, so it joins to an agent without guessing.

## Test 2: ccusage

Installed into a scratch folder with `npm install --ignore-scripts` (no install scripts run), then `ccusage claude session --json --offline` (offline: no price download). The same session as Test 1 appears with input 6, output 636, cache read 52,799, cache write 11,848, cost $0.059044. Exact match with both Claude and OTel; it read the session from the account's own folder (`CLAUDE_CONFIG_DIR`), so it follows our per-account setup. It listed 227 sessions from this machine in one call, so for the app it would be run per project or per date. Note ccusage only sees sessions Claude saved: a run with `--no-session-persistence` (as in the pilot above) leaves nothing for it.

## Test 3: asd-ste100 on two of the app's own injected texts

The skill's files were read first; its linter `ste-lint.py` imports only the standard library and opens files only to read them (and one temp file in its self-test). Cloned into scratch (not `npx skills add`, which sends install telemetry). Texts: `WORKFLOW_HINT` and `WORKFLOW_REMINDER` from `src/main/workflows/hint.ts`. Rewritten by Sonnet 5.5 with `SKILL.md` appended, strict mode, told to keep every instruction and tool name.

| Text | Linter before | Linter after | Words | Characters |
|---|---|---|---:|---:|
| hint | 7 violations (5 hard) | 1 (0 hard) | 113 → 128 | 596 → 699 (+17%) |
| reminder | 2 violations (1 hard) | 1 (0 hard) | 50 → 72 | 277 → 394 (+42%) |

Sample, the reminder, after: "Before you act, decide if the request changes code or takes several steps. If it does, call task_begin first. Set follow_up: true only if the request is more work on the task that you just finished. Do not set follow_up: true if the request is a different piece of work. When the work is finished, call task_done. Do not call task_begin or task_done for a question, a typo, or a tiny edit." (tool names were kept; no instruction was lost on a read-through.)

Read: clearer, and the linter's hard violations go to zero, but the text gets longer, so it costs tokens rather than saving them (about +25 and +30 tokens on each prompt that carries them). Whether the clearer wording makes agents follow it better is untested here; that needs agents run with each wording and a count of how often `task_begin` was called.

## Where it plugs into the app

What exists: the top bar's **Usage** button (`App.tsx`, `IconButton icon="money"`) opens `UsageModal` (`src/renderer/stats/UsageModal.tsx`): allowances (5-hour and weekly), then spend by account, program and project over 7/30/90 days, in dollars or tokens (`Metric = 'usd' | 'tokens'`). Its data is `window.aw.overview(days)`, built from the app's own **ledger**, `ledger.jsonl` in the app's home folder (`src/shared/ledger.ts`, written by `record()` in `src/main/index.ts`). Ledger events today: `cost` (dollars, from Claude's status line, or estimated), `tokens` (input and output only, for programs that report tokens), `work`, `limit`. Per-agent, `UsageRing` in `AgentControls.tsx` shows the context ring and read/written totals.

What it lacks: cache read and write (the big part: 52k of 65k tokens in the test), per-request and per-prompt detail, and any link from tokens to what the app added (a workflow reminder, a library item, a to-do list).

Integration options, smallest first:

1. **ccusage into the ledger (no receiver).** The main process runs the pinned ccusage with `--json` per account folder on open of the Usage modal or on a timer, and fills a new "Cache and totals" block. Simple, but it is after-the-fact, Claude-family only for the exact cache split, and a child process with a 538 kB package plus a native binary to ship.
2. **OTel receiver in the main process (recommended for Claude).** A small OTLP/HTTP endpoint beside the hook server (`src/main/providers/claude/hookServer.ts` already runs a `127.0.0.1` server on a random port), and the Claude launch (`src/main/providers/claude/launch.ts`) adds the OTLP env for each agent it starts. Each `api_request` becomes a new ledger event kind (for example `k: 'req'`: agent, prompt id, request id, model, input, output, cacheRead, cacheWrite, usd) after dropping the personal attributes. `UsageModal` gets a cache split and a "per prompt" view; `UsageRing` can show the last request's tokens. No new dependency (our own code, open standard). Must be checked: the env reaches an agent started in a per-account `CLAUDE_CONFIG_DIR`; that the app's port is not exposed beyond `127.0.0.1` (add a token as the hook server does); and what happens to agents already running when the app starts (they have no OTLP env until restarted).
3. **Attribution to our own additions.** The app knows when it sent a reminder, started a workflow step or handed over a library item, and OTel gives the `prompt.id` of each prompt; joining them in the ledger gives "the workflow reminder cost N tokens this week" without guessing. Build after 2.

agy and other programs stay on their existing `tokens` events until a source for cache splits is found (ccusage lists Antigravity; not run here).

## Suggested order

1. Monitoring phase 1 with ccusage (read-only, MIT), shown in the popover. Ask: which programs must be covered (Claude, agy, both)?
2. Measure our own injections with it; write the numbers here.
3. Monitoring phase 2 with Claude's OTel export if per-request attribution is wanted.
4. Try Headroom's MCP form on one agent for a week, compare ccusage totals with and without; only then consider the proxy.
5. Keep Ponytail as is; point people at its band.
6. Use the STE linter on our injected texts if the measurement shows they are big.

## Not verified

- Whether ccusage reads agy's saved conversations (its list names "Antigravity" and "Gemini CLI"; not run here).
- Headroom's savings on our real agent sessions, and its effect on prompt caching.
- ccusage's price table against the accounts in use (cost is an estimate; subscription plans are not billed per token).
