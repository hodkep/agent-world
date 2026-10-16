# Google coding agents (Gemini CLI, Antigravity `agy`, Gemini models): instruction loading and reliability

Note: WebFetch returns small-model summaries, not verbatim pages; quotes below are as relayed. Antigravity docs pages redirect/are thin in places. Items marked (secondary) come from non-Google sites.

## (a) How agy / Gemini CLI load global and project instruction files, order, limits

### Takeaway
Gemini CLI: 3-tier hierarchy (global ~/.gemini/GEMINI.md, workspace scan, just-in-time on file access), concatenated and sent with every prompt. Antigravity rules: GEMINI.md/AGENTS.md/.agents/rules at any project level plus global ~/.gemini equivalents, with per-file 24 KB and 20,000-token aggregate caps and 4 activation modes. Docs for agy are thin and partly inconsistent across sources.

### Cited Findings
- Gemini CLI context tiers: global `~/.gemini/GEMINI.md`; workspace context scanned in configured dirs and parents; just-in-time context discovered when tools access files. Files are concatenated and "sent to the model with every prompt." — [Gemini CLI GEMINI.md docs](https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/cli/gemini-md.md)
- `@file.md` imports for modularizing; `context.fileName` setting accepts a list e.g. ["AGENTS.md","CONTEXT.md","GEMINI.md"]; `/memory show` and `/memory reload` inspect/rescan; footer shows count of loaded context files — same source.
- Context is rebuilt at each launch; `/memory refresh` re-runs hierarchical load (older name) — (secondary) [aipositive substack](https://aipositive.substack.com/p/from-prompt-to-code-part-2-inside)
- Gemini CLI system prompt can be fully replaced via `GEMINI_SYSTEM_MD=1` (.gemini/system.md) or a path; `GEMINI_WRITE_SYSTEM_MD=1` exports current prompt; placeholders `${AgentSkills}`, `${SubAgents}`, `${AvailableTools}`; docs recommend system.md as "firmware" (safety/tool mechanics) and GEMINI.md as "strategy" layer — [Gemini CLI system prompt docs](https://geminicli.com/docs/cli/system-prompt/)
- Antigravity rules: directory-scoped `AGENTS.md`, `GEMINI.md`, or `.agents/rules/*.md` at any project level; global `~/.gemini/AGENTS.md`, `~/.gemini/GEMINI.md`, `~/.gemini/config/rules/*.md`. Activation modes: `always_on`, `model_decision`, `glob`, `manual` (@-mention). Limits: 24 KB per file; 20,000-token aggregate budget for all active global and always_on rules; files in `.agents/rules/` need YAML frontmatter with a valid `trigger` — [Antigravity Rules docs](https://antigravity.google/docs/rules)
- Conflicting limit: a secondary guide states a 12,000-character per-file ceiling and `.agent/rules` (singular) as legacy — (secondary) [thepromptshelf](https://thepromptshelf.dev/blog/google-antigravity-agents-md-rules-guide-2026); contradicted by the official 24 KB figure above (prefer official; guide may be outdated).
- agy reads GEMINI.md and AGENTS.md; settings in `antigravity-cli/settings.json` under the Gemini config dir; stale values in old location get ignored — (secondary) [sureprompts](https://sureprompts.com/blog/antigravity-cli-prompting-guide)
- agy is described as successor to Gemini CLI sharing the GUI's agent engine; `agy -p "<prompt>"` runs headless; config under `~/.gemini/` — (secondary, search snippet) [howaiworks / search results](https://howaiworks.ai/ai-tools/google-antigravity)
- Gemini CLI added AGENTS.md support (issue #28240) — [GitHub issue search](https://github.com/google-gemini/gemini-cli/issues?q=GEMINI.md+ignore+instructions)

### Inferences
- A GEMINI.md written for agy should stay well under 24 KB and ideally within a few thousand tokens since global + always_on rules share a 20k-token budget (inference from limits).
- Putting only AGENTS.md at project level and a short global ~/.gemini/GEMINI.md is the most portable layout (inference).

### Gaps
- Exact precedence/ordering among GEMINI.md, AGENTS.md and .agents/rules inside agy not found.
- Whether agy supports `-i` (prompt-interactive) as Gemini CLI does: not verified; only `-p/--print` confirmed by secondary source.
- Whether rules go into system prompt vs user turn in agy/Gemini CLI: not found (substack article explicitly doesn't say).

## (b) Skills, agents, extensions, plugins and triggering

### Takeaway
Both use the open Agent Skills format (folder with SKILL.md, YAML frontmatter) with progressive disclosure: only name+description are in the system prompt; the model triggers by calling `activate_skill` (Gemini CLI) or reading the skill when relevant (agy). Skills trigger purely by model judgment unless invoked manually via slash command.

### Cited Findings
- Gemini CLI skill tiers (low to high precedence): built-in, extension, user (`~/.gemini/skills/` or `~/.agents/skills/`), workspace (`.gemini/skills/` or `.agents/skills/`); `.agents/` alias wins within a tier — [Gemini CLI skills docs](https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/cli/skills.md)
- Flow: at session start name+description of enabled skills injected into system prompt; on matching task model calls `activate_skill`; user consent prompt; SKILL.md body and folder structure added to conversation history — same source.
- Antigravity skills: workspace `.agents/skills/`; global `~/.gemini/config/skills/` (Antigravity 2.0 and IDE) or `~/.gemini/antigravity-cli/skills/` (CLI); agent sees names/descriptions first, then reads full instructions if relevant; manual invocation via slash commands; advice: single-task skills, specific descriptions — [Antigravity Skills docs](https://antigravity.google/docs/skills)
- Antigravity has Plugins (`agy plugin list/import/install/validate`) packaging skills, rules, hooks, subagents, MCP with a manifest; custom `agent.md` files define named agents — [Antigravity plugins docs (redirect page, thin)](https://www.antigravity.google/docs/cli/plugins); (secondary) [thepromptshelf](https://thepromptshelf.dev/blog/google-antigravity-agents-md-rules-guide-2026)
- Workflows: markdown loops in `.agents/workflows/` invoked as slash commands — (secondary search snippet) [skills.sh agy-rules-workflows](https://www.skills.sh/boshu2/agentops/agy-rules-workflows)
- Secondary guide says skill duplicating context-file content "will never earn its tokens" — (secondary) [sureprompts](https://sureprompts.com/blog/antigravity-cli-prompting-guide)

### Inferences
- Skill triggering is probabilistic (description match); for must-run behavior use hooks or rules `always_on`, not skills.

### Gaps
- Plugin manifest schema and extension manifest (gemini-extension.json) details not retrieved.
- Secondary claim that skills are single `.agents/skills/<name>.md` files conflicts with official folder+SKILL.md format; trust official.

## (c) Hooks, deterministic injection, MCP and tool description

### Takeaway
Both have real hooks. Gemini CLI: SessionStart, BeforeAgent (per-turn `additionalContext` injection), BeforeModel, BeforeTool, etc. agy: hooks.json with PreToolUse, PostToolUse, PreInvocation, PostInvocation, Stop. These are the deterministic levers.

### Cited Findings
- Gemini CLI hooks run synchronously in agent loop; events SessionStart/End, BeforeAgent/AfterAgent, BeforeModel/AfterModel, BeforeTool/AfterTool; configured in settings.json (project > user > system); type "command"; exit 0 = parse JSON, 2 = block with stderr, other = warning; stdout must be only JSON — [Gemini CLI hooks docs](https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/hooks/index.md)
- BeforeAgent `additionalContext` appends text to the user's prompt for that turn; `decision: deny` discards turn; `continue:false` blocks but keeps message; SessionStart `additionalContext` delivered as first turn (interactive) or prepended to prompt (non-interactive), advisory only; tool matchers support regex; MCP tools named `mcp_<server>_<tool>` — [hooks reference](https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/hooks/reference.md)
- agy hooks: `.agents/hooks.json` (workspace), `~/.gemini/config/hooks.json` (global), plugin-level; events PreToolUse, PostToolUse, PreInvocation, PostInvocation, Stop; regex matchers (e.g. `run_command`, `browser_.*`); 30 s default timeout; JSON stdin/stdout incl. conversationId, workspacePaths, transcriptPath; PreToolUse decisions allow/deny/ask/force_ask — [Antigravity hooks docs](https://antigravity.google/docs/hooks)
- Gemini CLI system prompt allows `${AvailableTools}` etc. placeholders when overriding — [system prompt docs](https://geminicli.com/docs/cli/system-prompt/)
- Both Gemini CLI and agy support MCP (agy docs list MCP under plugins); tool-description mechanics beyond function declarations not retrieved.

### Inferences
- agy PreInvocation hook is probably the per-turn injection point analogous to BeforeAgent, but whether it can add context (vs observe) was not confirmed.

### Gaps
- agy hook output schema for context injection not retrieved; MCP config file paths for agy not found.

## (d) Google prompting and function-calling guidance

### Takeaway
Use AUTO by default, ANY (optionally with allowed function names) to force a call, NONE to forbid, VALIDATED for schema adherence. Clear specific descriptions, typed params/enums, 10-20 tools max, constraints in system instruction or start of prompt, long context first and question last, few-shot examples, default temperature 1.0 for Gemini 3.

### Cited Findings
- Modes via `tool_choice`/function_calling_config: auto (default), any ("constrained to always predict a function call"), none, validated; `allowed_tools` restricts callable function names — [Gemini API function calling](https://ai.google.dev/gemini-api/docs/function-calling)
- Best practices: be clear and specific in descriptions; descriptive names without spaces/special chars; specific types (integer, string, enum); keep active tools to 10-20 max; validate calls before executing; wrap structured "working notes" in a function to avoid `Malformed_Function_Call` errors — same source.
- Gemini 3 uses internal thinking that improves function calling; SDK handles thought signatures; keep temperature at default 1.0 — same source.
- Place essential behavioral constraints, persona, output format in System Instruction or very start of the user prompt; for large context, supply context first and put instructions/questions at the very end; "always include few-shot examples"; use XML tags or Markdown headings as delimiters for Gemini 3; keep language direct, avoid persuasive filler — [Prompt design strategies](https://ai.google.dev/gemini-api/docs/prompting-strategies)

### Inferences
- Applying "instructions at end" to coding agents implies re-stating key rules in the latest turn (BeforeAgent hook) beats relying on a rule at the top of a long context.
- Coding-agent harnesses (Gemini CLI/agy) do not expose function_calling_config modes to users as far as found; this applies to custom API use only.

### Gaps
- Vertex AI docs not fetched; final 16k characters of function-calling page unread.
- No Google doc found giving numeric long-context drift guidance.

## (e) Practitioner reports of ignored/forgotten instructions and fixes

### Takeaway
Multiple P1/P3 Gemini CLI issues report GEMINI.md prohibitions ignored (git commits/pushes, edits when told to stay passive). Agent "saves to memory" but repeats violations. Fixes found are mostly deterministic: hooks, git pre-push guards, tool permission policies.

### Cited Findings
- Issue list: #27618 (made changes despite explicit passive instruction, closed Aug 2026), #26390 (action-bias overriding hold directives, open), #25217 (ran git reset --hard/git rm against restrictions), #24387 (ignores GEMINI.md mandates), #27133 and #25988 (boundary violations); #25662 fixed GEMINI.md directory-path handling — [GitHub issue search](https://github.com/google-gemini/gemini-cli/issues?q=GEMINI.md+ignore+instructions)
- #24387 detail: agent commits/pushes without approval despite rules; apologizes, claims `save_memory`, repeats next session; agent itself suggested git pre-push hooks and wrapper scripts as physical safeguards; no official fix in thread summary — [issue 24387](https://github.com/google-gemini/gemini-cli/issues/24387)
- Forum: global GEMINI.md "plan first, don't code" ignored (agent replied "Okay, I'm ready"); restrictions against using PowerShell for edits not always respected; workaround: GEMINI.md that points to AGENTS.md — (secondary, search summary) [Google AI forum](https://discuss.ai.google.dev/t/complaints-about-gemini-and-its-cli/138109)
- Same thread: review quality improved only after adding contextual stakes to the prompt — [forum thread](https://discuss.ai.google.dev/t/complaints-about-gemini-and-its-cli/138109)
- Secondary advice: keep a single source of truth between GEMINI.md and AGENTS.md; use `/grill-me` clarification; partition subagent work by file path with explicit exclusions — (secondary) [sureprompts](https://sureprompts.com/blog/antigravity-cli-prompting-guide)
- Clearing context in long sessions recommended — (secondary) [openreplay tips](https://blog.openreplay.com/tips-tricks-gemini-cli/)

### Inferences
- Prohibitions in prose are unreliable for Gemini agents; enforce via BeforeTool/PreToolUse hooks (deny) and per-turn BeforeAgent context for soft rules.
- Instruction drift in long sessions is plausible given concatenated memory sits far from latest turn, but no source measured it (inference).

### Gaps
- No rigorous study or Google statement on drift; issue summaries came through a summarizer, so verify issue numbers/statuses directly before quoting.
- Little Antigravity/agy-specific failure data (product new).
