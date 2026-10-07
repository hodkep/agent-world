# Workflows: design decisions

A running record of what we decided about workflows (an AI development lifecycle the agents must follow), so it does not get lost.
Anything marked **Decided** was said by the product owner; anything marked **Proposed** is a suggestion still waiting for an answer.
Update this file in the same change as the work it describes.

Last updated: 2026-10-07

## The idea in one paragraph

A **workflow** is data: an ordered set of steps (plan, implement, test, review, document, security review, commit, deploy…), who does each step
(which agent, model, effort, skills), and the gates between them. It is defined globally and can be overridden per workspace/project.
Every piece of work that changes code runs through a workflow and is recorded as a **run**, drawn like a GitHub Actions pipeline: each step ticks
green when it passes and shows its own state when it fails, is skipped, or is stopped by the user. A chat-based builder helps people write
a workflow and suggests a model and settings for each step.

## Decided

| # | Decision |
|---|----------|
| D1 | The focus is the **workflow definition and its runs** (the data and how it is followed and shown), not a free-roaming "main agent" that decides everything. |
| D2 | Workflows are defined **globally and per workspace/project**. A project's own workflow takes priority over the global one. |
| D3 | Every session/run/task that changes code **must follow a workflow**, and is **tracked automatically** with no manual bookkeeping. |
| D4 | A run is recorded and shown as a **flow diagram like GitHub CI/CD**: green tick when a step passes, and distinct visuals for failed, skipped, stopped by the user, and the other states (waiting, running, cancelled…). |
| D5 | **Skills and prompts can be attached to the agent that does a step**, so each step follows the guidelines and uses the tools meant for it. |
| D6 | **Independent agents** can work outside any workflow, but only for tasks that **do not change code**. Anything that changes code follows a workflow. |
| D7 | The app has to get **skills and plugins management first**; the workflow feature builds on it. |
| D8 | Decisions are tracked in this file. |
| D10 | One **single store for skills, instructions and plugins across providers**, kept in the app, used by agents when needed. |
| D11 | **Workspace-level instructions are maintained in the app** and agents **fetch and read them on demand**, so tokens are not spent on text that is not needed. |
| D12 | The library is **one global store**. **Playbooks** (global default, per workspace, per role) decide which items an agent uses, when, and how strongly. Agents never get app-relative paths. |
| D13 | **Library use is tracked**, per item, per program and per agent: delivered at launch, triggered (the prompt matched the item's rule), and used (fetched through the tools, Claude's Skill tool, or a Read of the skill's file). "Triggered but not used" is the measure of an agent not considering an item. Claude is fully observed through hooks; agy only through the office tools (shown as not measured otherwise). |
| D14 | **A catalog keeps agents pointed at the library.** A short generated file per workspace (one line per on-demand item, 400 token cap, ids only past it) that the opening text names, so an agent that has lost track reads it again. The app does not rely on the agent doing so: each prompt gets one line for the items it matches, and the whole catalog is re-injected every 10 prompts and after a compaction (Claude, through hooks). agy gets the opening text and the file only. |
| D9 | The concept is still settling: the product owner is "not at all sure how this works in reality". We brainstorm and settle before building, with mocks approved first. |

## What exists today (so we build on it, not around it)

- **Skills:** found and offered in the message box's `/` list: a project's own, your own, and those of enabled Claude plugins; agy's folders likewise. There is no screen to browse, read, create, enable or assign them.
- **Plugins and MCP servers:** listed in the agent's Tools tab and enabled, disabled or removed through the program's own command. Nothing is tied to a role or a step.
- **Roles:** a saved bundle of model, effort, permission mode and extra instructions, used when hiring. This is the natural carrier for "skills attached to the agent that does a step".
- **Agents talking:** agents message each other and keep shared notes through the app's MCP server (`list_agents`, `send_message`, `recall`, `remember`); hand-off and review requests carry a branch and a worktree.
- **Cost and activity:** the ledger records spend, turns and limits per agent and per account; the app knows when an agent is working, waiting or idle, and sees hook events.
- **Landing work:** the Finish dialog checks and merges an agent's branch.
- **Missing:** a plan object, step state, a record of a run, routing by model/effort, per-step budgets, and any enforcement that code changes follow a process.

## Proposed (not yet decided)

### Shape of a workflow
- A workflow is a file: global in the app's data folder, per project in the repo (`.agent-world/workflows/`) so it is versioned and shared.
- A step has: an id, a name, who does it (a role: provider, model, effort, mode, attached skills and prompt), what it needs from earlier steps, what it produces, a gate (automatic, a check that must pass, or human approval), and a budget.
- Steps hand each other **files**, not conversation: a short brief and the paths of the artifacts (`plan.md`, `tasks/T3.md`, `review.md`). This is the biggest token saving.
- Steps are not only agents: a step can run a command (tests, lint, build), a CI/CD trigger, a commit, or wait for approval.

### How a run knows a step is done
- The agent reports through an MCP tool the app already hosts (for example `step_done` / `step_failed` with a short result and artifact paths), and
- cheap deterministic checks (tests, typecheck, lint, build) decide pass or fail where they exist, so a model's claim is never the only evidence, and
- a human approves where the workflow says so.

### Keeping "code changes follow a workflow" true
- Landing a branch (Finish) is **only allowed from a run whose required steps passed**.
- An agent with no run works read-only (the existing plan permission mode). If it tries to edit, the app offers to start a run.
- A change found in a worktree that has no run is attached to a run automatically ("adopted") so nothing is untracked.

### Recording a run
- One append-only log per run (the way the ledger works): step started/passed/failed/skipped/stopped, agent, model, effort, duration, cost, artifacts, commit.
- The pipeline view reads that log. A step opens to its agent's conversation, its diff and its artifacts. A failed step can be re-run.

### Skills first
1. A skills library: browse what is found (project, yours, plugins), read a skill, create or edit one, switch plugins on and off.
2. Attach skills and a prompt to a **role**; a step uses a role. Where a program loads skills itself, attaching pins it in the agent's instructions and makes sure it can be found.
3. Only then does a workflow step refer to them.

### Cost and quality (applies once steps have models)
- Three tiers by difficulty (mechanical, normal, hard) mapped to model and effort; escalate one tier when checks fail twice or review rejects.
- Cheap checks before an LLM reviews; a different model family reviews high-risk steps; fresh context per step with limited reuse.
- Budgets per step and per run with pause-and-ask at the cap; routing that follows the limits left per account and provider.
- The ledger shows what each step type really cost per model, and the builder suggests cheaper models where they passed review.

### Order of work
1. **Skills and plugins management** (library, attach to roles).
2. **Workflow data model, run recorder and the pipeline view**, first recording runs started by hand, so the diagram exists before any automation.
3. **Engine and gates**, with approval steps and check steps.
4. **Routing policy and escalation**, limits-aware.
5. **Chat builder** and starter templates (bug fix, feature, refactor, security review, release).
6. Parallel steps (independent tasks in their own worktrees), CI/CD and custom steps.

## Proposed: the library (skills, instructions, plugins)

Why agents ignore a rule that was "installed globally": the rule is advisory text in one program's file (`CLAUDE.md`; agy reads its own files), a skill only runs when the model decides its description matches, and a line read at the start of a long conversation fades. Delivery is not the only problem; reinforcement is.

- **One global store; playbooks scope it.** The store is global (in the app's data folder). A playbook (global default, per workspace, per role, per step) lists items with a mode (`always`, `on-demand`, `step`, `off`), a "when" and a strength. Precedence: global, workspace, role, step. Where a workspace's playbook lives (repo or the app's data) is still open.
- **Items.** Skills (the `SKILL.md` folder format both programs already use), instructions (short markdown rules), prompts (templates), and references to plugins and MCP servers. Each has a one-line description, tags, an activation mode (`always`, `on-demand`, `step`, `manual`) and a size estimate.
- **Plugins are references, not copies.** Packaging is program-specific, so the store shows one view (installed where, enabled for which account) and switches them through each program's own command, as the Tools tab does. A plugin's skills can be imported into the store so every provider can use them.
- **Three ways to deliver, cheapest first.**
  1. A tiny always-on core (a few hundred tokens at most) added at launch (`--append-system-prompt` for Claude): only rules that must hold, plus one line telling the agent to use the library.
  2. On demand through the app's MCP server (`library_index`, `library_search`, `library_get`): works for every provider that is connected to the office, with no per-program install. Only bodies that are asked for cost tokens.
  3. Pushed by the app where it must not be missed: a workflow step lists the items it needs and the app puts exactly those in the step's brief; for Claude a short per-turn reminder can come from a hook the app already registers (to be verified against the installed version).
- **Enforcement levels** per rule: soft (in the core), medium (reinforced each turn), hard (a check or gate, for rules that can be tested: commit message format, tests, lint).
- **Measure it.** Record which items each agent fetched; show use per item and per run, and flag items that are never fetched or are too big.

### Pilot: flow and delivery per program
Flow: import (copy; originals untouched) → compose a playbook → compile at launch → run (every fetch recorded) → observe → tune.

| | Opening text | On demand | Native skills |
|---|---|---|---|
| Claude Code | `--append-system-prompt` (already used for roles) | MCP tools on the office server | `--plugin-dir <generated folder>`: a session-only plugin holding just the allowed skills (flag checked present in Claude 2.1.292); nothing installed or changed globally |
| agy | its own instruction mechanism (the app already adds a line about the message box) | same MCP tools, once connected | none: no such flag; linking into a workspace's `.agents/skills` would touch the repo, so the pilot uses MCP only |

Paths: items are always by id. Content that mentions a bundled file comes back with the file's absolute store path, and both programs are started with `--add-dir <library folder>` so reading or running it does not ask. Plugins stay Claude-only references; their skills can be imported so agy can use them through MCP.

### Pilot: how it is tested
1. **Unit:** reading a `SKILL.md`; the compiled opening text for a playbook; an agent sees only items its playbook allows; the generated plugin folder is valid and holds only those; no path escapes the store.
2. **Fake programs:** the fake Claude and agy record how they were started (Claude: core text + `--plugin-dir`; agy: core text only); `library_index` and `library_get` through the bridge return scoped content and every fetch is recorded.
3. **Screens:** import, edit, playbook editor and the "what an agent sees" preview match the approved mock.
4. **Real agents (the one that matters):** scripted A/B on real Claude and agy, 20 short prompts each, a harmless test rule ("end every reply with `PILOT-OK`") and a test skill used only for commit messages. Variants: A nothing, B core only, C core + on demand, D C + per-turn reminder (Claude). Pass: C or D at least 90% on the rule where A is lower; at most 400 extra tokens a turn; the skill fetched in at least 80% of commit prompts. Spend is capped and shown before it runs.

### Pilot status (built)
- **Store and playbooks:** `src/main/library/` (store, sources, playbook, plugin folder, service); Settings, Library pane. The library lives in `<app data>/library/`; playbooks are `playbooks/global.json` and `playbooks/workspaces/<slug>.json` (private to the app for now).
- **Delivery:** the opening text joins the house rules; Claude also gets `--plugin-dir` (a folder rebuilt per launch under `library/run/<agent>`), `--add-dir` for the library, and `--allowedTools` for the three read-only library tools; agy gets the text, and the tools once connected.
- **On demand:** `library_index`, `library_get(id, file?)`, `library_search` on the office's MCP server, scoped by the caller's playbook; every use is logged to `library/uses.jsonl` (see D13) and counted per program in the Library pane.
- **Tracking and catalog (D13, D14):** `uses.ts` (log and summary), `match.ts` (a word-overlap matcher, weights run 0..1 by how rare a word is in the catalog, so the bar holds for 3 items or 300), `catalog.ts`. `service.remind(agent, prompt)` runs at each prompt: rule reminder, matched lines, catalog every 10th prompt or after `PostCompact`. The hook server passes the prompt and reports `PreToolUse` and `PostCompact`.
- **Reminder each turn:** the hook server adds `additionalContext` to `UserPromptSubmit` for agents whose playbook has medium or hard rules (Claude only).
- **Tests:** unit tests for each module, fake-program e2e (`e2e/library.e2e.ts`), and the real-agent pilot: `npm run pilot:library` (`PILOT_RUNS`, `PILOT_MAX_USD`), which writes `pilot-report.txt` (not part of the normal test run; it spends real usage).
- **Known limits:** an agent already running keeps the opening text it started with (the app's saved-session behaviour); plugins are not managed here yet (only their skills can be imported); skills that run bundled scripts are served by absolute path and untested on agy.

### Pilot findings (real agents, 2026-10-07)
Claude Code on Haiku 4.5 (agy on Gemini 3.8 Flash low), 3 to 4 prompts per cell, about $1.1 of usage in all. Small samples: read them as direction, not proof.
- **An always-on rule in the opening text is followed.** Claude: 0/3 without, 3/3 with. agy: 0/3 without, 3/3 with (sent as a first message, as the app does). The cost is tiny: about 45 tokens a turn.
- **An on-demand item is not reliably fetched.** The item held a fact the model cannot guess (ZEPHYR-7). With the opening text naming when to use it and the tools available, Claude fetched it 1 time in 4; with a per-turn reminder that only pointed at it, 0 in 4; loaded natively from the plugin folder (no tools), 0 in 4. The model asked for context instead. So "fetch on demand when it applies" cannot be what makes a rule hold.
- **The per-turn reminder channel works.** When the reminder carries the content itself, the answer was right 4 of 4. So the hook does reach the model; a reminder that only points at an item does not make it fetch.
- **Cost is noisy.** Tokens per run varied from 26k to 63k between runs of the same size because of how much was cached, so only the size of the added text is a reliable measure.
- **Consequences for the design:** (1) rules that must hold go in the opening text (short) or in the reminder as content; (2) an item a step needs is put in that step's brief by the app (mode `step`), not left to the agent to fetch; (3) on-demand is for optional reference only, and its measured fetch rate should be shown; (4) test on the models agents really use (Sonnet and Opus), not just Haiku, before settling numbers.

### Library at scale (2026-10-07)
Haiku 4.5 on the 48 real skills of this machine, all on demand, 8 tasks per variant (`pilot/scale.pilot.ts`). Small sample.
- Left to itself (catalog file and tools in reach): right skill used **0/8**. With the matched line added to each prompt: **5/8** (6/8 counting a run that used the user's own copy of the skill). Every skill loaded natively plus the line: 4/8. No skill was used on prompts about none (0/3). A run that used a skill cost about 100k tokens against about 31k for one that did not.
- Matcher over the 48 skills (free, prompts written by the author, so optimistic): right one first 15/18, in the top 3 17/18, pointed at something for 2 of 7 prompts about none.
- The every-10-prompts and after-compaction catalog was exercised with a real session in the next section.

### Models, long sessions, agy cost (2026-10-07)
Small samples (6 tasks per variant, 3 prompts about none), the same 48 skills; `pilot/scale.pilot.ts` with `PILOT_MODEL`, `pilot/session.pilot.ts`, `pilot/agy-cost.pilot.ts`.
- **Whether pointing is needed depends on the model.** Left to itself (catalog file and tools in reach), the right skill was used: Haiku 0/8, **Sonnet 5/6**, Opus 1/6. With the matched line each prompt: Haiku 5/8, Sonnet 5/6, Opus 5/6. No model used a skill on a prompt about none (0/3 each). So the push is what makes the weak model and Opus use the library; Sonnet mostly does it alone, and there the line mainly saves tokens (about 89k per run against 135k, because it stops it searching). Spent about $2.26 (Sonnet) and $4.33 (Opus). The "test fails once in twenty runs" task was missed by every variant of every model: the matcher missed it too (its words overlap no skill's), so it is a wording problem in the skill's "when", not a model one.
- **The catalog comes back as built.** One real Claude session (Haiku, 11 prompts then `/compact`): the catalog arrived on prompt 10 and not on 1-9 or 11, the PostCompact hook fired once, and the next prompt carried it. Both probes, worded so the matcher would not point at the right item, were answered correctly by reading the item (ZEPHYR-7, OSPREY-3). Caveat: the opening text (an appended system prompt for Claude) already lists every item's "when", so this does not show the catalog itself changed an answer; it matters where the opening text can be compacted away (agy sends it as a first message). The session cost about $0.17; the pilot's own total double-counted a resumed session's running cost and was fixed.
- **agy: the injected line is cheap.** The same ten prompts in two fresh conversations, plugin silent against pointing every turn (the worst case): total tokens **+1%** over ten turns (378k against 375k), last turn +1%, and the prompt cache grew identically (cache_read 129,970 against 129,961). The earlier "about 40% more by turn 4" was one sample and does not reproduce. A message can point at up to three items (22 over 10 messages).
- **Matcher:** one pilot probe ("go live with the new build") was pointed at an onboarding item by the word "new"; everyday words (new, make, get, need, just, like...) are now ignored. The at-scale matcher numbers did not change (right one first 15/18, top 3 17/18).

### agy: hooks (2026-10-07)
Found in the agy binary's own docs and checked with a throwaway plugin, in print and in the interactive terminal.
- A plugin's `hooks.json` (an object keyed by hook name) registers `PreInvocation`, `PostToolUse` and others; hooks are shell commands, run in both modes, and inherit the agent's environment (so the token the office puts there reaches them).
- `PreInvocation` can return `injectSteps` with an `ephemeralMessage`. It reached the model: a fact it could not guess (ZEPHYR-7) was answered 2/2 against 0/1 without; a bare instruction ("end with PINEAPPLE") was ignored because agy's own global rules shape the reply. It is not given the prompt, only the path of the saved conversation (a JSONL file).
- The injected message stays in the conversation (one step per injection). A first 4-turn sample suggested about 40% more tokens by turn 4; a 10-turn re-run (see "Models, long sessions, agy cost") found +1% and an unchanged cache, so it was noise. The hook still sends a line only when the message matches an item, once per message.
- `PostToolUse` gives the tool and its arguments (`view_file` with the absolute path): that is how a read of a skill file is counted. `PreToolUse` is not used: its answer decides what agy may do.
- Reading a file outside the workspace asks for approval; `--add-dir <library>` (already passed) removes the prompt.
- Built: `providers/agy/libraryHook.ts` (answers the hooks), `plugin.ts` (the plugin the Connect step installs: `aw-library`, two hooks and one script that posts to the office's `/hook/<event>` with the agent's token), and the Connect plan for agy now also installs the plugin. Without a token in the environment the script prints `{}`, so it is silent in agy sessions the office did not start.

### Research (2026-10-07): how to make agents follow rules
Full report: `reports/Making coding agents follow instructions.md` (notes in `research_notes/`). Mostly small-sample, single-vendor and Claude-centric evidence; its own list of claims to verify comes first before anyone relies on a number.
- Rule files are advice, not enforcement (Anthropic's docs say so); only hooks, permissions and an engine that blocks a tool call bind the model. Keep rule files short (Anthropic: under about 200 lines).
- Skills and fetch-on-demand tools are skipped when the model has to decide to get them: another test saw a skill never invoked in 56% of runs, 53% pass by default, 79% with an explicit "use it", and 100% when an index of the content was always in context. A hook that forces the model to evaluate every skill each turn raised activation from about 50% to 100% on Sonnet 4.5 (one author's harness), at about 2 seconds a turn.
- Multi-turn use degrades adherence (about 39% average drop across 15 models in one study); restating requirements at the end of the context recovers part of it.
- Forced tool use is not available on current Claude models (400 error), so the dependable levers are: always-on short rules, content-carrying per-turn injection, the engine putting a step's items in its brief, and hook or gate enforcement.
- Both Gemini CLI and agy have hooks (Gemini CLI's `BeforeAgent` `additionalContext` is the per-turn analogue); agy's hook output format and rule precedence are undocumented in what was found.
- Bundled scripts run by absolute path on both programs; only the permission to run them gates it (tested in print mode for agy).

## Open questions

0. Library: is serving on demand through the MCP server, with only a tiny core pushed, the right default? Where should workspace items live by default (in the repo, or private in the app's data)? Should existing skills and instruction files be adopted automatically as read-only sources?


1. Is an engine in the app that walks the steps, with agents working inside each step, acceptable (instead of a fully autonomous main agent)?
2. Which gates always stop for a person: plan approval, before merge, before deploy?
3. Is there one economy / balanced / max-quality dial that shifts every tier at once?
4. One run per piece of work, or a standing pipeline like CI that triggers on events?
5. What counts as "changes code" for enforcement: any edit in a git worktree, or only commits?
6. First version: a linear pipeline of about five steps, with parallel steps later?
7. Which AI-DLC terms do we adopt? The published AI-DLC has Inception, Construction and Operations with short iterations and a person validating at each gate; this was written from memory and should be checked against the current source before we copy any wording.

## Change log

- 2026-10-07: the library UI is built from the picked mocks; added the model comparison (Haiku, Sonnet, Opus), the long-session catalog check and agy's cost over ten turns.
- 2026-10-07: first version, from the brainstorm. Decisions D1–D9 recorded; the rest is proposed.
- 2026-10-07: added the at-scale results and the agy hooks findings; the agy adapter is built (pilot/agy.pilot.ts measures it).
- 2026-10-07: added D13 (usage tracking) and D14 (catalog and matched hints), and the at-scale pilot (`pilot/scale.pilot.ts`).
- 2026-10-07: added D12, the pilot's delivery per program and its test plan.
- 2026-10-07: added D10–D11 (single store, workspace instructions on demand) and the proposed library design.
