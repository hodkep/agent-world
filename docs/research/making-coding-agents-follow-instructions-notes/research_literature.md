# Published research: instruction-following decay in long contexts, and tool/skill invocation reliability

Notes compiled 2026-10-07. Source status labelled: [peer-reviewed] / [preprint] / [lab or vendor blog]. Many details come from search snippets and fetch summaries of abstract pages, not full-text reads; this is flagged where it matters. Some 2026 arXiv items (IDs 26xx) were seen only via abstract/summary pages and are unverified beyond that.

## (a) Instruction-following degradation with context length, turns, instruction count

### Takeaway
Every study finds adherence erodes with context length, turn count and instruction density, and the erosion is mostly unreliability (variance, early wrong commitments) rather than lost capability. Frontier models in late 2025 still score only ~65% on MultiChallenge, and degrade at 500 simultaneous instructions to at best 68%.

### Cited Findings
- Lost in the Middle (Liu et al.): accuracy is U-shaped over position; best when relevant info is at start or end of context, "significantly degrades" in the middle (multi-document QA, key-value retrieval). Accepted TACL 2023 [peer-reviewed]. Models are 2023-era; exact numbers not retrieved here. — [arXiv 2307.03172](https://arxiv.org/abs/2307.03172)
- Chroma "Context Rot" (14 Jul 2025) [lab blog/technical report]: 18 models (Claude Opus 4/Sonnet 4/3.7/3.5, Haiku 3.5; o3, GPT-4.1 family, GPT-4o, GPT-4 Turbo, GPT-3.5 Turbo; Gemini 2.5 Pro/Flash, 2.0 Flash; Qwen3 235B/32B/8B). Performance "grows increasingly unreliable as input length grows" even on simple tasks. Lower needle-question similarity gives steeper degradation; 1 distractor hurts, 4 compound it. Counterintuitively, all 18 models did worse when the haystack kept a coherent flow than when shuffled. Claude models abstained conservatively (lowest hallucination); GPT models hallucinated confidently under distractors. — [Chroma](https://www.trychroma.com/research/context-rot)
- Chroma secondary coverage claims degradation noticeable well before the window is full (e.g. 200K window degrading at ~50K); this is a blog paraphrase, not a number from the report itself. — [Allstacks](https://www.allstacks.com/blog/context-rot-why-ai-agents-get-worse-the-longer-they-run)
- Anthropic restates context rot as an architectural constraint (n^2 pairwise attention); gives no quantitative data. — [Anthropic engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- "LLMs Get Lost in Multi-Turn Conversation" (Laban et al., Microsoft/Salesforce; 2025): 15 LLMs, 200,000+ simulated conversations, instructions "sharded" across turns. Average 39% drop vs single-turn fully specified; ~90% to ~65% for strong models. Aptitude (A90) fell only ~16%, unreliability (P90 minus P10 gap) rose 112%. Models tested include GPT-4.1, o3, Claude 3.7 Sonnet, Gemini 2.5 Pro/Flash, Llama, DeepSeek-R1: reasoning/frontier models were not immune. Temperature 0 helped single-turn reliability 50-80% but multi-turn only ~15-20%, leaving ~30% unreliability. Cause: models commit to assumptions early and over-rely on their own earlier answers; once wrong, they do not recover. ICLR 2026 oral per the ICLR page [peer-reviewed; preprint 2505.06120]. — [arXiv HTML](https://arxiv.org/html/2505.06120v1); [ICLR 2026](https://iclr.cc/virtual/2026/oral/10009147)
- Same paper, mitigations: "Recap" (final turn restating all requirements) lifted performance from ~50% to ~67%; "Snowball" (repeat prior info each turn) ~62%; both still below the ~90% single-turn baseline. These were tested as agent-style interventions. — [arXiv HTML](https://arxiv.org/html/2505.06120v1)
- Multi-IF (Meta, Oct 2024; IFEval extended to 3 turns, 8 languages, 4,501 conversations, 14 LLMs): accuracy falls each turn, e.g. o1-preview 0.877 at turn 1 to 0.707 at turn 3. Non-Latin scripts (Hindi, Russian, Chinese) have higher error. [preprint] — [arXiv 2410.15553](https://arxiv.org/abs/2410.15553v1)
- MultiChallenge (Scale AI, Jan 2025): up to 10-turn conversations; four categories (instruction retention, inference memory, reliable versioned editing, self-coherence). At release all frontier models <50% (Claude 3.5 Sonnet best at 41.4%). Instruction retention (follow first-turn instructions to the end) is explicitly limited. [preprint] — [arXiv 2501.17399](https://arxiv.org/pdf/2501.17399)
- MultiChallenge leaderboard update (late 2025, judge upgraded to Gemini 2.5 Pro): Gemini 3 Pro 65.67, GPT-5.1 Thinking 63.41, GPT-5 Thinking 63.19; DeepSeek v3.1 46.10, Qwen 235B 41.22. Best category score: inference memory 81.96%; reliable versioned editing tops at only 57.50%. Gemini nearly doubled across generations, Claude modest gains, GPT plateauing; authors ask whether ~65 is a soft ceiling. [lab blog] — [Scale Labs](https://labs.scale.com/blog/multichallenge-update)
- IFScale (Distyl AI, Jul 2025; NeurIPS 2025 venue page): 500 keyword-inclusion instructions in a report-writing task, 20 models/7 providers. Best frontier model reaches only 68% at 500 instructions. Three decay shapes: threshold decay (reasoning models o3, Gemini 2.5 Pro: near-perfect then drop), linear (GPT-4.1, Claude Sonnet 4), exponential (GPT-4o, Llama 4 Scout). Primacy bias: earlier instructions are followed better than later ones. Note: the task is keyword inclusion, a narrow proxy for real agent rules. — [arXiv 2507.11538](https://arxiv.org/abs/2507.11538); [NeurIPS 2025 page](https://neurips.cc/virtual/2025/122417)
- System prompt drift (Li et al., Harvard/Northeastern, 2024): self-chat benchmark shows significant instruction drift within 8 conversation rounds for LLaMA2-chat-70B and GPT-3.5; attributed to attention decay to the system prompt; proposed split-softmax as fix (requires model internals, so not usable with API models). Old model generation. [preprint, arXiv 2402.10962] — [arXiv](https://arxiv.org/pdf/2402.10962)
- Instruction hierarchy (system over user): a 2026 controlled benchmark across eight models found no uniform hierarchy; behaviour splits into hierarchy, anti-hierarchy and no-channel-effect regimes, and system-channel effect strengthens with scale within the Gemma-4 family. Other work reports models obey social cues (authority, consensus) over the hierarchy, and judge models prefer user-following responses that violate system prompts. Reasoning-based fine-tuning gave ~20% gain on IHEval conflict setup. Seen via search snippets only; treat as unverified. — [arXiv 2608.28648](https://arxiv.org/pdf/2608.28648); [Reasoning Up the Instruction Ladder](https://arxiv.org/html/2511.04694v3); [IH-Benchmark](https://arxiv.org/pdf/2607.25987)

### Inferences
- Rules in a system prompt/CLAUDE.md are not guaranteed to hold turn 30; evidence supports the failure mode being variance (sometimes follows, sometimes not), so a rule that works in demos can fail in a fraction of long sessions.
- Number of rules matters: even for the best models, adherence to many parallel rules decays and later-listed rules suffer (primacy). A short, prioritized rule set is better supported than a long one.
- Coherent, relevant-looking context can be worse than noise (Chroma haystack finding); long agent transcripts full of plausible tool output are a distractor-rich setting.

### Gaps
- No clean published measurement specific to system-prompt adherence versus turn count for 2025-2026 frontier models (Claude 4.x/GPT-5/Gemini 3); the drift paper is 2024 and old models.
- Could not verify per-model numbers for Lost in the Middle or full IFScale tables from full text.
- Chroma's report measures retrieval/replication, not rule compliance; extrapolation to rules is an inference.

## (b) Placement and form: reminders, recency, repetition, structure

### Takeaway
Recency and repetition measurably help: restating requirements at the end gave +17 points in the multi-turn study, and periodic re-prompting gave ~+16 points on long-document QA. Evidence for emphasis wording and formatting is thinner and mostly vendor-anecdotal.

### Cited Findings
- Lost in the Middle: best performance at start and end of context, worst in middle. [peer-reviewed] — [arXiv 2307.03172](https://arxiv.org/abs/2307.03172)
- IFScale: primacy effect, earlier instructions followed better in dense lists. — [arXiv 2507.11538](https://arxiv.org/abs/2507.11538)
- Recap turn: ~50% to ~67% in multi-turn sharded tasks; Snowball ~62%. — [arXiv 2505.06120](https://arxiv.org/html/2505.06120v1)
- R&R (reprompting + in-context retrieval; EMNLP 2024 Findings): repeating the instructions periodically through a long document, tested with GPT-4 Turbo and Claude-2.1 up to 80k tokens, gave ~16-point average QA accuracy gain. Task is document QA, not rule compliance. [peer-reviewed] — [ACL Anthology](https://preview.aclanthology.org/watermark/2024.findings-emnlp.742); [arXiv 2403.05004](https://arxiv.org/html/2403.05004v1)
- Manus (practitioner blog, 2025): agent maintains and rewrites todo.md each step so the objective sits at the end of context ("recitation"). Described as design rationale; no ablation numbers found. [vendor blog] — [Manus summary](https://agentic-ai.readthedocs.io/en/latest/ContextEngineering/manus/)
- Prompt wording sensitivity: in Vercel's agent evals, "You MUST invoke the skill" vs "Explore project first, then invoke skill" produced different behaviour (one missed required config changes). [vendor blog] — [Vercel](https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals)
- Temperature/formatting: temperature 0 did not fix multi-turn unreliability. — [arXiv 2505.06120](https://arxiv.org/html/2505.06120v1)

### Inferences
- A hook or harness that re-injects the key rules near the end of context each turn (or at checkpoints) is supported by recap/R&R effect sizes (+16 to +17 points) but those are on QA/generation tasks, not coding-agent rule compliance.
- Repetition of the entire prompt is cheap in cached systems, but no study found on cost/benefit for agent loops.

### Gaps
- No controlled study found on system prompt vs user-turn placement of rules for agent adherence in 2025-2026 models.
- No rigorous data found on emphasis (CAPS, "IMPORTANT") or XML/markdown/structured format effects on long-run adherence; only anecdotal vendor guidance.
- Sources on prompt repetition (e.g. "repeat your prompt" articles, PARTREP) were seen only as search snippets; not included as findings.

## (c) Tool selection and invocation reliability

### Takeaway
Models frequently skip tools and skills they should use, and tool exposure design (count, naming, descriptions, examples, on-demand discovery) shifts accuracy by double-digit points. Passive "available if needed" mechanisms get skipped; always-in-context guidance and explicit instructions raise call rates substantially.

### Cited Findings
- Skill-Use benchmark (2026 preprint): 79 real skills, 177 executable Docker tasks, nine domains; measures Trigger, Compliance, Boundary. Eight LLMs under two agent harnesses; strongest configuration SU only 0.613. Skill use is "conditioned on the harness rather than a fixed property of the model"; trigger and compliance are independent failure points. Search summary says only Codex/GPT-5.5 showed consistently high activation while other configurations triggered sporadically or not at all; could not read full PDF to verify. [preprint, unverified details] — [arXiv 2608.04828](https://arxiv.org/abs/2608.04828)
- Vercel agent evals on Next.js tasks (2026 blog): skill was never invoked in 56% of cases by default; pass rate baseline 53%, skills default 53%, skills with explicit instructions 79%, AGENTS.md docs index in always-loaded context 100% (compressed 40KB to 8KB, ~80% smaller, same pass rate). Single benchmark, vendor-run, small task set. [vendor blog] — [Vercel](https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals)
- ToolFailBench (ICML 2026 venue listing; arXiv 2607.04686): 19 models, 1,000 tasks, five domains; failure modes Tool-Skip, Result-Ignore, Output-Fabrication, Unnecessary-Tool-Use. Best clean tool-use rate 86.33%. Llama-3.1 shows "Always-Call" pattern; Llama-3.1-70B vs Qwen2.5-72B differ by 89 points on control-task accuracy. Tested models skew open-weight/older. — [ICML 2026](https://icml.cc/virtual/2026/67924); [arXiv 2607.04686](https://arxiv.org/abs/2607.04686)
- Skill Following (Findings of EMNLP 2026; arXiv 2609.00549): 17 LLMs; matched skill-enabled vs disabled runs conditional on the agent actually retrieving a skill (RAE metric); some models show positive aggregate retrieval lift but negative RAE (e.g. MBPP+): retrieving a skill is not equal to benefiting, and retrieval is selection-biased. [peer-reviewed] — [arXiv](https://arxiv.org/abs/2609.00549)
- Anthropic tool search tool (Nov 2025 engineering blog): accuracy with large tool libraries Opus 4 49% to 74%, Opus 4.5 79.5% to 88.1%; ~85% token reduction in tool definitions. Tool-use examples in definitions: 72% to 90% on complex parameter handling. Programmatic tool calling: tokens 43,588 to 27,297 (-37%). Guidance: clear names and comprehensive descriptions. Vendor-run, own benchmarks. [vendor blog] — [Anthropic](https://www.anthropic.com/engineering/advanced-tool-use)
- RAG-MCP (2025 preprint): retrieving relevant tools instead of exposing all cut prompt tokens >50% and raised tool selection accuracy 43.13% vs 13.62% baseline in a large tool pool; retrieval precision degrades toward thousands of tools. — [arXiv 2505.03275](https://arxiv.org/html/2505.03275v1); [review](https://www.themoonlight.io/en/review/rag-mcp-mitigating-prompt-bloat-in-llm-tool-selection-via-retrieval-augmented-generation)
- BFCL v3 (Berkeley): multi-turn categories include Missing Functions (200 tasks), Long-Context multi-turn (200 tasks) where large amounts of extraneous data are injected. Found no extracted accuracy-drop numbers. — [Gorilla BFCL v3 multi-turn](https://gorilla.cs.berkeley.edu/blogs/13_bfcl_v3_multi_turn.html)

### Inferences
- Call rate depends heavily on harness presentation: description-only skills loaded via progressive disclosure get skipped; content in always-loaded context is not skipped (Vercel). Combined with Skill-Use "harness-conditioned" finding, routing logic (hooks, classifiers, forced calls) in the harness likely beats relying on model judgement.
- Tool_choice forcing is a known API mechanism, but no study found in this pass quantifying its effect on call rate vs quality.

### Gaps
- No peer-reviewed study found quantifying tool_choice forcing, router/classifier gating, or description-rewriting effects on under-calling across frontier models; Anthropic's numbers are the nearest.
- Agentic RAG under-retrieval literature (e.g. Search-R1 style under-search) was not searched in this pass.
- Skill-Use per-model trigger rates not verified (PDF unreadable via fetch).

## Preloading vs fetching on demand (cost/quality)

### Takeaway
Evidence is thin and mostly practitioner-level: Anthropic advocates a hybrid (small always-loaded file plus just-in-time exploration); Vercel's data favours always-loaded index over on-demand skills for reliability; tool-search results show on-demand discovery cuts tokens ~85% with accuracy gains when libraries are large.

### Cited Findings
- Anthropic: hybrid is optimal; Claude Code loads CLAUDE.md upfront and uses grep/glob just-in-time; no quantitative data given. [lab blog] — [Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- Vercel: passive on-demand skills 53% pass (no gain), always-loaded index 100%, index compressible 80%. — [Vercel](https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals)
- Tool search: tokens -85%, accuracy up for large tool sets. — [Anthropic](https://www.anthropic.com/engineering/advanced-tool-use)
- Context rot evidence implies more preloaded context raises distraction cost. — [Chroma](https://www.trychroma.com/research/context-rot)

### Inferences
- Tradeoff: preloading buys call reliability but pays context-rot and token cost; fetching saves tokens but depends on the model deciding to fetch (the under-calling failure). A compact always-loaded index pointing to on-demand detail is the pattern both data sets support.

### Gaps
- No head-to-head academic study of preload vs on-demand across model generations for coding agents; Vercel result is single vendor, single framework.

## (d) Self-discipline in long-horizon coding tasks

### Takeaway
Direct controlled evidence is sparse. Supporting evidence: errors compound and are not self-corrected in multi-turn (Lost in Multi-Turn); externalized todo/notes and recitation are standard practice but lack published ablations in what I found.

### Cited Findings
- Models that take a wrong turn "do not recover" and over-rely on earlier answers. — [arXiv 2505.06120](https://arxiv.org/html/2505.06120v1)
- MultiChallenge: reliable versioned editing is the weakest category (best 57.50%): iterative edit tasks fail >4 in 10 times for the top model. — [Scale Labs](https://labs.scale.com/blog/multichallenge-update)
- Manus todo.md recitation; Anthropic compaction, structured note-taking (NOTES.md), sub-agents returning 1,000-2,000 token summaries; Anthropic reports no metrics. [vendor blogs] — [Manus](https://agentic-ai.readthedocs.io/en/latest/ContextEngineering/manus/); [Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- ToolFailBench: Result-Ignore and Output-Fabrication failure modes show models skip verification/ignore tool results; best clean rate 86.33%. — [arXiv 2607.04686](https://arxiv.org/abs/2607.04686)

### Inferences
- Verification loops should be harness-enforced (hooks, required test commands) rather than model-optional, given Skill-Use "compliance and trigger are independent failure points" and ToolFailBench skip rates.

### Gaps
- Not searched: Reflexion, Self-Refine critiques (self-correction without external feedback), SWE-bench long-horizon agent studies, METR time-horizon work, empirical studies on plan re-injection in coding agents. No ablation of checklist/todo re-injection found. Report writer should treat (d) as largely unevidenced here.
