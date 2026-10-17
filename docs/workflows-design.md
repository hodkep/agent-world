# Workflows: design decisions

A running record of what we decided about workflows (an AI development lifecycle the agents must follow), so it does not get lost.
Anything marked **Decided** was said by the product owner; anything marked **Proposed** is a suggestion still waiting for an answer.
Update this file in the same change as the work it describes.

Last updated: 2026-10-08

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
| D15 | **An engine in the app walks the steps, with agents working inside each step**, on one condition: it must not cost tokens or hurt agent performance. So the engine is plain code outside the model (no LLM decides what step is next), steps hand each other files, and it adds no text to an agent's context beyond the step's brief. No orchestration framework for now (see "Framework or our own engine" below). |
| D16 | **Three gates stop for the person by default: plan approval, before merge, before deploy.** They are settings, not rules: the person can change which gates apply (globally, per project, per workflow) at any time, including after a workflow exists. |
| D17 | **One dial (economy, balanced, max quality) shifts the model and effort of every step at once.** A step can still override it. |
| D18 | **A run is a task, not a session.** A session can hold many tasks, additions to a task and follow-ups; the agent identifies task boundaries (see "Tasks and follow-ups"). "Changes code" means **a commit**. |
| D19 | **First version: a linear pipeline of about five steps.** The end goal is **user-defined workflows made by chatting with a dedicated, pre-created builder agent**, like one hired in the app but supplied ready-made. |
| D20 | **Terms come from research on AI-DLC and what its main contributors published**, not from memory (first pass in "AI-DLC research" below). |
| D21 | **Task boundaries are found as proposed under "Tasks and follow-ups"**: the agent says so with `task_begin` and `task_done`, a commit or an approved plan ends a round, and the app asks once when a message does not fit. A follow-up is **round 2 of the same run**. A commit outside a task is **flagged, not blocked** (no git hook in the first version). |
| D22 | **The intent check (read-back block and blocking open questions at the plan gate) is built first; the small-task skip is the agent's own call, following an instruction we ship**, not a rule in code. The separate small-model check stays at the max dial position only. |
| D23 | **Workflows are a feature with a switch, off until turned on** (decided 2026-10-12 from the approved mocks). On first run the Features step offers it with its cost per dial level; later it is Settings → Features. Off hides the Workflow tab, the top-bar Workflows button and the recording tools. On adds the top-bar Workflows window (runs and stats across agents). Turning it off with open runs lets them finish, starts none new and shows "winding down" until they end (built with the recorder). The cost figures are estimates on printed assumptions until a real run measures them. |
| D24 | **An agent that commits without announcing a task still gets a run, started by the app from the commit** (marked as the app's doing; no model call; only commits made after workflows were switched on). The agent's own `task_begin` is better and wins whenever it is used. Decided 2026-10-12 after a real-agent pilot found agents record about half their tasks. |
| D25 | **The plan gate (built 2026-10-12).** `task_begin` tells the agent to write `.agent-world/plan.md` starting with the four read-back sections (goal, assumptions marked given or guessed, out of scope, open questions with choices) and call `plan_submit`. The app checks the block in code and sends every problem back at once. The person answers in the chat (approve, request changes with a note, answers to the questions); the answer is typed into the agent's prompt. From `task_begin` until approval, edits (Edit, Write, MultiEdit, NotebookEdit) are refused by the hook the app already hosts, except to `.agent-world/`; Bash is not held back. Only a task's first round is gated; a follow-up round, a task the app started from a commit and a finished task are not. The person can always lift the hold ("Let the agent edit without approval"). Switch: Settings → Features → Plan gate, on with workflows. agy agents are only asked to wait (it has no such hook). |
| D26 | **The merge gate and the audit (built 2026-10-12).** Finish asks the server, not only the dialog, whether landing may go ahead. It is held while the plan was never approved (a hold lifted by the person counts, a run the app started from a commit needs none) and while an audit finding is unseen. Nothing else holds it: a run still open, commits made outside the task and a failed audit are shown as notes. "Land anyway" is always possible and is logged with what was holding it. The audit is one separate headless call (`claude -p`, no tools, skills, MCP, session or settings) with the plan block and the branch's committed diff (capped at 40 KB, cut at a file boundary and said so), under the agent's own account, once per branch head, started when Finish opens. Findings are out of scope, goal not met or guess wrong, parsed in code; anything malformed is dropped. Economy: no audit. Balanced: haiku. Max: sonnet. agy: no audit. Switch: Settings → Features → Merge gate. |
| D27 | **The dial changes what the app does (built 2026-10-12).** Economy: the plan instruction lets the agent skip the plan when the whole change fits in one sentence, so with no plan submitted edits are not held and landing is not held for a missing plan (a plan that *was* submitted is still gated); no audit, no intent check. Balanced: a plan every time and a haiku audit. Max: a plan every time, a sonnet audit and (slice 7) the intent check. The dial does not relaunch agents or change their model. The cost table now has two numbers per level: what lands in the agent's context (briefs 750; plan block 250 from balanced up) and separate model calls (audit ≈ 4,000 tokens, about $0.0004 on haiku, measured; intent check ≈ 2,000, a guess). |
| D28 | **The intent check (built 2026-10-12, max dial only).** When the agent hands in its plan at the max dial, a separate haiku call reads the person's request (their last three messages, from the agent's conversation, leaving out the office's own) against the plan and lists at most three things the request leaves open that matter to the person. They are added after the agent's own questions, marked "From check", and the plan reaches the person with them, so approval waits for them like any open question. A question the plan already asks is not repeated. A failed or unreadable check is shown ("This is the plan as the agent wrote it") and never blocks. Claude agents only; nothing is asked below max or when the person has typed nothing. Prompt v2 (clear requests are the usual case; ask only when two engineers would build visibly different things that matter to the person) was chosen from a 40-call haiku pilot: v1 named the hidden gap 19/20 but was quiet on only 2/20 clear requests (44 wasted blocking questions); v2 named it 14/20 and was quiet on 20/20. Small sample, hand-written plans, the same cases the prompt was tuned on, so the v2 figures are optimistic. |
| D29 | **Workflows are JSON files** (decided 2026-10-12): global in `HOME/workflows/<id>.json`, per project in `<repo>/.agent-world/workflows/<id>.json`, a project's own winning on the same id. Validated in code, every problem reported at once. Format and step kinds are under "Proposed: the workflow file". |
| D30 | **All six step kinds in the first version**: `plan`, `work`, `check`, `audit`, `approve`, `merge`. Linear, at most 12 steps. `Standard` is today's behaviour as a built-in file. |
| D31 | **A task gets its project's default workflow**, and the agent may pick another from the (at most five) listed in its opening text through an optional `workflow` on `task_begin`. |
| D32 | **The builder never writes a file by itself**: it proposes, and the person saves the proposal to the project or globally. |
| D33 | **A repo's `check` commands need the person's approval per file version**: the exact commands are shown, approval is remembered for the file's content hash, any edit asks again. Commands run only in the agent's worktree, with a time limit and truncated output. |
| D34 | **Layouts chosen 2026-10-12:** the Workflows window gets Runs and Workflows tabs; the Workflows tab is a list with the chosen workflow's steps beside it (mock C); the builder is a split inside the window, chat on the left and the draft on the right (mock B), entered from a "describe it" box (mock D). The builder surface is therefore a second place a chat is shown, reusing the chat component. |
| D35 | **The workflow file, store and list (built 2026-10-12, slice 8).** `parseWorkflow` checks a file in code (version, id, name, steps, each kind's own fields, gates that fit the kind) and reports every problem at once; unknown fields are refused so a builder's typo is caught. `Standard` (plan, build, audit, land) is built in, always present, and replaceable by a file with id `standard`. Files are read from the app's `workflows` folder and the open project's `.agent-world/workflows/`; a project's wins on the same id; a file that does not read is listed with its problems, never dropped; files over 100 KB and ids that are not plain are refused. Each entry carries a content hash for the later command approval (D33). The default per project is kept in preferences (`workflows.defaults`), not in the repo. The Workflows window's new tab lists, shows steps, makes a default, copies (to the project or for everything) and deletes (with a question). The engine still ignores all of it: agents behave as in slices 1 to 7 until slice 9. |
| D36 | **The run follows the workflow (built 2026-10-13, slice 9a).** A task gets its project's default workflow, or the id the agent passes to `task_begin`; an unknown id falls back to the default and the reply says so. The run keeps the whole file as it was (steps, briefs, hash) in its `begin` event. `task_begin` answers with the workflow's brief (the plan line only when a plan is asked for) and `step_done` reports a step the agent does; `task_done` marks any left as the app's doing. Step states are derived from the log, never stored twice: plan from the plan events, audit from the audit, merge from the landing, work from `step_done`, approve from the person's answer. The plan step's own gate decides whether edits are held (`auto` none, `approve` always, nothing named follows the Settings switch), likewise the merge step for landing; a workflow with no plan or audit step needs none. A step the person must approve (an `approve` step, or a `work` step with gate `approve`) shows as a panel in the chat, counts on the Workflows button, holds landing by name, and sending it back types the note into the agent. Runs the app started from a commit have no workflow. `check` steps are listed but not run until 9b. The opening text lists up to five other workflows (`id: when`) when there is a choice. |
| D37 | **Check steps (built 2026-10-13, slice 9b).** When the agent reports the work before a check (or finishes the task) the app runs the checks that are due, in order, in the agent's worktree through the shell, with a 5 minute limit (the process and its children are killed), the app's environment with the person's login PATH and without the office's own settings or tokens, and only the last 4 KB of cleaned output kept. A failure is typed into the agent (command, exit code, output tail, "still the same task") up to `retries` times (default 2, so up to 3 runs); after that the person gets a panel: run again (all tries back) or skip. Finish runs only checks that have not run for the branch as it is now, so looking at it never uses up tries. A check with gate `pass` (the default for a check) holds landing by name; `auto` only reports. Checks and approvals hold landing even when the merge step says `auto`, which switches off only the plan and audit rules. Commands from a **project's** file need the person's approval of that exact content (kept in `workflow-approvals.json`); an edit asks again and shows the difference against the version approved before; declining holds landing by name until approved; global files and Standard need none. Not sandboxed: an approved command runs with the person's rights. |
| D38 | **The builder (built 2026-10-13, slice 10).** One Claude agent per project, made on first use and found again by a mark on its record (`builder`), named `builder`. It works in the project folder itself in plan (read-only) mode with its own instructions, built from the file format's tables so they cannot drift (`builderInstructions`), and with no task tools. It has three tools, offered to it alone: `workflow_list`, `workflow_get`, `workflow_propose(file)`. They must declare `readOnlyHint`: a real Claude in plan mode refuses any MCP tool that does not (pilot: 0 drafts in 6 requests before, 6 of 6 after). A proposal is checked by `parseWorkflow`; a file with problems comes back to the agent with every problem and nothing is shown; a good one becomes the agent's one draft (kept in `workflow-proposals.json`), shown beside its chat with what it changes in the saved workflow with that id (`workflowDiff`: steps matched by id, fields from and to, moved steps), the commands it would run, and which of them were approved before. Only the person saves, by button: to the project or for everything (new), or over the saved file / as a copy (existing). A save refuses when the saved file changed since the draft was made (the draft goes stale), writes through a temporary file, and **approves the commands of that exact file** (the person has just seen them), so landing is not asked twice. The window is the split of D34; entry is the describe box (the person's words are typed into the builder as their own turn once it is ready, `Mailbox.fromPerson`) and an Edit with the builder button on each workflow. Not done: the builder is not told when its draft was saved or discarded (it learns by reading), agy cannot be a builder, and a person who approves a write in its chat can make it write. |
| D39 | **Skills on work steps (built 2026-10-13, slice 11).** A skill id a step names has one of three states in a project: **ready** (a skill of the library, and its playbook has it on), **granted** (a skill of the library the playbook leaves out: the step lets agents read it, so naming it works) or **gone** (not a skill of the library; an instruction or prompt does not count). The library service takes a `grants` dependency, the skills named by the steps of an agent's open task's workflow (`Workflows.skillsOf`), and lists them in that agent's index as mode `step` ("use for the step of your workflow that names it") so `library_get` opens them; the grant ends with the task. `task_begin`'s brief says "read with library_get: ..." for the ones that exist and "there is no skill X in the library, so skip it" for a gone one. The builder's `workflow_list` ends with the skills it may name (ready first, those outside the playbook marked, 40 lines then ids only), `workflow_propose` refuses a gone skill with the step and the real ids, and its instructions say never to invent a skill and to say so when it leaves out one the person asked for (5 of 5 pilot runs did after the instruction). A gone skill in a saved file is a warning, not a problem: the list shows `1 warning` and a banner, the chips show each state, and the draft pane flags granted skills with a note. Not done: the playbook is not changed by the app (adding a granted skill to the playbook is a Library task), and a skill that exists but is empty or broken is not noticed. |
| D40 | **Every program, enforced by the app (built 2026-10-13, slice 12).** What the office enforces does not depend on the program an agent is. (1) **Model calls.** The audit and the intent check run on the agent's own program and account when it can answer headlessly (`claude -p`, `agy -p`), else on the first ready one; at balanced agy asks `gemini-3.8-flash-low`, at max `gemini-3.8-flash-high`, a step's own model only when agy has it. agy reports tokens, not dollars, so its calls show as `about 17k tokens`. agy ignores `--tools`, so the question carries a line telling it to use no tool and the call is asked again once if it still wanted a permission (before that line a third of calls failed that way; after it 16 of 16 audits were right and none failed, about 8,000 tokens a call; the intent check on agy, 2 reps of 10 clear and 10 gap requests, stayed quiet on 20 of 20 clear ones and named the hidden gap 12 of 20 times against 14 of 20 on claude's haiku). The Finish row for a missing model says `no model is ready` (Claude and agy both not ready), never `not available for this program`. (2) **A commit gate through git itself.** Every agent starts with git's own environment variables (`GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_n`, `GIT_CONFIG_VALUE_n`) naming the office's folder of hooks, so no file of the repository or of the person's git configuration is touched and the person's own terminal is untouched. Its `pre-commit` asks the office (`/hook/git-commit`) whether the agent's plan holds the commit (same rule as an edit: `commitBlock`; a commit of `.agent-world/` alone is never held) and refuses with the office's words; its `reference-transaction` asks before git moves the agent's own branch, which `git commit --no-verify` does not skip; each of the 20 hooks git has then runs the repository's own hook of that name (husky and a plain `.git/hooks` both keep working). An unreachable office lets the commit through, and agents working in the project folder itself (no branch of their own) are held at pre-commit only. Every program's agent now has `AW_MCP_URL` and `AW_AGENT_TOKEN` in its environment for this. (3) **agy's edit hold.** agy's plugin gained a `PreToolUse` hook for its three editing tools; the office answers `{decision:'deny', reason}` while the plan holds and nothing otherwise, so agy's own permissions decide as before (checked on real agy: the file was not written and the agent told the person why). The plugin is version 0.1.3 (0.1.2 answered `{}` before an edit that was not held, which agy reads as a denial: every agy session on the machine could not write a file until the script was changed to print **nothing**, which leaves agy's own permissions to decide); an older one shows `older than this app's` in Settings > Message box with an `Update the plugin…` button that shows the plan, replaces the entry and installs again. (4) **The builder follows the default program** when it can use the office's tools (agy once connected), else Claude. Table, by rule and program: plan hold on edits: Claude hook, agy hook (needs the plugin 0.1.2), others none; plan hold on commits: git for all; edits made by a shell command (`sed -i`): held at the commit, not at the edit; merge gate, checks, approvals: the app, for all; audit and intent check: any program that can answer headlessly; step approvals typed into the agent: the message box, for programs that can take mail. Not done: a program with neither hooks nor git (none today) is advised only; an agent that unsets the git variables or runs `git -c core.hooksPath=` escapes the gate and is still caught by the merge gate at Land; the builder on agy asks for a permission per tool call in agy's own prompt (untested with real agy yet). |
| D41 | **What the walkthrough found (built 2026-10-14, slice 13).** Fake programs, the built app and real programs through all the scenarios of `docs/workflows-test-matrix.md`. Fixed: (1) **a failed check could not be fixed once the agent had said the task was done**: real agents say `task_done` straight after `step_done`, so the check then failed against a closed task, `step_done` said there was no task open and the check never ran again; a failing check, or a step the person sends back, now opens a finished task again (a `reopen` event), judged on the run as it is when the check ends, not when it began; (2) an agent that names the step again (`step_done("build")`, as its brief showed) after a failure is heard like one that names nothing, and the refusal now says which step to report; (3) **the plan file counted as uncommitted work**, so Finish kept refusing Land for a real agent that commits only its own files: it is left out of the count and out of Commit all; (4) the built-in Standard read as "anything with no workflow of its own" and an agent sometimes chose it over the project's default: it now says it is the fallback and the opening text says to use the default unless another clearly fits (1 of 4 real runs still chose it before the change, none of the next 2 after); (5) the Workflows list could only be used with a mouse: it is a listbox with arrow keys, Home and End; (6) the builder asked permission to read the project's notes (`recall`): allowed now; (7) agy's plugin denied every edit when the office had nothing to say (see D40). Seen working with real programs: a real Claude builder from one sentence to a saved valid file in 49 seconds; a real Claude task through the plan, a check it could not see (failing twice), its fixes, the audit that flagged the accent change as outside the approved plan, and Land, in 1.5 minutes. Limits: a real agent's choices vary run to run; the person's own global rules for agy make it stop for approval in some runs (the real agy journey is therefore told the request is approved), and a Claude plugin on this machine writes `excalidraw.log` into the working folder, which counts as uncommitted. |
| D42 | **The workflow kit: what a run looks like (built 2026-10-16, slice 14).** Four pixel pieces, drawn in code, used the same way everywhere. The office's calls are a **row for each area** (workflow, todos, library, notes; D43), not a coloured stamp each, so a todo and a workflow call read apart, and the workflow says *run* where a todo says *task*; the calls that move a run (`task_begin`, `step_done`, `task_done`, `plan_submit`) leave the chat, and a failed call stays a card. A **track** is where one open run stands: its own steps as stations on a rail, the agent (drawn from the same palette as its character in the office) on the one it is at, amber where a check was retried or a plan sent back (with the count), a paper bubble when it waits on the person; above the chat and in the agent's tab. A **time bar** is where a run's time went: violet hatching for the person waited on, cyan for the agent, green for checks, red for a failed one, with marks for the review, a lifted plan hold and a follow-up round, and a flag at the end (landed, or anyway). A review and a landing are marks, not lengths, because the log has only when they ended; when a plan was sent back its waits are drawn together where it was decided. A **tile** is whether one gate was met (met, met after trouble, missed or overridden, not asked, waiting): five make a run, a grid is the Insights tab (7 or 30 days), with the numbers under each column and what stands out (the red row, the amber column). The agent's tab is the track and the week as a tile per run; a tile or the link opens the window on that run. The measures are one pure module (`shared/insights.ts`); "gates met" counts what the app can see, so a shell edit that skipped the plan hold is not a miss. A run's gates are judged on the latest round with anything logged. Not built: how the workflow was chosen, and a record of each time a gate said no. |
| D43 | **A quieter Runs tab and a fold by area (built 2026-10-16).** The first Runs view was too bright and said too little (every run a full-width bar, so the colours said where time went but nothing said how well a run went). The Runs tab is now two charts (how often each workflow was invoked, per workflow and per day; how well each stage was followed: first time, after trouble, not followed) over a ledger of runs grouped by what to do about them (needs you, still open, landed with trouble, landed clean, stopped) with a column each for wall time, the wait on the person, checks, review, commits and cost, totals in the column headings, and a 7 / 30 days switch. The chat's office calls are likewise a row for each area (workflow, todos, library, notes) so a todo and a workflow call read apart, and the workflow says *run* where a todo says *task*. Chosen from HTML design options by the person: ledger with outcome groups (A+C), stage bars (option 1), a row for each area (option 1). The pure parts are `stageCounts`, `invocations`, `groupRuns`, `ledgerRow`, `ledgerTotals` in `src/shared/insights.ts` and `areasOf`, `outcomeOf` in `officeCalls.ts`. |
| D44 | **Landing happens from the chat, and git holds it (built 2026-10-16).** Landing used to be the one step only a button in the app could do, so an agent asked in chat to "commit and merge" got past the merge gate and the run stayed "ready at Finish" for work that had landed. Now the agent merges when the person asks, and nothing the agent says or runs changes what the gate holds: the `reference-transaction` hook of D40 also asks the office before git moves the agent's **base branch** (merge, fast-forward, `update-ref`, from the project folder or its own worktree), and the office answers with the same rules as Land (`landingHold`): plan not approved, review not run or still running, findings not seen, steps and checks that hold. A review that has not run is started by the first held try. The person releases it from the agent's chat: a **band under the run track's marker** ("Land held") lists what holds it and the review's findings to tick as seen, with Land anyway and Not yet; ticking every finding releases it with no word, Land anyway allows that head once (`allowLanding`), Not yet puts the band away and leaves the marker ("Land held · not yet"), which brings it back. The agent's Workflow tab shows the same status. When git has moved the base branch, a `committed` call to the office logs the landing (`how: checked`, or `anyway` with what held it) however it happened, so a merge that got past the hold is still recorded. The Finish dialog stays as a shortcut. Limit: an agent that unsets git's own environment variables, or runs git with its own `core.hooksPath` (`git -c`), skips the hook, and the app then neither holds nor records that landing (the record is made by the same hook); the run stays "ready to land" until the person lands it through Finish. Fully closing this needs an operating-system sandbox, a separate piece of work. Not built: the plain chat line saying how it landed (the conversation is the program's own record), shown instead by the Workflow tab, the Runs ledger and the pill. |
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

### Does the agent decide? agy, real runs (2026-10-07)

The pointing line used to say "this task matches X ... read it before you start", an order. Test: real agy (Gemini 3.8 Flash low) through the real plugin and office hook, 48 skills, `pilot/agy.pilot.ts` (`PILOT_SET=q`, `PILOT_SET=decoys`). "Decoy" = a question that shares a word with a skill but needs none ("What does git rebase do, in two sentences?").

- **Bug found first.** agy's saved message carries the time and a settings note after the user's words (`</USER_REQUEST><ADDITIONAL_METADATA>...`). The hook only cut a trailing `</USER_REQUEST>`, so the matcher read that note and pointed at 3 skills on every message, even "capital of France". Fixed in `libraryHook.ts` (cut at the first `</USER_REQUEST>`), test first. Quiet prompts are now really quiet.
- **Order wording:** real tasks read 5/6, decoys read 3/5 (it obeyed). **Permissive wording** ("may fit... otherwise ignore"): decoys 0/5 but real tasks only 3/6. **Kept:** "covers this kind of work. If you are doing that work, not just answering a question about it: read it first." Real tasks 5/6, decoys 0/5, prompts about none 0/3 (not pointed at all).
- The one real task missed in every wording is the flaky-test one (the matcher's top 3 did not contain the right skill, same as before).
- **Claude, same wording** (`PILOT_VARIANTS=Q PILOT_DECOYS=1`, 48 skills): Sonnet read the right skill 4/6 (was 5/6 with the old wording; the database-schema task was answered without it), Opus 5/6; both read nothing on all 5 decoys and all 3 questions about none (0/8 each). Spend about $1.65 (Sonnet) and $3.67 (Opus).
- Small samples (6 + 8 runs per wording; model noise is visible: the permissive wording's 3/6 may be partly luck). Claude with the new wording: unit and e2e only, not re-piloted.

### agy: hooks (2026-10-07)
Found in the agy binary's own docs and checked with a throwaway plugin, in print and in the interactive terminal.
- A plugin's `hooks.json` (an object keyed by hook name) registers `PreInvocation`, `PostToolUse` and others; hooks are shell commands, run in both modes, and inherit the agent's environment (so the token the office puts there reaches them).
- `PreInvocation` can return `injectSteps` with an `ephemeralMessage`. It reached the model: a fact it could not guess (ZEPHYR-7) was answered 2/2 against 0/1 without; a bare instruction ("end with PINEAPPLE") was ignored because agy's own global rules shape the reply. It is not given the prompt, only the path of the saved conversation (a JSONL file).
- The injected message stays in the conversation (one step per injection). A first 4-turn sample suggested about 40% more tokens by turn 4; a 10-turn re-run (see "Models, long sessions, agy cost") found +1% and an unchanged cache, so it was noise. The hook still sends a line only when the message matches an item, once per message.
- `PostToolUse` gives the tool and its arguments (`view_file` with the absolute path): that is how a read of a skill file is counted. `PreToolUse` is not used: its answer decides what agy may do.
- Reading a file outside the workspace asks for approval; `--add-dir <library>` (already passed) removes the prompt.
- Built: `providers/agy/libraryHook.ts` (answers the hooks), `plugin.ts` (the plugin the Connect step installs: `aw-library`, two hooks and one script that posts to the office's `/hook/<event>` with the agent's token), and the Connect plan for agy now also installs the plugin. Without a token in the environment the script prints `{}`, so it is silent in agy sessions the office did not start.

### Research (2026-10-07): how to make agents follow rules
Full report: `docs/research/making-coding-agents-follow-instructions.md` (notes in `docs/research/making-coding-agents-follow-instructions-notes/`). Mostly small-sample, single-vendor and Claude-centric evidence; its own list of claims to verify comes first before anyone relies on a number.
- Rule files are advice, not enforcement (Anthropic's docs say so); only hooks, permissions and an engine that blocks a tool call bind the model. Keep rule files short (Anthropic: under about 200 lines).
- Skills and fetch-on-demand tools are skipped when the model has to decide to get them: another test saw a skill never invoked in 56% of runs, 53% pass by default, 79% with an explicit "use it", and 100% when an index of the content was always in context. A hook that forces the model to evaluate every skill each turn raised activation from about 50% to 100% on Sonnet 4.5 (one author's harness), at about 2 seconds a turn.
- Multi-turn use degrades adherence (about 39% average drop across 15 models in one study); restating requirements at the end of the context recovers part of it.
- Forced tool use is not available on current Claude models (400 error), so the dependable levers are: always-on short rules, content-carrying per-turn injection, the engine putting a step's items in its brief, and hook or gate enforcement.
- Both Gemini CLI and agy have hooks (Gemini CLI's `BeforeAgent` `additionalContext` is the per-turn analogue); agy's hook output format and rule precedence are undocumented in what was found.
- Bundled scripts run by absolute path on both programs; only the permission to run them gates it (tested in print mode for agy).

## Tasks and follow-ups (decided in D21, from the answers of 2026-10-08 and 2026-10-11)

A session is a conversation; a **task** is a piece of work with a purpose and an end, and it is the thing a workflow run records. A session holds many tasks, and a task can grow.

- **Finding the boundaries.** Three signals, in order of strength: (1) the agent says so through an office tool it already has (`task_begin(title)`, `task_done`), which is cheap and needs one line in its opening text; (2) a commit or an approved plan marks the end of a round; (3) the app notices a user message that does not fit the open task and asks once ("Start a new task, or add this to *Fix login redirect*?"). The person can always move, merge or split tasks afterwards. No model call is made just to find boundaries.
- **Follow-ups.** A request after a task finished (a change to its review, a missed case) re-opens it as a **round 2** of the same run, with its own steps drawn under the first. Only the steps that apply run again (usually implement, test, review), and the plan is redone only if the scope changed. This is the same idea as AI-DLC's *bolt*: a short cycle on a unit of work.
- **Added tasks.** Work added alongside the original is a new **unit** inside the run when it is part of the same goal (AI-DLC's *unit of work*), or a new run when it is not. A unit has its own commits; review and test run per unit or once at the end, as the workflow says.
- **Commits.** Every commit in a session's worktree belongs to the open task. A commit with no open task is attached to the nearest one and flagged, so nothing is untracked. Enforcement happens at the commit and at Finish, not at each edit, so an agent can still try things before it commits.
- **Decided (2026-10-11):** a commit with no task is flagged, not refused. A refusing hook would change the repo's git settings.

### Pilot: does a real agent record its tasks (2026-10-12, Sonnet, `pilot/workflow.pilot.ts`)

- With the opening text alone, a real Sonnet agent called `task_begin` and `task_done` on 3 of 6 real code tasks. It skipped both for a question and a typo, as told. With a reminder at each turn while no task was open, one run recorded 0 of 4 tasks and a second recorded 1 of 1. The samples are too few to say the reminder helps or hurts; nothing is concluded from them.
- Two real problems showed: (1) an agent that skips the call leaves its work unrecorded, and (2) an agent in one long session used `follow_up` for a different piece of work, so three features became three rounds of one run. The tool text now says `follow_up` is only for more work on the same task.
- Commits are read when a turn ends, after `task_done`. They are placed by the time they were made (the round whose window holds it); only a commit made outside every round is flagged. Before this was fixed every commit of a finished task was flagged.
- **Decided and built (2026-10-12, D24):** when an agent commits and has no run of its own, the app starts a run titled from the commit subject, marked as started by the app, with no model call. Commits within 10 minutes of each other join one such run. Only commits made after workflows were switched on count, so a branch's history is never imported. After a task the agent did announce, a stray commit is still attached to it and flagged.
- Cost of the pilots so far: about $3 of Claude usage.

### Pilot: the plan gate with a real agent (2026-10-12, Sonnet, `pilot/plan.pilot.ts`)

One task in a throwaway repo, real tools, real plan check, real edit-refusing hook, a script as the person. Sonnet announced the task, wrote a plan the checker accepted on the first try (goal, 2 given and 4 guessed assumptions, 3 out-of-scope lines, no questions), submitted it and stopped ("No edits made yet"); after the typed-in approval it built and committed. 2 turns, about $0.31. It never tried to edit early, so the refusal was not exercised by the model (the e2e covers it). One sample: whether agents fill the questions section when they should is not measured.

## Framework or our own engine (2026-10-08)

Not a framework for now. Our agents are CLI sessions in terminals, so a model-calling framework's agents, memory and tools go unused, and its workflows are code where ours are data. The engine is a list of steps, their needs, their gates and an append-only run log. The step runner sits behind one small interface so a library (XState for the state chart, Mastra for pausing and resuming) can replace it later, and a framework would earn its place for steps that call a cheap model over the API and for the chat builder. Mastra's suspend and resume stores a snapshot and continues after a restart, which our log gives us too. The Claude Agent SDK runs Claude Code as a subprocess, covers Claude only, and would hide the terminal you watch.

## AI-DLC research (2026-10-08, first pass)

AI-DLC (AI-Driven Development Life Cycle) is AWS's method, introduced in 2025 by Raja SP; its [DevOps blog post](https://aws.amazon.com/blogs/devops/ai-driven-development-life-cycle) is the primary source, and the rules are open source at [awslabs/aidlc-workflows](https://awslabs.github.io/aidlc-workflows/guide/00-introduction/). Harness also sells a product it calls "AI DLC"; that is a different thing.

| What the sources say | Use for us |
|---|---|
| The original method has **three phases**: Inception (intent to requirements, stories and units), Construction (architecture, domain models, code, tests), Operations (infrastructure and deployment, with oversight). | Our step names can follow these three groups. |
| Ceremonies: **Mob Elaboration** (the team validates the AI's questions and proposals) and **Mob Construction** (the team clarifies technical choices as it builds). Both are human gates. | Our plan-approval gate is a mob-elaboration moment; a review gate is a mob-construction one. |
| **Bolts** replace sprints: short cycles of hours or days. **Units of Work** replace epics. | Our "round" and "unit" in the task model. |
| "AI implements only after human validation and defers critical decisions to humans." Plans and design artifacts live **in the repository** so context lasts across sessions. | Matches D16 and the files-between-steps idea. |
| The **open-source rules (v2)** are larger than the paper: five phases (Initialization, Ideation, Inception, Construction, Operation) and 33 stages, approval after each stage, records under `aidlc/spaces/<space>/intents/<date>-<label>/`, an `aidlc-state.md` progress file, an audit trail of every decision, and adaptive **scope** (11 levels from enterprise to express) and **depth** (Minimal, Standard, Comprehensive) for work and for test strategy. Started with `/aidlc <intent>`; it runs in Claude Code, Kiro, Codex CLI, Cursor, opencode and Copilot. | A model for our own file layout, the audit log, and an "adaptive depth" setting that maps to the economy dial. |
| Maturity is unclear: some sources say Operations is barely specified, while the repo index lists version 2.0 (GA). | Do not copy the Operations phase wholesale. |

I found no independent critique of AI-DLC itself in this pass (Thoughtworks and InfoQ write about AI in development generally, and warn of "cognitive debt" as AI writes more code). Still to do: read the method-definition paper and the stage chapters of the repo, and look at other published process families (spec-driven development, for example) before we fix our terms.

## Intent check (proposed, 2026-10-09, from cocain's report `docs/research/ai-dlc.md`)

The gap: the agent can be wrong about what the user meant, and models are poor at noticing when a request is underspecified (Ambig-SWE; Ask or Assume). AI-DLC answers with questions first and approval after, and has no read-back of the agent's own understanding; none of Kiro, Spec Kit, BMAD, Cursor or Claude Code plan mode names one either, so this part would be new, not copied. Nothing found measures a plan-summary gate.

**Where it sits.** Inside the plan gate of D16, not as a fourth gate. The plan step writes a fixed block at the top of `plan.md`: goal in one line; assumptions each marked *given* or *guessed*; out of scope; open questions. The engine checks the block in code (0 tokens, D15): missing block, no gate; non-empty open questions, the gate shows them as choices with pros and cons. An empty list changes nothing for the person.

**Follows the dial (D17), still configurable (D16).**

| Dial | Block + questions (A, B) | Separate check on a small model (C) | Audit of the diff against the block at the merge gate (D) |
|---|---|---|---|
| economy | only when the task is not small (E) | off | off |
| balanced | on | off | on |
| max | on | on, request only, estimated 1-3k tokens | on |

**Small-task skip (E).** The block is skipped when the change can be described in one sentence (Anthropic's own rule for plan mode) or the person says so. Who decides "small" is open (question 12).

**Tasks (D18).** The confirmed block belongs to the run, not the round: a follow-up round reuses it and only a scope change (new unit, edited goal or out-of-scope line) reopens the changed lines. Unrelated work is a new run with a new block. An unattended run refuses to start without a confirmed block.

**Guessed or given.** The model marks it; code flags any assumption with no quoted user words as guessed. Token figures are cocain's estimates, not measurements. Before building, measure on 20 requests (10 clear, 10 with one hidden gap) how often the block lists the gap as guessed, how often it asks, and how often it wastes a question on a clear one.

## Proposed: the workflow file, the list tab and the builder (2026-10-12, not yet decided; mocks in the session scratchpad `s12.html`)

Slices 1 to 7 built a fixed pipeline: task, plan (gate), build, audit, land (gate). The builder agent of D19 needs that pipeline to be *data*, so the first step is a file format. `Standard` below is today's behaviour written as a file, so nothing changes for anyone who never edits it.

### The file

JSON (the app already keeps prefs and playbooks as JSON; no new parser). One file per workflow, global in the app's data folder (`HOME/workflows/<id>.json`) and per project in the repo (`<repo>/.agent-world/workflows/<id>.json`), a project's own winning over a global one with the same id (D2). Validated in code like the plan block: every problem is reported at once, nothing is half-loaded.

```json
{
  "version": 1,
  "id": "bug-fix",
  "name": "Bug fix",
  "when": "A defect with a known symptom: something that used to work, or should, and does not.",
  "steps": [
    { "id": "plan",   "kind": "plan",  "gate": "approve", "brief": "Name the symptom and the likely cause. Say what you would not touch." },
    { "id": "fix",    "kind": "work",  "name": "Fix, test first", "skills": ["tdd"], "brief": "Write a failing test that shows the bug, then make it pass." },
    { "id": "tests",  "kind": "check", "name": "Tests pass", "run": "npm test", "gate": "pass", "retries": 3 },
    { "id": "review", "kind": "audit" },
    { "id": "land",   "kind": "merge", "gate": "approve" }
  ]
}
```

Steps run in the order listed (D19: linear first; no `needs`, no branches). At most 12 steps, ids lowercase letters, digits and dashes.

| Kind | Who does it | What it needs | Built? |
|---|---|---|---|
| `plan` | the agent writes the read-back plan | the plan gate and, by dial, the intent check | yes (D25, D28) |
| `work` | the agent, with the step's `brief` and `skills` | `step_done` tool; briefs come back from `task_begin` | recording yes; briefs, skills and `step_done` new |
| `check` | the app runs `run` in the agent's worktree; exit code decides | commands, retries, output tail sent to the agent when it fails | new |
| `audit` | a model reads the branch against the plan | model from the dial, or `"model"` on the step | yes (D26) |
| `approve` | the person, in a panel like the plan gate | a generic hold with a note | new |
| `merge` | the person lands it from Finish | the merge gate | yes (D26) |

`gate`: `auto` (default), `approve` (stops for the person) or `pass` (a `check` must pass). Where a step does not say, the global Settings switches (plan gate, merge gate) apply, so D16 stays true: gates are settings, a workflow overrides them. `model` on a step overrides the dial for that step (D17).

### Safety: commands in a repo file

A project workflow lives in the repo, so a `check` step's `run` is a command from repository content that the app would run on the person's machine. It must not run unseen: the first time a given version of a file with `check` steps would run, the app shows the exact commands and asks; approval is remembered for that file's content hash and any edit asks again. The builder's proposals carry the same prompt. Commands run in the agent's worktree only, with a time limit, and their output is truncated before it reaches the agent.

### How a task gets its workflow

The project's default workflow applies unless the agent picks another: the opening text lists at most five (`id: when`, about 80 tokens, once), and `task_begin` takes an optional `workflow` id. `task_begin` answers with the steps' briefs (the "step briefs" already in the cost table). The run log gains `step` events (started, passed, failed, skipped, stopped, waiting) with the workflow id and file hash, which is what the CI-style strip draws.

### The list tab and the builder

The Workflows window gets two tabs, Runs and Workflows. The list shows each workflow's steps as a strip, its scope, what it is the default for, and how often it ran. The builder is a ready-made agent in the roster (a Claude agent in the project, read-only, with three extra tools: `workflow_list`, `workflow_get`, `workflow_propose`). `workflow_propose` does not write: it puts a proposal card in the chat (steps, the commands it would run, a diff against the saved version) and the person saves it to the project or globally, or keeps talking. Nothing the builder says changes a file by itself.

### Questions to decide (13 to 18): decided as D29 to D34 on 2026-10-12

13. JSON as the file format (recommended), or YAML?
14. Step kinds in the first version: all six above, or the ones that already exist (`plan`, `audit`, `merge`) plus `work`, with `check` and `approve` later?
15. A task's workflow: project default, plus the agent may pick (recommended), or the project default only?
16. The builder saves only through a proposal the person approves in the chat (recommended).
17. A repo's `check` commands need the person's approval per file version (recommended).
18. List tab layout (A cards, B table, C list and detail) and builder layout (A in the chat, B in the window, C entry box); mocks in `s12.html`. Recommended: C for the list and A for the builder, with the describe box (D) as the entry point.

### Slices after the decision

8. File format, validation, storage, the built-in `Standard`, and the read-only list tab (nothing in the engine changes yet).
9. The engine reads the workflow: step events, briefs and `step_done`, `check` and `approve` steps, the command approval, the run strip.
10. The builder agent, its three tools and the proposal card.

## Open questions

0. Library: is serving on demand through the MCP server, with only a tiny core pushed, the right default? Where should workspace items live by default (in the repo, or private in the app's data)? Should existing skills and instruction files be adopted automatically as read-only sources?


1. ~~Engine in the app~~ Decided, D15.
2. ~~Which gates stop for a person~~ Decided, D16.
3. ~~One dial~~ Decided, D17.
4. ~~One run per piece of work, or a standing pipeline~~ Decided in spirit, D18: a run is a task found inside a session. A standing pipeline that triggers on events (like CI) is not wanted yet.
5. ~~What counts as changing code~~ A commit, D18. How follow-ups and added tasks attach is proposed below and needs an answer.
6. ~~First version~~ Linear, about five steps, D19.
7. ~~AI-DLC terms~~ Researched, D20; see below. Still to decide which terms we use in the app.
8. ~~How does the app find where one task ends and the next begins?~~ Decided, D21.
9. ~~A follow-up after a task was finished~~ Round 2 of the same run, D21.
10. ~~How do we enforce "a commit follows a workflow"~~ Flagged, not blocked, D21.
11. ~~Intent check: build A and B first~~ Yes, D22; C only at max.
12. ~~Who decides a task is small enough to skip the intent block~~ The agent, using an instruction we ship (D22). The wording of that instruction still has to be written and measured.

## Change log

- 2026-10-14: D41, slice 13: the scenario matrix and the walkthrough with fake and real programs, and the seven things it found and fixed.
- 2026-10-13: D40, slice 12 built: audit and intent check on any program, a commit gate through git for every program, agy's edit hold, and the builder on the default program.
- 2026-10-13: D39, slice 11 built: skills on work steps checked against the library (ready, granted, gone), the step grant, the builder's skill list, the list warning and the draft note.
- 2026-10-13: D38, slice 10 built: the builder agent, its three tools, the draft pane with the diff against the saved workflow, saving that approves the commands, the describe box and Edit with the builder.
- 2026-10-13: D37, slice 9b built: check steps (runner, approval of repo commands per file version, the retry loop with the agent, Finish rows, failed and approval panels). Real-Sonnet pilot (`pilot/checks.pilot.ts`, hidden check on accents, about $1.8 across its runs): 4 of 4 multi-step tasks announced, were told the check failed, fixed it and reported again; an earlier run showed an agent starting a second task when told to fix, so the message now says it is the same task. Unannounced tiny tasks again left no run. n is small.

- 2026-10-13: D36, slice 9a built: the engine follows the workflow (selection, briefs, `step_done`, approve steps, gates that follow the file, the run strip, runs per workflow in the list). Real-Sonnet pilot (`pilot/steps.pilot.ts`, 4 multi-step tasks, about $0.6 of about $2 across its runs): it found two bugs before they shipped (the brief told the agent to wait for a plan the workflow did not ask for; `step_done` was missing from the tools agents may use without asking). After the fixes 3 of 4 tasks announced themselves and all 3 followed the workflow (brief, `step_done`, waited for the approval, `task_done` after it); the 4th never announced and left no run, as in the earlier pilots. n is small.

- 2026-10-12: D35, slice 8 built: workflow file format and validation, the store, the built-in Standard, the per-project default, and the Workflows tab (list and detail). Nothing in the engine reads them yet.

- 2026-10-12: decided the workflow file and its layouts (D29 to D34): JSON, all six step kinds, project default plus the agent's pick, proposals only, per-hash command approval, list-and-detail tab, builder as a split in the window.

- 2026-10-12: proposed the workflow file, the list tab and the builder (questions 13 to 18), with mocks; nothing built.

- 2026-10-12: D28, slice 7 built: the intent check at max (see D28 for the pilot). The cost table now prices both separate calls from measurement (audit and intent check about 4,000 tokens each, about $0.0004 and $0.0002 on haiku); both are dominated by the program's own ~3,500-token starting text.

- 2026-10-12: D27, slice 6 built: the dial. The plan instruction follows it (economy may skip a one-sentence change, and then nothing is held), the cost table splits agent context from separate calls with the audit's measured size and price, and Settings says what the chosen level does.

- 2026-10-12: D26, slice 5 built: the merge gate and audit (Finish shows an "Against the plan" block and extra checklist rows; the server refuses until the plan is approved and findings are seen; Land anyway is logged; the Workflow tab keeps the audit and the landing). Real-model pilot (`pilot/audit.pilot.ts`, haiku, 12 calls, $0.0045): each of the three finding kinds was found 3/3 on crafted diffs and the clean diff drew nothing 3/3. The cost table's 3,000-token audit figure is now known to be wrong in kind: the audit costs the agent no context (it is a separate call), and about 4,000 tokens, about $0.0004, per audit on haiku; the table is reworked with the dial slice.

- 2026-10-12: D25 built: the plan gate end to end (plan parser, `plan_submit`, edit hold, chat panel, answers typed to the agent, Settings switch, window and tab states); pilot with a real agent added.
- 2026-10-12: slice 3 built: the Workflows window (this week's runs, rounds, commits, cost from the ledger and time, runs by agent, how runs began, what is open) and each agent's Workflow tab (round by round with commits). Not built because they need the engine: the dial breakdown, gate tags, plan/implement/test/review steps and the per-step strip.
- 2026-10-12: D24 built: runs started by the app from commits, so no work goes unrecorded; `since` records when workflows were switched on.
- 2026-10-12: slice 2 built: run log and recorder (`task_begin`, `task_done`, commits placed by time, round 2, stop), the confirm when turning off with runs open, and the winding-down state; pilot findings added.
- 2026-10-12: D23, the workflows switch; slice 1 built (switch in Setup and Settings, cost per dial, top-bar button and an empty Workflows window).
- 2026-10-11: answers recorded: task boundaries, round 2 for follow-ups, flagged commits (D21); intent check first, small-task skip by the agent through a shipped instruction (D22).
- 2026-10-09: intent check proposed inside the plan gate (read-back block, blocking open questions, dial positions, small-task skip), from cocain's AI-DLC and intent-gap report.
- 2026-10-08: answers to the open questions recorded (D15-D20); task and follow-up model proposed; framework-or-own-engine and first AI-DLC research added.
- 2026-10-08: the rule reminder is sent on a message that points at something (medium and hard rules) or, for hard rules only, on every message; a medium rule no longer costs tokens on a message that matches nothing. Checked on a real Claude agent: the catalog arrives on prompt 10 and on the first prompt after `/compact`.
- 2026-10-07: the pointing line leaves the choice to the agent (agy decoy test); fixed agy's hook reading the time/settings note as part of the user's message.
- 2026-10-07: the library UI is built from the picked mocks; added the model comparison (Haiku, Sonnet, Opus), the long-session catalog check and agy's cost over ten turns.
- 2026-10-07: first version, from the brainstorm. Decisions D1–D9 recorded; the rest is proposed.
- 2026-10-07: added the at-scale results and the agy hooks findings; the agy adapter is built (pilot/agy.pilot.ts measures it).
- 2026-10-07: added D13 (usage tracking) and D14 (catalog and matched hints), and the at-scale pilot (`pilot/scale.pilot.ts`).
- 2026-10-07: added D12, the pilot's delivery per program and its test plan.
- 2026-10-07: added D10–D11 (single store, workspace instructions on demand) and the proposed library design.
