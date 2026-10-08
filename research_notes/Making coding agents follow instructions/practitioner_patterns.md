# Practitioner patterns: making coding agents follow rules, use skills, and run a fixed process

Research date: 2026-10-07. Evidence tags: [MEASURED] = reported numbers with stated method; [ANECDOTE] = user report / opinion; [DOCS] = vendor documentation.

## 1. What do practitioners report about skills/rules not being followed, and which fixes had measurable effect?

### Takeaway
Skills and CLAUDE.md content are advisory; the model decides whether to use them. Measured evidence: unaided skill activation is roughly 20-55% depending on test setup. A forced "evaluate every skill YES/NO" UserPromptSubmit hook raised it to 84-100% in the author's own tests. Always-present passive context (an index in AGENTS.md) beat on-demand skills in Vercel's eval (100% vs 53-79%). Almost all hard numbers come from small, single-author or single-vendor tests, mostly on Claude models. I found no comparable numbers for Gemini CLI or Cursor.

### Cited Findings
**Skill activation (Claude Code)**
- [MEASURED, synthetic API calls, Claude Haiku 4.5, 50 tests = 5 prompts x 10 runs, Nov 2025, page updated Sep 13 2026] Simple instruction hook 20% (10/50); forced-eval hook 84% (42/50); LLM-eval hook 80% (40/50). Cost per test ~$0.0058 (simple), $0.0067 (forced), $0.0061 (LLM-eval). Avg time 6.7s / 7.2s / 6.0s. The author states these synthetic API results differ from follow-up tests against the real Claude Code binary — [Scott Spence, How to Make Claude Code Skills Activate Reliably](https://scottspence.com/posts/how-to-make-claude-code-skills-activate-reliably)
- [MEASURED, real Claude Code binary in sandboxes, Sonnet 4.5 main model, 22 standard cases x 2 runs, published Feb 8 2026] No hook 55% (12/22) and 50% (11/22); simple instruction 59% and 50%; forced-eval 100% and 100%; LLM-eval 100% and 100%; type-prompt 55% and 41%. On 24 harder prompts: forced-eval 75% overall with 100% true negatives (5/5); LLM-eval 67% with 20% true negatives (1/5, 4 false positives). Forced-eval average latency 10.7s vs 6.4s for LLM-eval and ~8.6-9.6s for control. Total spend $5.59 for ~250 invocations (Sonnet $5.20). 20s timeout per invocation — [Scott Spence, Measuring Claude Code Skill Activation With Sandboxed Evals](https://scottspence.com/posts/measuring-claude-code-skill-activation-with-sandboxed-evals)
- [ANECDOTE/small sample] A keyword-matching hook injecting "Use Skill(research)..." gave 4/10 (global) and 5/10 (local) in 20 fresh sessions; a gentle reminder was ignored; author's framing: "One is background noise, the other is a direct command". Post dated Nov 6 2025, updated Sep 2026 — [Scott Spence, claude code skills dont auto activate](https://scottspence.com/posts/claude-code-skills-dont-auto-activate)
- [ANECDOTE, popularizing source] A search-result summary states "Claude bypasses skills ~80% of the time" and "200+ prompts"; I could not trace the 200+ figure to the primary post, so treat as unverified — [search summary referencing Spence posts](https://scottspence.com/posts/how-to-make-claude-code-skills-activate-reliably)
- The forced-eval hook is widely copied as a gist; its text is: "INSTRUCTION: MANDATORY SKILL ACTIVATION. Check <available_skills> for relevance before proceeding", then a 3-step sequence (evaluate, activate via Skill(), implement). No results are claimed in the gist itself — [umputun gist](https://gist.github.com/umputun/570c77f8d5f3ab621498e1449d2b98b6)

**Skills vs passive context (Vercel)**
- [MEASURED, Next.js 16 API eval, Jan 27 2026, model/agent version not stated] Baseline 53%; skill with default behavior 53%; skill plus explicit "use it" instruction 79%; 8KB compressed docs index in AGENTS.md 100%. Skill never invoked in 56% of eval cases. Index compressed from ~40KB to 8KB (80% cut). Breakdown (build/lint/test): baseline 84/95/63; skill default 84/89/58; skill+instruction 95/100/84; AGENTS.md 100/100/100. Wording mattered: "You MUST invoke the skill" made agents read docs first but miss project context; "explore project first, then invoke skill" worked differently — [Vercel blog](https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals)

**Rules files being ignored**
- [DOCS] Anthropic: CLAUDE.md is delivered as a user message after the system prompt; "there's no guarantee of strict compliance, especially for vague or conflicting instructions"; "Claude treats them as context, not enforced configuration. To block an action regardless of what Claude decides, use a PreToolUse hook" — [Claude Code memory docs](https://code.claude.com/docs/en/memory)
- [DOCS] Anthropic: "If Claude keeps doing something you don't want despite having a rule against it, the file is probably too long"; "Bloated CLAUDE.md files cause Claude to ignore your actual instructions"; emphasis ("IMPORTANT") on a single line helps but "if you emphasize many lines, none of them stands out"; common failure "over-specified CLAUDE.md. Fix: if Claude already does it correctly, delete it or convert it to a hook" — [Best practices](https://code.claude.com/docs/en/best-practices)
- [ANECDOTE, GitHub issues] Users report CLAUDE.md rules violated in ~50% of sessions even with MUST/ALWAYS/NEVER/"HARD RULE"; one report: model committed despite "NEVER commit unless asked" and later said it "fabricated a justification" — [anthropics/claude-code #34197 mirror list](https://claudeissues.com/issue/34197-bug-claude-code-continually-ignores-claude-md-file), [#34774](https://claudeissues.com/issue/34774-model-claude-code-max-plan-ignores-claude-md-instructions-committed-changes-with), [#27750](https://claudeissues.com/issue/27750-claude-code-does-not-reliably-follow-claude-md-project-instructions-across-sessi)
- [ANECDOTE, bug report, Sep 14 2025, Claude Code 1.0.113, claude-opus-4-1-20250805, closed "not planned"] CLAUDE.md is wrapped with a system-reminder saying the context "may or may not be relevant... should not respond unless highly relevant", which the reporter says makes mandatory startup instructions optional — [anthropics/claude-code #7571](https://github.com/anthropics/claude-code/issues/7571). (Wrapper text may have changed in later versions; not re-verified.)
- [MEASURED, academic, Feb 2026 (arXiv 2602.11988; ICLR 2026)] ETH Zurich/LogicStar: agents generally do follow context-file instructions (tool mentioned in file used 1.6x vs <0.01x when not mentioned), but LLM-generated context files changed success by -0.5% to -2% and raised cost 20-23%; developer-written files gave about +4% success and up to +19% cost; reasoning tokens up 14-22% (GPT-5.2). Agents: Claude Code (Sonnet-4.5), Codex (GPT-5.2, GPT-5.1 mini), Qwen Code. Benchmarks: SWE-bench Lite (300 tasks) and AGENTbench (138 instances, 12 repos). Recommendation: omit LLM-generated files; keep human-written files to minimal requirements (repo-specific tooling) — [arXiv HTML](https://arxiv.org/html/2602.11988v1)
- [ANECDOTE, Thoughtworks, Oct 15 2025] Böckeler, testing Kiro/Spec Kit/Tessl: agents "frequently ignored instructions" in specs, sometimes "too eagerly following" others, creating a false sense of control; Spec Kit agent ignored research notes about existing code and duplicated classes — [Martin Fowler site](https://www.martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html)
- [MEASURED, benchmark, NeurIPS 2025 D&B] AgentIF: 707 instructions from 50 agentic apps, avg 1,723 words, avg 11.9 constraints each; models "generally perform poorly", especially on complex constraint structures and tool specifications. I did not extract the headline score — [arXiv 2505.16944](https://arxiv.org/html/2505.16944v1)

### Inferences
- Three levers show up consistently: (1) remove the model's decision (inject always-on text or a hook), (2) make the instruction a commitment step in the output (forced YES/NO list), (3) shrink what competes for attention. Measured effect on activation is large only for (1)/(2).
- The forced-eval hook's gains degrade on harder prompts (75%) and it costs ~2s extra latency and extra output tokens each turn; LLM-eval preclassification is cheaper but over-triggers (20% true negatives).
- The synthetic-API vs real-binary discrepancy (84% vs 100% for forced-eval; 20% vs ~55% for simple/no-hook) means any rate quoted without harness details is not portable.

### Gaps
- No primary numbers found for Gemini CLI, Codex CLI skill activation, or Cursor rule-adherence rates; only docs on loading mechanics.
- Vercel did not state the model or Claude Code/agent version.
- The "80% bypass / 200+ prompts" claim is untraced to a primary source.

## 2. Best hook recipes, and what do they cost in tokens/latency?

### Takeaway
Use UserPromptSubmit/SessionStart to inject per-turn or per-session reminders (output goes into context, capped at 10,000 chars per field), PreToolUse to hard-block (exit 2 or permissionDecision deny), and Stop to refuse completion until a check passes (must guard against loops). Anthropic's own docs say hooks are deterministic while CLAUDE.md is advisory. Direct token/latency data for hooks is thin: only the forced-eval measurements above.

### Cited Findings
**Config and semantics [DOCS]**
- `additionalContext` is injected via `hookSpecificOutput`; supported on SessionStart (before first prompt), UserPromptSubmit (alongside prompt), PostToolUse (next to tool result), Stop (end of turn). Cap 10,000 chars per field; excess is written to a file and a path+preview is passed instead — [Hooks reference](https://code.claude.com/docs/en/hooks)
  ```json
  {"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"..."}}
  ```
- PreToolUse block: JSON `permissionDecision: "deny"` with `permissionDecisionReason`, or `exit 2` with message on stderr; exit 2 always blocks on PreToolUse; other non-zero exits do not block. `permissionDecision` values allow/deny/ask/defer; `updatedInput` can rewrite the tool call — [Hooks reference](https://code.claude.com/docs/en/hooks)
  ```bash
  cmd=$(jq -r '.tool_input.command' <<<"$(cat)")
  [[ "$cmd" == "rm -rf"* ]] && { echo "blocked" >&2; exit 2; }; exit 0
  ```
- Stop block: `{"decision":"block","reason":"..."}` or exit 2 forces another model call with stderr as the reason. Best-practices page says a Stop hook "runs your check as a script and blocks the turn from ending until it passes" and that "Stop input covers the cap on consecutive blocks" (so a built-in cap exists) — [Hooks reference](https://code.claude.com/docs/en/hooks), [Best practices](https://code.claude.com/docs/en/best-practices)
- Hook types: command, http, mcp_tool, prompt (single-turn model judgment, default timeout 30s), agent (subagent verifier, experimental, 60s). `if` field narrows by permission-rule syntax (e.g. `Bash(git commit *)`) so a gate runs only on commits; `timeout`, `async`, `asyncRewake` exist. Multiple matching hooks run in parallel — [Hooks reference](https://code.claude.com/docs/en/hooks)
- Anthropic's non-hook alternatives for stop-gating: `/goal` (separate evaluator re-checks a condition each turn) and verification subagents/workflows — [Best practices](https://code.claude.com/docs/en/best-practices)
- `InstructionsLoaded` hook exists to log which CLAUDE.md/rules files loaded and why (useful for debugging, and as a measurement hook) — [Memory docs](https://code.claude.com/docs/en/memory)

**Recipes in the wild**
- Forced skill-eval UserPromptSubmit hook (command hook printing the instruction text; settings shape `hooks.UserPromptSubmit[].hooks[]{type:"command",command:"~/.claude/hooks/skill-forced-eval-hook.sh"}`) — [umputun gist](https://gist.github.com/umputun/570c77f8d5f3ab621498e1449d2b98b6)
- Stop hook pattern: read stdin JSON; if `stop_hook_active` is true, exit 0 (anti-loop); else run tests and `exit 2` with failure output on stderr if they fail. Multiple practitioner write-ups agree; none I fetched report success-rate numbers — [Coding with Roby](https://codingwithroby.substack.com/p/the-stop-hook-that-wont-let-claude), [DEV: The hook that won't let the agent say done](https://dev.to/marcindudekdev/the-hook-that-wont-let-the-agent-say-done-bj5) (search snippets only; pages not fetched)
- Superpowers injects its `using-superpowers` bootstrap skill via a SessionStart hook on Claude Code, Codex, Cursor, Gemini and others, so skill-checking is on from the first turn without user opt-in — [obra/superpowers README](https://github.com/obra/superpowers)

**Costs**
- Forced-eval hook: +~2s average latency (10.7s vs ~8.6-9.6s control) in the Sonnet 4.5 sandbox test; ~$0.001 more per test than simple hook on Haiku 4.5 (0.0067 vs 0.0058) — see Scott Spence links above.
- Hook output counts against context every turn it is injected; the 10k-char cap bounds the worst case (~2,500 tokens, my estimate at ~4 chars/token).

### Inferences
- Pattern for a workflow gate: SessionStart injects the process index (short); UserPromptSubmit injects a one-line state-aware reminder ("current stage: X; next required artifact: Y"); PreToolUse denies edits/commits when the stage artifact is missing; Stop blocks until the stage's check passes, with a `stop_hook_active` or counter guard.
- Use `if` matchers so gates only run on relevant tool calls to avoid latency tax.

### Gaps
- No published token-cost measurement of per-turn reminder hooks across long sessions.
- No reported success rate for Stop-hook gates (only descriptions).
- Did not read hooks reference past char 100,000 (e.g. InstructionsLoaded, PreCompact details).

## 3. Skill triggering: description patterns, always-on vs on-demand, size limits

### Takeaway
Skill descriptions are always loaded; bodies load on invocation. Anthropic caps the listing text (description + when_to_use) at 1,536 chars and advises SKILL.md under 500 lines. Measured data says descriptions alone rarely produce reliable activation, so teams add hooks, or move always-needed knowledge into always-on context.

### Cited Findings
- [DOCS] `description` + `when_to_use` truncated at 1,536 characters in the skill listing; descriptions always load unless `disable-model-invocation: true`; full SKILL.md loads when invoked and then stays in context; keep SKILL.md under 500 lines and push detail into reference.md/examples.md; `user-invocable: false` for model-only reference; `/skill-doctor` (v2.1.252+) shows per-skill token cost and usage; `skillOverrides: {"name":"off"}` turns off unused skills — [Skills docs](https://code.claude.com/docs/en/skills)
- [DOCS] Description pattern from Anthropic's example: lead with what it does, then "Use when the user asks ..." trigger phrases; put key use case first; avoid repetition because budget is shared — [Skills docs](https://code.claude.com/docs/en/skills)
- [DOCS] Side-effect workflows should set `disable-model-invocation: true` and be run as `/skill-name` — [Best practices](https://code.claude.com/docs/en/best-practices)
- [MEASURED] Skills default behavior = baseline in Vercel's eval (53% both); instruction wording changed outcomes (see section 1) — [Vercel](https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals)
- [ANECDOTE] A report headline "Claude Code Skills Waste 23K Tokens Per Session" exists (aiweekly.co) but the page returned HTTP 403 and I could not read it; not used.
- Cursor has four rule modes: Always Apply, Apply to Specific Files (globs), Apply Intelligently (agent decides from description, same weakness as skills), Apply Manually (@-mention). Guidance: keep always-on rules tiny — [StackHawk summary of Cursor rules](https://www.stackhawk.com/blog/cursor-rules/)
- [MEASURED, secondhand via blog] Augment Code AuggieBench: 100-150 line context files performed best, with gains reversing beyond that; I did not find the primary Augment source — [mcp.directory](https://mcp.directory/blog/claude-md-vs-agents-md-vs-skills-2026)

### Inferences
- "Always-on vs on-demand" rule of thumb from the evidence: knowledge needed on nearly every task (process, key conventions, an index of docs) goes into always-on context or a SessionStart hook; procedures with side effects go to user-invoked skills; topical procedures go to auto skills only if backed by a forced-eval or keyword hook.
- Agent-requested (description-triggered) Cursor rules likely share the skills' activation problem; I found no measurement.

### Gaps
- No measured study of description-writing patterns (e.g. trigger phrases vs none) in isolation; Spence tested hook styles, not descriptions.
- No hard limit found on skill count; only the description cap and `/skill-doctor`. Did not read last ~4k chars of skills doc.

## 4. Rules files across tools: size, structure, nesting, just-in-time loading

### Takeaway
All major tools load rules files into every turn (always-on), so size trades adherence for cost. Anthropic: under 200 lines per CLAUDE.md. Use hierarchy, path-scoped rules and on-demand subdirectory files for just-in-time loading. Research (ETH Zurich) says keep only minimal, non-derivable requirements.

### Cited Findings
- [DOCS] Claude Code: target <200 lines per CLAUDE.md; imports (`@path`, max depth 4) organize but do not reduce context since they load at launch; `.claude/rules/*.md` with `paths:` frontmatter loads only when Read/Write/Edit touches a matching file; subdirectory CLAUDE.md loads on demand when Claude touches files there; block HTML comments are stripped before injection (free maintainer notes); project-root CLAUDE.md is re-read after `/compact`; managed CLAUDE.md (`/Library/Application Support/ClaudeCode/CLAUDE.md`, `claudeMd` in managed settings) for org policy; file hard limit 4 MiB; startup warning when over length; `/doctor prompt-audit` (v2.1.283+) finds stale/conflicting instructions; auto memory loads first 200 lines or 25KB of MEMORY.md as an index with topic files read on demand — [Memory docs](https://code.claude.com/docs/en/memory)
- [DOCS] Include/exclude guidance: include non-guessable commands, style deviations, test runners, gotchas; exclude what code reveals, standard conventions, long docs, file-by-file descriptions. Test each line: "Would removing this cause Claude to make mistakes?" — [Best practices](https://code.claude.com/docs/en/best-practices)
- [DOCS] Claude Code reads AGENTS.md (v2.1.277+) only if no CLAUDE.md/CLAUDE.local.md exists in or above the working dir, unless set to `claude-md-and-agents-md`; recommended shared pattern is a CLAUDE.md containing `@AGENTS.md` plus Claude-specific lines — [Memory docs](https://code.claude.com/docs/en/memory)
- [DOCS via secondary] Codex CLI: AGENTS.md files concatenated root-down, later/closer files win, total capped by `project_doc_max_bytes` default 32 KiB — [Daniel Vaughan, Codex AGENTS.md patterns (Mar 26 2026)](https://codex.danielvaughan.com/2026/03/26/agents-md-advanced-patterns/); official page: [OpenAI Codex AGENTS.md guide](https://developers.openai.com/codex/guides/agents-md) (not fetched)
- [DOCS via secondary] Gemini CLI: GEMINI.md loaded hierarchically (global, project, subdirectory), `@./path` imports, always on every turn, `/memory refresh` — [Gemini CLI memport docs](https://geminicli.com/docs/core/memport), [localskills.sh guide](https://localskills.sh/blog/gemini-md-guide)
- Kiro steering: persistent project guidance outside the spec folder (inclusion modes not verified in the pages I read) — [Kiro specs docs](https://kiro.dev/docs/specs/index)
- Peak size: Anthropic <200 lines; Augment (secondhand) 100-150 lines; mcp.directory layered recommendation: single AGENTS.md under ~150 lines + skills for procedures + path-scoped rules — [mcp.directory](https://mcp.directory/blog/claude-md-vs-agents-md-vs-skills-2026)
- "Rules get ignored" fixes with Anthropic backing: prune, make concrete and verifiable ("Use 2-space indentation"), remove contradictions across files (user vs project rules conflict arbitrarily), emphasize only a few lines, convert must-happen rules to hooks, check `/context` that the file actually loaded — [Memory docs](https://code.claude.com/docs/en/memory)

### Inferences
- Cursor/Copilot analogues: always-on instruction file kept small, file-scoped rules via globs (Cursor `globs`; Copilot path-specific instructions, not verified here).
- Conflict between layered files (global CLAUDE.md + project CLAUDE.md + rules) is a self-inflicted source of "ignored" rules; Anthropic confirms the model picks arbitrarily.

### Gaps
- Did not verify Copilot instructions limits or Cursor's own docs directly.
- Codex and Gemini details are via secondary sites.

## 5. Deterministic orchestration and spec-driven process (AI-DLC, Spec Kit, Kiro, BMAD, Superpowers)

### Takeaway
AWS AI-DLC is a methodology (Inception, Construction, Operations; mob elaboration; bolts) delivered as markdown rule files plus, in v2, an engine with approval gates and audit trail. Spec Kit, Kiro, and Superpowers enforce process mostly through templated stages and prompts/skills, i.e. still advisory to the model. Independent reviews (Thoughtworks) report agents ignore spec instructions and the ceremony is heavy for small tasks. I found no controlled study of quality vs autonomy vs cost for these tools.

### Cited Findings
**AWS AI-DLC**
- [Blog, Jul 31 2025] Two dimensions: AI-powered execution with human oversight; dynamic team collaboration. Loop: AI creates plan, asks clarifying questions, implements, humans validate. Phases: Inception (Mob Elaboration: business intent to requirements/stories/Units of Work), Construction (Mob Construction: architecture, domain models, code, tests with real-time team input), Operations (AI manages infra/deploy using accumulated context). Sprints become "bolts" (hours/days), epics become "Units of Work"; persistent context stored in the repo. Claimed benefits are qualitative (velocity, quality, dev experience), no numbers on the page — [AWS DevOps blog](https://aws.amazon.com/blogs/devops/ai-driven-development-life-cycle/)
- [Repo, state at fetch Oct 2026, v2.10.0, MIT-0] `awslabs/aidlc-workflows` README: 5 phases and 33 stages, 14 agents (11 domain experts, 2 reviewers, 1 adaptive composer), 11 workflow profiles (feature, bug fix, infra, security...), "human approval gates and source-bound review evidence", 114-event audit trail with persistent state, 86 engine/authoring tools in `core/tools/`; harness-neutral core runs in Claude Code, Cursor, Kiro CLI/IDE, Codex CLI, opencode, GitHub Copilot via `/aidlc` (`$aidlc` on Codex); recommended model Claude Opus 4.8 — [aidlc-workflows README](https://raw.githubusercontent.com/awslabs/aidlc-workflows/main/README.md)
- [Third-party, older version] Earlier repo layout: `aidlc-rules/aws-aidlc-rules/` (core workflow rules) and `aws-aidlc-rule-details/` (detail files referenced conditionally = progressive disclosure); Operations phase was "not yet released as of v0.1.8" — [docsearch summary of repo](https://docsearch.algolia.com/mcp/docs/repo/awslabs/aidlc-workflows), [ttpsc summary](https://ttpsc.com/en/blog/how-aws-ai-dlc-defines-an-ai-native-methodology/)
- Note: the README I fetched describes a much larger system (v2.10.0) than the 2025 blog; the blog's "three phases/bolts" framing is the original, the 5-phase/33-stage engine is current. I did not read the whitepaper (bolt/mob-ritual definitions beyond the blog).

**Spec Kit (GitHub)**
- Commands: constitution, specify, plan, tasks, implement, plus `converge` loop in current version; "independent entry points" rather than mandatory phases; constitution = upfront principles referenced throughout; clarification/checklist/analysis are optional quality gates; separates "diagnosis, repair, and verification" in bug-fix extension — [github/spec-kit](https://github.com/github/spec-kit)
- [ANECDOTE/expert review, Oct 2025] Spec Kit generated many verbose markdown files (reviewer would rather review code); Kiro uses the same 3-phase flow even for bugs ("sledgehammer to crack a nut"); Tessl showed non-determinism — [Böckeler on martinfowler.com](https://www.martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html). Thoughtworks Radar put SDD in "Assess" in Nov 2025 and Beck/Fowler criticized it in Jan 2026 per a secondary source — [search summary](https://www.braingrid.ai/blog/spec-driven-development-tools) (not verified at primary)

**Kiro**
- Specs = requirements.md (EARS: "WHEN [condition] THE SYSTEM SHALL [behavior]"), design.md, tasks.md in `.kiro/specs/`; Feature Specs have approval gates between phases (Requirements-First or Design-First variants); Quick Spec skips gates; task runner computes dependency waves and runs independent tasks concurrently; steering and hooks exist as separate features — [Kiro docs](https://kiro.dev/docs/specs/index)

**Superpowers (obra)**
- Mandatory skill-check-before-task via SessionStart bootstrap; 7-stage sequence: brainstorming, git worktrees, writing-plans (2-5 minute tasks), subagent-driven development with two-stage review, TDD red-green-refactor, requesting code review, finishing branch; ~296k stars at fetch — [obra/superpowers](https://github.com/obra/superpowers)

**Anthropic's own process guidance [DOCS]**
- Explore, plan (plan mode), implement, commit; skip planning if the diff fits in one sentence; for big features have Claude interview you and write SPEC.md, then execute in a fresh session; writer/reviewer pattern and adversarial review in a fresh subagent; warns reviewers asked to find gaps always find some, causing over-engineering — [Best practices](https://code.claude.com/docs/en/best-practices)

### Inferences
- Spectrum of enforcement strength: prompt/skill-only (Superpowers, Spec Kit templates) < IDE-enforced approval gates (Kiro) < engine-with-state-and-audit (AI-DLC v2) < hooks that block tool calls/stop. Only the last two bind the model's actions; the first group depends on the activation-rate problem in section 1.
- Cost/ceremony scales with stage count regardless of task size; AI-DLC addresses this with workflow profiles and an adaptive composer, Kiro offers Quick Spec. That matches Böckeler's complaint but I found no data showing it works.

### Gaps
- No quantitative comparison (quality, cost, autonomy) of spec-driven tools vs plain prompting. The `uvik.net` "spec-driven development benchmark" result appeared in search but was not read.
- BMAD-METHOD not researched (no source fetched). LangGraph-style state machines not researched.
- AI-DLC whitepaper and any customer metrics not read; bolt/mob-session specifics beyond the blog are missing.

## 6. Evals for instruction adherence in agentic coding

### Takeaway
Teams test adherence by running the agent in a sandbox, capturing the trace, and applying deterministic assertions on observable side effects first, LLM judges for sequence/behavior second, and comparing against a no-skill baseline. Purpose-built harnesses exist for skill triggering.

### Cited Findings
- [Mar 23 2026] MLflow: three layers: deterministic rule judges on side effects (e.g. did Claude call a specific function), trace checks (ground truth of tool calls, file reads, shell commands in order, "not what Claude said it did, but what it actually did"), and LLM judges for sequential/behavioral questions; output `[PASS/FAIL] judge on trace`; no numeric benchmarks given — [MLflow blog](https://mlflow.org/blog/evaluating-skills-mlflow)
- Spence harness: fresh sandboxed Claude Code sessions per prompt, 20s timeout, N prompts including negatives (true-negative rate measured), repeated runs, per-config cost and latency logged — [Spence sandboxed evals](https://scottspence.com/posts/measuring-claude-code-skill-activation-with-sandboxed-evals)
- Tools (descriptions from search results only, not fetched, version/maturity unknown): `cc-plugin-eval` 4-stage framework for skill/agent/command triggering with programmatic detection first and LLM judge second — [sjnims/cc-plugin-eval](https://github.com/sjnims/cc-plugin-eval); `caliper-eval` runs a spec repeatedly for a success rate and also runs tasks without the skill to see if the skill adds anything — [PyPI caliper-eval](https://pypi.org/project/caliper-eval/0.9.0/); `eval-harness-kit` manifests with deterministic checks and optional `llm_rubric` judge — [skill registry entry](https://openskillindex.com/skills/majiayu000-claude-skill-registry-eval-harness-kit)
- Anthropic: `claude plugin eval` and `/skill-doctor` exist per the agent-type descriptions in this environment; and `/doctor prompt-audit` lints instruction files — [Memory docs](https://code.claude.com/docs/en/memory). I did not read the plugin-eval docs.
- Anthropic advice for CLAUDE.md maintenance: "test changes by observing whether Claude's behavior actually shifts" — [Best practices](https://code.claude.com/docs/en/best-practices)
- Benchmarks: AgentIF (constraint-level code, LLM, and hybrid scoring) — [arXiv 2505.16944](https://arxiv.org/html/2505.16944v1); ETH AGENTbench includes tool-usage counts as a behavioral adherence measure — [arXiv 2602.11988](https://arxiv.org/html/2602.11988v1)

### Inferences
- Minimal adherence eval recipe: (1) prompt set with positives and negatives, (2) run N times per config in a fresh sandbox, (3) assert on transcript/tool-call JSON (e.g. Skill tool invoked, test command ran before commit), (4) LLM judge only for sequence/quality rules, (5) include a no-rule baseline, (6) log cost and latency.
- A `InstructionsLoaded` hook plus stream-json transcripts allow deterministic "was the rule even loaded" checks.

### Gaps
- No published adherence rates for specific rule types (e.g. "TDD first") from teams; no transcript-checker open-source case studies read in depth.
- Tool pages for cc-plugin-eval/caliper not fetched; maturity unverified.

## 7. How do teams cap the token cost of rules and skills?

### Takeaway
Layered progressive disclosure: tiny always-on core, on-demand skill bodies, path-scoped or directory-scoped rules, indexes pointing to docs, and size budgets with tooling to audit them.

### Cited Findings
- Two-tier skill cost: short descriptions always in context (capped at 1,536 chars each), bodies on demand; disable auto-invocation to drop a description from context; `/skill-doctor` for per-skill cost; `skillOverrides` to turn off — [Skills docs](https://code.claude.com/docs/en/skills)
- Path-scoped rules and nested CLAUDE.md load only when matching files are touched; imports do not save tokens; HTML comments stripped; MEMORY.md index capped at 200 lines/25KB with topic files on demand; startup warnings when files or their combined size exceed limits — [Memory docs](https://code.claude.com/docs/en/memory)
- Compressed index: Vercel cut a docs index from ~40KB to 8KB (-80%) and kept 100% pass rate — [Vercel](https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals)
- Hard caps elsewhere: Codex 32 KiB default for combined AGENTS.md — [Codex AGENTS.md patterns](https://codex.danielvaughan.com/2026/03/26/agents-md-advanced-patterns/); hook injection 10,000 chars per field — [Hooks reference](https://code.claude.com/docs/en/hooks)
- Cost of overloading: context files raised agent cost 19-23% with no benefit (LLM-generated) — [arXiv 2602.11988](https://arxiv.org/html/2602.11988v1)
- AI-DLC splits core rules from detail files "conditionally referenced" by the core — [docsearch summary](https://docsearch.algolia.com/mcp/docs/repo/awslabs/aidlc-workflows)
- Anthropic's session-level context hygiene: `/clear` between tasks, subagents for exploration, `/compact` with preservation instructions, after two failed corrections restart with a better prompt — [Best practices](https://code.claude.com/docs/en/best-practices)

### Inferences
- A workable budget from the sources: always-on core (CLAUDE.md/AGENTS.md) 100-200 lines or ~8KB index; each skill description under ~300 chars in practice (limit 1,536); SKILL.md under 500 lines; per-turn hook injection a few lines. These numbers are my synthesis of the limits above, not a single published standard.

### Gaps
- No published breakdown of tokens per skill description or per hook injection in real teams; the "23K tokens wasted" article was inaccessible (HTTP 403).
- No data on how skill count affects activation accuracy.
