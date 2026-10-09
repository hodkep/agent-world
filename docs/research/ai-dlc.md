# AI-DLC and the intent gap

Research for the workflows feature, asked by delta on the user's behalf. Charlie's first pass is in `docs/workflows-design.md` (D15-D20, "AI-DLC research"); this adds the intent-gap side and what others do.

Last updated: 2026-10-09. Nothing in the code was changed.

## How to read this

- **Fact** = stated on the cited page. Quotes are short and exact.
- **Interpretation** = my reading. Marked *(interpretation)*.
- **Opinion** = a recommendation. Marked *(opinion)*.
- **Not verified** = could not be confirmed from a primary source. Listed again at the end.
- Pages were read on 2026-10-09; the AWS repo and docs change often (the repo badge showed v2.11.0).

## Summary

1. AI-DLC has two published shapes. The AWS paper and blog describe **3 phases** (Inception, Construction, Operations) with two team ceremonies, Mob Elaboration and Mob Construction ([blog](https://aws.amazon.com/blogs/devops/ai-driven-development-life-cycle/)). The open-source rules (v2) have **5 phases and 33 stages** and a human approval gate after every stage the scope runs, except Initialization ([stages](https://awslabs.github.io/aidlc-workflows/guide/04-phases-and-stages/)).
2. Its answer to the intent gap is **questions first, approval after**. Requirements analysis "always" generates clarifying questions, scans the answers for vague words, and refuses to proceed on partial answers ([Inception reference](https://awslabs.github.io/aidlc-workflows/reference/04-stages/inception/)). It does **not** have a step that reads the agent's understanding back before moving on. The only confirmation is the gate after the artifacts are written (same page).
3. The idea raised in Slack (show a summary of planned operations and confirm before execution) is close to AI-DLC's **Plan Approval** before code generation ([interaction modes](https://awslabs.github.io/aidlc-workflows/guide/07-interaction-modes/)). What is missing in AI-DLC, and what the Slack point asks for, is an explicit "here is what I understood and what I assumed" block. *(interpretation)*
4. Evidence that agents need help here is solid; evidence for one particular gate design is thin. Models are poor at noticing that an instruction is underspecified, and asking helps a lot when they do ([Ambig-SWE](https://arxiv.org/abs/2502.13069)); a scaffold that separates "detect the gap" from "do the work" reached a 69.40% resolve rate, close to fully-specified instructions ([Ask or Assume](https://arxiv.org/abs/2603.26233)). I found no study that measures a "plan summary and confirm" gate on real tasks.
5. For Agent World, the cheapest useful option is a **fixed read-back block at the top of the plan**, checked by the engine's code (zero model tokens) and shown at the plan-approval gate that D16 already has. Details and costs in section 5.

## 1. What AI-DLC is

### The original: three phases

Source: [AWS DevOps blog](https://aws.amazon.com/blogs/devops/ai-driven-development-life-cycle/).

| Phase | What happens | Human gate |
|---|---|---|
| Inception | AI turns business intent into requirements, stories and units | **Mob Elaboration**: the team validates the AI's questions and proposals |
| Construction | AI proposes logical architecture, domain models, code and tests | **Mob Construction**: the team clarifies technical decisions as it builds |
| Operations | AI manages infrastructure as code and deployments, under oversight | Team oversight |

- Roles: the AI "creates plans, asks clarifying questions, and implements after human validation"; humans make the critical decisions because only they have the business context.
- Artifacts: work plans, requirements, stories, units, architecture, domain models, code, tests, infrastructure as code, kept in the project repository so context carries between phases.
- The blog does not say which steps or artifacts are mandatory. That is in the white paper, which I did not read (not verified).

### The open-source rules (v2): five phases, 33 stages

Sources: [stages guide](https://awslabs.github.io/aidlc-workflows/guide/04-phases-and-stages/), [repo](https://github.com/awslabs/aidlc-workflows).

| Phase | Stages | Always run | Conditional |
|---|---|---|---|
| 0 Initialization | 0.1-0.3 | all three | none |
| 1 Ideation | 1.1-1.7 | 1.1, 1.4, 1.7 | 1.2, 1.3, 1.5, 1.6 |
| 2 Inception | 2.1-2.9 | 2.3, 2.7, 2.9 | 2.1 (brownfield only), 2.2, 2.4 (user-facing), 2.5 (UI), 2.6 (per plan), 2.8 |
| 3 Construction | 3.1-3.7 | 3.5, 3.6 | 3.1-3.4 per Unit; 3.7 CI pipeline once, if included |
| 4 Operation | 4.1-4.7 | none | all; "may be skipped for `mvp` and `poc` scopes" |

- The guide says "Phases execute sequentially" and never uses the word "optional": a stage is **always** or **conditional** on scope, project type or the execution plan. The 5/33 totals come from the stage numbering on the [home page](https://awslabs.github.io/aidlc-workflows); I counted them, the page does not state a total.
- **Scope** decides which stages run; **depth** (Minimal, Standard, Comprehensive) decides how much detail each stage writes. Scope sets a default depth, and you can override it, including at any gate ([scopes and depth](https://awslabs.github.io/aidlc-workflows/guide/05-scopes-and-depth/)). A poc runs 8 of the 33 stages (same page).
- **Agents:** 14 (11 domain experts, 2 reviewers, an adaptive composer), 11 workflow profiles, a 117-event audit trail ([repo](https://github.com/awslabs/aidlc-workflows)). Runs inside Claude Code, Kiro, Codex CLI, Cursor, opencode and Copilot through thin per-tool manifests (same page).
- **Gates:** "Every stage your scope runs, outside Initialization, ends with an approval gate." Approval needs a real message from the person: "A gate that is put to you needs a real message from you to approve it." Approve "refuses unless one was recorded since the last gate resolution" ([guide](https://awslabs.github.io/aidlc-workflows/guide/04-phases-and-stages/), [modes](https://awslabs.github.io/aidlc-workflows/guide/07-interaction-modes/)). Failures "always stop Construction, even in autonomous mode".
- **Answering questions** has three modes (Guide Me, Edit File, Chat); the questions file is the source of truth ([modes](https://awslabs.github.io/aidlc-workflows/guide/07-interaction-modes/)).
- **An intent** is one run of the lifecycle scoped to one task; describing work auto-creates it, and it "never creates a second intent without asking" ([spaces and intents](https://awslabs.github.io/aidlc-workflows/guide/03-spaces-and-intents/)). This is close to our D18 (a run is a task).

## 2. How AI-DLC handles the intent gap

### What "the intent gap" means

Lahiri (Microsoft Research) defines it as "the semantic distance between what a user means and what a program does", and argues "there is no oracle for specification correctness other than the user" ([arXiv 2603.17150](https://arxiv.org/html/2603.17150v1)). That is a position paper surveying earlier work, not new experiments (same page). AI-DLC does not use the term.

### Where AI-DLC captures, checks and confirms intent

| | What it does | Source |
|---|---|---|
| **Captured** | Requirements analysis writes `requirements-analysis-questions.md` (answers tagged `[Answer]:`, options A-E, last option always "Other") and `requirements.md` (intent analysis, FR/NFR ids, constraints, **assumptions with rationale**, out of scope, open questions). | [Inception reference](https://awslabs.github.io/aidlc-workflows/reference/04-stages/inception/) |
| **Checked** | "always generate clarifying questions unless requirements are exceptionally clear and complete". Answers get a mandatory scan for "mix of", "not sure", "depends", "probably", "maybe", plus contradictions and gaps. "Do NOT proceed with partial answers." Rule of thumb: "When in doubt, ask." | same |
| **Confirmed** | The stage approval gate after the artifacts exist: Approve or Request Changes. Before code, a **Plan Approval** per Unit: "approve, or edit the plan yourself". | same; [modes](https://awslabs.github.io/aidlc-workflows/guide/07-interaction-modes/) |
| **Drift** | Editing an old artifact only warns: "The warning is advice, not a stop" (a `strict` policy re-reviews the current stage's edits). | [modes](https://awslabs.github.io/aidlc-workflows/guide/07-interaction-modes/) |

### What it does not have

- The Inception reference says there is **no separate step that reads the understanding back** to the user before moving on. The request analysis (clarity, type, scope, complexity) and the depth choice are "internal assessments", and the only explicit confirmation is the approval gate after the artifacts are written ([Inception reference](https://awslabs.github.io/aidlc-workflows/reference/04-stages/inception/)).
- *(interpretation)* The `assumptions` section in `requirements.md` is the closest thing to a read-back, but it is one section in a long document, reviewed at a gate that also asks the person to approve everything else. A reader can approve a document without noticing a wrong assumption inside it.
- *(interpretation)* AI-DLC's strongest lever is the **question list**. It catches what the agent knows it does not know. It does not catch what the agent does not know it is guessing, which is exactly what the evidence in section 4 says models are bad at.

## 3. Team practice from Slack, set against what I found

The Slack points come from delta's message and are not independently verifiable. Left column is theirs; right column is how it lines up.

| Team practice | Closest published equivalent | Note |
|---|---|---|
| Evolving harness: skills, steering, hooks | Rule files are advice; hooks are deterministic ([Claude Code best practices](https://code.claude.com/docs/en/best-practices): "Unlike CLAUDE.md instructions which are advisory, hooks are deterministic") | Matches Agent World's own finding that only hooks, permissions and an engine bind the model (`docs/workflows-design.md`) |
| Project-architecture skill from existing code; product skill from release notes and roadmap | AI-DLC's brownfield stage 2.1 (reverse-engineering existing code) ([stages](https://awslabs.github.io/aidlc-workflows/guide/04-phases-and-stages/)); Claude Code `/init` | These reduce what the agent has to guess about the codebase and the product. They do not reduce what it has to guess about *this request*. *(interpretation)* |
| Challenger subagents when several solutions exist | AI-DLC has 2 reviewer agents ([repo](https://github.com/awslabs/aidlc-workflows)); Claude Code suggests a fresh-context reviewer ([best practices](https://code.claude.com/docs/en/best-practices)) | Review of a *solution*, after options exist |
| Spec phase lists options with pros and cons; human chooses | Requirements questions with A-E options ([Inception reference](https://awslabs.github.io/aidlc-workflows/reference/04-stages/inception/)); Spec Kit `[NEEDS CLARIFICATION: ...]` markers ([spec-driven.md](https://github.com/github/spec-kit/blob/main/spec-driven.md)) | Same idea. Choosing between options works when the agent *knows* there are options |
| Orchestrators: feature builder (spec, confirm, implement, regress test, review); quick builder that skips spec | AI-DLC scopes (feature vs express/bugfix) ([scopes](https://awslabs.github.io/aidlc-workflows/guide/05-scopes-and-depth/)); BMAD: "Small changes go straight to build" ([README](https://github.com/bmad-code-org/BMAD-METHOD)); Kiro Quick Spec "without approval gates" ([Kiro specs](https://kiro.dev/docs/specs/)) | Everyone has a fast lane. The question is what the fast lane keeps |
| Open point: no explicit intent validation; idea of a plan summary with confirmation before execution | AI-DLC Plan Approval; Claude Code plan mode: Claude "proposes a plan but makes no edits until you approve" ([common workflows](https://code.claude.com/docs/en/common-workflows)); Cursor Plan Mode asks clarifying questions and builds only when you choose ([Cursor](https://cursor.com/docs/agent/planning)) | A *plan* is shown by all of them. A *read-back of intent and assumptions* is not a named step in any of the ones I read |
| "Babysitting costs more than letting it err, then fix the cause" | Anthropic: "Plan mode is useful, but also adds overhead", skip it "If you could describe the diff in one sentence" ([best practices](https://code.claude.com/docs/en/best-practices)) | Consistent with both. I found no measurement of the babysitting cost (not verified) |

## 4. How others do it, and what the evidence says

### Methods

| Method | How intent is handled | Source |
|---|---|---|
| **Claude Code** | Plan mode (no edits until approved). For big features, "have Claude interview you" with the `AskUserQuestion` tool and write `SPEC.md`, then execute in a fresh session. Notes the agent cannot ask questions in scheduled, unattended runs. | [best practices](https://code.claude.com/docs/en/best-practices), [common workflows](https://code.claude.com/docs/en/common-workflows) |
| **Cursor** | Plan Mode: clarifying questions, a plan you review and edit, then "build the plan". | [Cursor](https://cursor.com/docs/agent/planning) |
| **Kiro** | Requirements, design, tasks as three files; Requirements-First or Design-First; "Analyze Requirements" catches "inconsistencies, ambiguities, and gaps" before design; Quick Spec skips the gates. The page does not describe review mechanics. | [Kiro specs](https://kiro.dev/docs/specs/) |
| **GitHub Spec Kit** | Templates tell the model "Don't guess" and to mark gaps as `[NEEDS CLARIFICATION: question]`; a checklist item says none may remain; tests must be "validated and approved by the user" before implementation. A `/speckit.clarify` step that asks up to 5 questions exists in community copies, but I could not confirm it on the official pages. | [spec-driven.md](https://github.com/github/spec-kit/blob/main/spec-driven.md), [README](https://github.com/github/spec-kit) |
| **BMAD** | Loop of Clarify, Plan, Build and verify; "Small changes go straight to build". The README does not describe how requirements are confirmed. | [README](https://github.com/bmad-code-org/BMAD-METHOD) |
| **Intent-Audited Development** (a LinkedIn post by an individual, one of the user's links) | The human's choices and expected behaviour are recorded before planning and only the human may change them after approval; a strong model plans; builders "stop and report gaps instead of improvising"; code is audited against the plan and the plan against the intent. Its own README gives no cost figures. | [post](https://www.linkedin.com/posts/nikhilwanpal_intentauditeddevelopment-aiengineering-agenticai-share-7509738245593788416-DKKI/), [repo](https://github.com/nikhilw/structured-agentic-workflow) |

The user's second link ([resolves to a post](https://www.linkedin.com/posts/saedf_my-job-at-google-is-thinking-like-an-attacker-share-7510642138414542849-YPbF/)) is a 30-point security checklist for AI-built apps. It does not discuss intent, so I did not use it here.

### Evidence

| Finding | Source | Caveat |
|---|---|---|
| Models "struggle to distinguish between well-specified and underspecified instructions"; interacting to get missing information improves results "up to 74%" over non-interactive runs. ICLR 2026. | [Ambig-SWE](https://arxiv.org/abs/2502.13069) | Simulated user holding the full spec; underspecified variant of SWE-bench Verified; 74% is relative |
| A scaffold that **separates detecting underspecification from executing code** reached a 69.40% resolve rate, beating a single-agent setup and approaching fully-specified performance; it asks fewer questions on simple tasks and more on complex ones. | [Ask or Assume](https://arxiv.org/abs/2603.26233) | Same benchmark family; I read the abstract only |
| Models guess unspecified requirements correctly about 41.1% of the time by default; underspecified prompts are about 2x as likely to regress across model or prompt changes, sometimes by over 20%; writing every requirement into the prompt did not reliably help. | [What Prompts Don't Say](https://arxiv.org/abs/2505.13360) (via a [search summary](https://arxiv.org/pdf/2505.13360); not re-read in full) | Three tasks, 60 requirements; about prompts, not repositories |
| Interactive test approval (TiCoder) raised correct evaluation of generated code from 40% to 84% in a 15-developer study. | [Lahiri](https://arxiv.org/html/2603.17150v1) | Small study; self-contained algorithmic functions only |
| Planning has an overhead and is not always worth it. | [best practices](https://code.claude.com/docs/en/best-practices) | Guidance, not a measurement |

*(interpretation)* What the evidence supports: (a) the agent is unreliable at knowing when it is guessing, so a gate that depends only on the agent raising its hand will miss cases; (b) detection works better as its own cheap step; (c) asking costs little when intent is unclear and is wasted when it is clear, so the gate should be conditional. What it does **not** show: that a read-back summary at a plan gate catches wrong intent more often than the plan alone. That is untested here.

## 5. What it means for Agent World

Fit with the decisions in `docs/workflows-design.md`:

- **D15 (engine is plain code, no extra tokens):** any gate whose *check* is code (does the plan have the block, are there open questions) costs no model tokens. Only *producing* the content costs tokens.
- **D16 (plan, merge, deploy gates):** the plan-approval gate already exists. Intent validation fits inside it; it does not need a fourth gate.
- **D17 (economy / balanced / max dial):** each option below can map to one dial position.
- **D18 (a run is a task):** the read-back is per task, and a follow-up round can reuse the confirmed block instead of asking again.

Token numbers below are my **estimates**, not measurements. Attention is counted as extra things the person reads or decides.

| # | Option | What it is | Token cost *(estimate)* | Attention cost |
|---|---|---|---|---|
| A | **Read-back block** | The planning step must start `plan.md` with a fixed block: goal in one sentence; assumptions, each marked *given* or *guessed*; out of scope; open questions. The engine refuses to show the gate if the block is missing. | about 150-300 output tokens in the plan step; the check is code, 0 tokens | About 6 lines read at the gate that already exists. No new stop |
| B | **Questions block the gate** | If "open questions" is non-empty, the engine stops and shows them as choices with pros and cons (the team's spec practice, as data). Empty means the gate shows the plan as usual. | tokens only on unclear tasks (the questions, roughly 100-400) | A decision only when the agent flagged something. Nothing on clear tasks |
| C | **Separate intent check** | A cheap step before planning, run on a small model with only the request (not the repo): "list what is not stated that could change the result". Based on the detect-then-execute result in [Ask or Assume](https://arxiv.org/abs/2603.26233). Feeds options A and B. | about 1-3k input and 200-400 output tokens on a small model, every task | None unless it finds something |
| D | **Intent audit at the merge gate** | After implementation, a step compares the confirmed block and the original request against the diff summary and reports differences. The idea from [Intent-Audited Development](https://github.com/nikhilw/structured-agentic-workflow). | input grows with the diff size; a summary plus the block is about 2-5k | One line at the existing merge gate; more only when it reports drift |
| E | **Skip rule for small tasks** | The quick path skips A-C when the change can be described in one sentence ([Anthropic's rule](https://code.claude.com/docs/en/best-practices)), or the person says so. | saves A-C | none |

*(opinion)* Suggested start:

1. Build **A and B** together. They add no stop on clear tasks and cost the person six lines on the others. The check is code, which keeps D15 intact.
2. Put **C** at the dial's "max" setting only, and **D** at "balanced" and "max". Run **E** at "economy".
3. Measure before adding more. Reuse the pilot style from the library work: a set of 20 requests where the right behaviour is known (10 clear, 10 with one hidden gap), and count how often the block lists the gap as *guessed* (A), asks (B) and wastes a question on a clear request. Pass bar to be chosen by the user.
4. Do not copy AI-DLC's approval after every stage. Its gates are many by design, and this note's evidence only argues for one well-placed check.

Open points for the user:
- Should the *given / guessed* split be the model's call, or should the engine mark anything not found in the user's words as guessed? (The first is cheap and fallible; the second needs text matching and will be noisy.)
- Does a confirmed block bind later rounds? AI-DLC lets approval be revisited; Intent-Audited Development says only the human may change it.
- Should an unattended or scheduled run skip the gate, or refuse to start without a confirmed block?

## Not verified

- The AI-DLC **white paper** was not read, so which steps are mandatory in the original method is unknown. Mandatory vs conditional above is for the open-source v2 rules only.
- Spec Kit's `/speckit.clarify` (and its "up to 5 questions" behaviour) comes from third-party skill copies in search results, not the official repo pages I could fetch; those pages did not describe it.
- Kiro's review and approval mechanics and any EARS notation are not described on the specs page I read.
- BMAD's PRD and story formats and its human checkpoints are not described in the README; the linked docs were not read.
- The **ambiguity papers** were read at abstract or search-summary level, not in full; numbers are the abstracts' own. The Ask or Assume abstract was read on its arXiv page; search listings gave conflicting dates for it, the page shows three versions (v1 2026-03-27, v3 2026-09-07).
- No study found on a "plan summary and confirm" gate, or on the cost of babysitting a spec-less agent. The Slack statement about babysitting is not backed by a source here.
- Both LinkedIn pages were read behind a partial login wall; the first post's links to a comparison and a download were not resolved.
- All token figures in section 5 are estimates.

## Sources

AWS and AI-DLC
- https://aws.amazon.com/blogs/devops/ai-driven-development-life-cycle/
- https://awslabs.github.io/aidlc-workflows (and `/guide/03-spaces-and-intents/`, `/guide/04-phases-and-stages/`, `/guide/05-scopes-and-depth/`, `/guide/07-interaction-modes/`, `/reference/04-stages/inception/`)
- https://github.com/awslabs/aidlc-workflows

Papers
- https://arxiv.org/html/2603.17150v1 (Lahiri, intent formalization)
- https://arxiv.org/abs/2502.13069 (Ambig-SWE)
- https://arxiv.org/abs/2603.26233 (Ask or Assume)
- https://arxiv.org/abs/2505.13360 (What Prompts Don't Say)

Other methods and tools
- https://github.com/github/spec-kit and https://github.com/github/spec-kit/blob/main/spec-driven.md
- https://kiro.dev/docs/specs/
- https://github.com/bmad-code-org/BMAD-METHOD
- https://github.com/nikhilw/structured-agentic-workflow
- https://cursor.com/docs/agent/planning
- https://code.claude.com/docs/en/best-practices
- https://code.claude.com/docs/en/common-workflows

The user's links
- https://lnkd.in/p/dm5VqzVU resolves to a LinkedIn post on intent-audited development.
- https://lnkd.in/p/d8fbGyf3 resolves to a LinkedIn post that is a security checklist.
