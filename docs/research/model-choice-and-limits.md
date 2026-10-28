# Choosing the cheapest good-enough model across Claude Code and agy

Researched 2026-10-29. Every "fetched" date below is that day; the page's own date is given where it has one. Nothing here is estimated: a gap is marked "none published".

## Short answer

- Claude Code offers Fable 5.1, Opus 5.5, Sonnet 5.5 and Haiku 5.5. agy offers Gemini 4 Argon, Gemini 3.8 / 3.7 / 3.6 Flash, Gemini 3.1 Pro, Claude Sonnet and Opus (5.5 now, 4.6 until 2026-11-02) and GPT-OSS 120B.
- No benchmark covers every model. The only one the vendors report for most of them is Terminal-Bench 4.0; FrontierCode 1.1 covers the Claude models only; DeepSWE v1.1 covers Gemini plus Fable and Opus. The score below normalises each to the best in the set and averages what exists.
- Cheapest per token that scores well: Haiku 5.5 (about $0.05 per blended MTok) for light work, Gemini 3.8 Flash ($0.36, promo until 2026-12-31) for medium work, Sonnet 5.5 ($0.88) for features and hard debugging. Fable 5.1 costs 5x Sonnet and scores lower on the published coding numbers.
- Limits: both programs have a 5-hour and a weekly window. Neither vendor publishes a number, or says how much less a smaller model counts. So headroom must be read from the account (`/usage` in each program), not computed.
- Missing: any primary benchmark for Haiku 5.5 on DeepSWE, Sonnet 5.5 on DeepSWE, any Gemini on FrontierCode, anything for Gemini 3.6 Flash and 3.1 Pro on the newer benchmarks, ids and context windows for most agy models.

## 1. What the app already knows (repo)

| Where | What it holds | Gap against today's vendor pages |
|---|---|---|
| `src/shared/prices.ts` `DEFAULT_RATES` | claudesonnet46 3/15, claudeopus46 5/25, gemini31pro 2/12; Gemini 3.6-3.8 Flash at 0.75/3.75 until 2027-01-01, then 1.5/7.5. Only `in` and `out`, no cached rate | No Claude 5.x model, no Fable, no Gemini 4 Argon; no cached-input rate |
| `src/main/providers/agy/launch.ts` `agyModels` | gemini-3.8/3.7/3.6-flash-{high,medium,low}, gemini-3.1-pro-{high,low}, claude-sonnet-4-6, claude-opus-4-6-thinking, gpt-oss-120b-medium. Levels are separate models; no efforts | No Argon, no Sonnet/Opus 5.5; the 4.6 Claude models and GPT-OSS are marked for removal 2026-11-02 |
| `src/shared/modelPick.ts` | value is `provider|model`; Claude default is a bare alias | none (reuse this for the pick) |
| `src/shared/efforts.ts` | `fitOptions` drops a model/effort the program does not list | none (reuse) |
| Claude launch | the alias or a model id passes through (`claude-haiku-5-5`, `claude-sonnet-5-5` appear in tests) | not verified in this pass |

## 2. Models, ids, context, price (USD per million tokens)

### Claude Code (Anthropic API ids; Claude Code accepts alias or full id)

| Model | id / Claude Code alias | Context | Input | Cached input (read) | Output | Retirement |
|---|---|---|---|---|---|---|
| Fable 5.1 | `claude-fable-5-1` / `fable` (never the default) | 1M | 10 | 0.25 | 50 | not before 2027-09-01 |
| Opus 5.5 | `claude-opus-5-5` / `opus` (default on Pro, Max, Team, Enterprise, API) | 1M | 4 | 0.20 | 20 | not before 2027-09-22 |
| Sonnet 5.5 | `claude-sonnet-5-5` / `sonnet` | 1M | 2 | 0.10 | 10 | not before 2027-09-28 |
| Haiku 5.5 | `claude-haiku-5-5` / `haiku` | 1M | 0.10 (0.50 if prompt >100k) | 0.01 (0.05 over 100k) | 0.50 (2.50 over 100k) | not before 2027-10-07 |

Cache writes (5 min / 1 h): Fable 12.50 / 20, Opus 5, 8, Sonnet 2.50 / 4, Haiku 0.125 / 0.20. Batch is 50% off.
Sources (fetched 2026-10-29): https://platform.claude.com/docs/en/about-claude/models/overview, https://platform.claude.com/docs/en/about-claude/pricing, https://code.claude.com/docs/en/model-config. Effort levels `low, medium, high, xhigh, max` on all four; defaults medium (Opus, Sonnet, Haiku) and high (Fable). On AWS, Bedrock and Google Cloud the `sonnet` and `haiku` aliases still resolve to older models (Sonnet 4.5/4.6, Haiku 4.5), so ids matter off the Anthropic API.

### agy (selector names from Google's page; ids only where the repo already has them)

| Model | agy id (repo) | Plans | Quota group | Context | Input | Cached input | Output |
|---|---|---|---|---|---|---|---|
| Gemini 4 Argon | not in repo; id none published | Pro (paid), Ultra, Enterprise | Gemini | 1M | 2.00, 4.00 from 2026-12-01 | 0.10, 0.20 from 2026-12-01 | 10, 20 from 2026-12-01 |
| Gemini 3.8 Flash (Low/Med/High) | `gemini-3.8-flash-{low,medium,high}` | Free, Plus, Pro, Ultra, Enterprise | Gemini | none published | 0.75, 1.50 from 2027-01-01 | 0.075, 0.15 | 3.75, 7.50 |
| Gemini 3.7 Flash | `gemini-3.7-flash-*` | Enterprise only | Gemini | none published | none published | none published | none published |
| Gemini 3.6 Flash | `gemini-3.6-flash-*` | Enterprise only | Gemini | none published | 0.75, 1.50 from 2027-01-01 | 0.075, 0.15 | 3.75, 7.50 |
| Gemini 3.1 Pro | `gemini-3.1-pro-{low,high}` | Enterprise only | Gemini | none published | 2.00 (4.00 over 200k) | 0.20 (0.40) | 12 (18) |
| Claude Sonnet 5.5 / Opus 5.5 (Thinking) | agy id none published | Pro (not trial), Ultra, Enterprise | Claude and GPT | 1M per Anthropic | as Anthropic list | as Anthropic list | as Anthropic list (agy bills quota, not these dollars) |
| Claude Sonnet 4.6 / Opus 4.6 (Thinking) | `claude-sonnet-4-6`, `claude-opus-4-6-thinking` | Free, Plus, Pro | Claude and GPT | n/a | removed 2026-11-02 | | |
| GPT-OSS 120B (Medium) | `gpt-oss-120b-medium` | Free, Plus, Pro, Ultra | Claude and GPT | none published | no first-party price | | removed 2026-11-02 |

Sources (fetched 2026-10-29): https://www.antigravity.google/docs/models (plans, groups, removal date), https://ai.google.dev/gemini-api/docs/pricing (prices; Argon promo ends 2026-11-30, Flash promo ends 2026-12-31; Argon cached is "implicit only"), https://ai.google.dev/gemini-api/docs/models (Argon 1M context; other Gemini rows list none). Gemini API prices are not what agy bills (agy charges plan quota), so they serve only as a relative cost.

## 3. Benchmarks (as published; settings differ, so scores are comparable only within one source)

Terminal-Bench 4.0 is the one benchmark with scores for both families; FrontierCode and DeepSWE each cover one side.

| Model | Terminal-Bench 4.0 | FrontierCode 1.1 Main | DeepSWE v1.1 |
|---|---|---|---|
| Sonnet 5.5 | 70.6 | 52.1 (Xhigh) | none published |
| Opus 5.5 | 66.4 (Xhigh; SE ±2.6) | 54.4 | 74.2 |
| Fable 5.1 | 55.8 (Anthropic) / 57.9 (Google) | 50.3 | 67.4 |
| Haiku 5.5 | 39.2 | 46.4 | none published |
| Gemini 4 Argon | 57.4 | none published | 77.9 |
| Gemini 3.8 Flash | 19.1 | none published | 73.7 |
| Gemini 3.7 Flash | 11.2 | none published | 65.3 |
| Gemini 3.6 Flash, Gemini 3.1 Pro | none published | none published | none published |

Sources and dates:
- Sonnet 5.5, Haiku 5.5 columns: https://www.anthropic.com/news/claude-sonnet-5-5 (2026-09-28); https://www.anthropic.com/news/claude-haiku-5-5 (2026-10-07).
- Opus 5.5 and Fable 5.1 Terminal-Bench and FrontierCode: https://www.anthropic.com/news/claude-opus-5-5 (2026-09-22).
- Argon, Fable and Opus DeepSWE, Argon Terminal-Bench: https://deepmind.google/models/model-cards/gemini-4-argon/ ("as of October 2026"; settings not listed).
- Gemini 3.8 and 3.7 Flash: https://deepmind.google/models/model-cards/gemini-3-8-flash/ (2026-09-02).
- Fetched 2026-10-29. The Terminal-Bench maintainers' own page (https://www.tbench.ai/leaderboard/terminal-bench/4.0) returned an empty table to my fetch, so no leaderboard figure is used; every number above is the vendor's own.

Conflicts to know about:
- Fable 5.1 Terminal-Bench 4.0 is 55.8 in Anthropic's post and 57.9 in Google's card. Anthropic's own run is used in the score.
- Gemini 3.8 Flash is 89.4 on Terminal-Bench 2.1 (same Google card) but 19.1 on 4.0. They are different versions; only 4.0 is used so it lines up with the Claude numbers.
- On Terminal-Bench 4.0 Sonnet 5.5 beats Opus 5.5 and Fable 5.1. Anthropic's Sonnet post reports it, and the Opus post reports Opus at 66.4; I found no vendor text explaining it.
- Same-name benchmarks used different effort and tool settings per vendor. Argon and Flash settings are unstated.
- No SWE-bench Verified/Pro, LiveCodeBench, Aider polyglot or tau-bench score appears in any of the current vendor posts or cards I read.

## 4. How the limits work

| | Claude Code | agy |
|---|---|---|
| Windows | A 5-hour session limit and a weekly limit on Pro and Max. Max also has a separate weekly limit for Fable | Ultra: quota refreshed every 5 hours plus a weekly cap. Pro: 5-hour quota until the weekly limit is reached. Other plans: weekly only, no 5-hour window |
| Pools | One 5-hour and one weekly pool for all non-Fable models, shared with claude.ai and Desktop. Fable has its own weekly pool on Max | Two groups, "Gemini Models" and "Claude and GPT models", each with its own "Five Hour Limit Remaining" and "Weekly Limit Remaining" |
| What counts | Conversation length and complexity, features used, model chosen, effort level; long conversations that auto-compact use more; tools and connectors are token-heavy | Work done, not prompts: simple tasks allow more prompts, complex tasks use more quota |
| Smaller model counts less? | Model is named as a factor; no ratio published | Not stated; a forum post (not vendor) says quota follows token cost |
| Numbers | None published. 5-hour limits for Pro, Max, Team doubled on 2026-05-06 | None published |
| Overage | Usage credits at API rates (Pro: one switch; Max: per limit) | AI credits (Pro, Ultra) at Gemini Enterprise pricing; forum report that agy ignores the "always use credits" setting (unverified) |
| Read it | Claude's status line limit data (the app's ledger already records `limit` events) | `/usage` (alias `/quota`) opens the Model Quotas panel per model; answered by the CLI, no model call. It does not say the window lengths |

Sources (fetched 2026-10-29): https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan (updated "yesterday" per the page), https://support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work, https://www.anthropic.com/news/higher-limits-spacex (2026-05-06), https://www.antigravity.google/docs/plans, https://www.antigravity.google/docs/models, https://antigravity.google/docs/cli/commands/usage. Forum claims: https://discuss.ai.google.dev/t/bug-agy-antigravity-cli-doesnt-follow-enable-ai-credit-overages-yes-on-setting/146447 (not a vendor statement).

## 5. Proposed scheme

### 5.1 Intelligence score (0 to 1)

For each benchmark b in {Terminal-Bench 4.0, FrontierCode 1.1, DeepSWE v1.1}, let best(b) be the highest published score among the models in section 3 (70.6, 54.4, 77.9). Then

`score(m) = mean over the benchmarks b where m has a score of ( m_b / best(b) )`

and record n, the number of benchmarks used. A model with n = 0 has no score and is never picked. n = 1 is not allowed to serve above "small edit".

| Model | Terminal-Bench | FrontierCode | DeepSWE | n | Score |
|---|---|---|---|---|---|
| Sonnet 5.5 | 1.000 | 0.958 | - | 2 | 0.979 |
| Opus 5.5 | 0.940 | 1.000 | 0.953 | 3 | 0.964 |
| Gemini 4 Argon | 0.813 | - | 1.000 | 2 | 0.906 |
| Fable 5.1 | 0.790 | 0.925 | 0.865 | 3 | 0.860 |
| Haiku 5.5 | 0.555 | 0.853 | - | 2 | 0.704 |
| Gemini 3.8 Flash | 0.271 | - | 0.946 | 2 | 0.608 |
| Gemini 3.7 Flash | 0.159 | - | 0.838 | 2 | 0.498 |
| Gemini 3.6 Flash, Gemini 3.1 Pro, GPT-OSS | none | none | none | 0 | none, excluded |

The two Flash scores swing with which benchmark was available (19.1 vs 73.7 for the same model), so they are the least trustworthy numbers here. Gemini High/Medium/Low variants have no separate scores; use the model's score for all three and prefer Low for the cheap tiers (assumption).

### 5.2 Cost index

`cost(m) = 0.80 * cached + 0.15 * input + 0.05 * output` (USD per million tokens, list price).
Assumption: an agent turn is mostly cache reads. The weights are mine, not measured; the app's own ledger (it already has input, output and cache token counts per run) should replace them.

| Model | Cost index now | After a scheduled change |
|---|---|---|
| Haiku 5.5 | 0.05 (0.24 over 100k prompt) | |
| Gemini 3.8 Flash | 0.36 | 0.72 from 2027-01-01 |
| Sonnet 5.5 | 0.88 | |
| Gemini 4 Argon | 0.88 | 1.76 from 2026-12-01 |
| Opus 5.5 | 1.76 | |
| Fable 5.1 | 4.20 | |

Gemini 3.7 Flash, 3.6 Flash, 3.1 Pro: not scored, so no index needed. Read prices from a table the user can edit (`prices.json` already supports that) so promo ends do not need a release.

### 5.3 Tiers (thresholds are assumptions, to be tuned against real runs)

| Tier | Example work | Minimum score | Minimum n |
|---|---|---|---|
| explore / read | grep, summarise, find files | 0.60 | 1 |
| small edit | rename, one-file fix, test tweak | 0.70 | 1 |
| feature | multi-file change with tests | 0.90 | 2 |
| hard debug | cross-module or flaky bug | 0.95 | 2 |
| review / plan | design, code review, plan | 0.95 | 3 |

Result with today's numbers: explore = Gemini 3.8 Flash or Haiku; small edit = Haiku; feature = Sonnet 5.5, Opus 5.5, Argon; hard debug = Sonnet 5.5, Opus 5.5; review/plan = Opus 5.5 only (the only 0.95+ model with n = 3). Fable 5.1 clears nothing above feature: the published coding numbers do not show it ahead, though Anthropic describes it as for the hardest long-horizon work. Offer it only as a manual override.

### 5.4 Choice rule

1. Candidates are models that: have a score with n at or above the tier's minimum; the account's plan lists (section 2 "Plans"); and are not retiring within 7 days.
2. Drop a candidate whose program's relevant pool has less than 10% left in either window (agy: its quota group; Claude: the session or weekly pool, or Fable's own weekly pool for Fable).
3. Take the lowest cost index, call it c0. Keep every candidate with cost at most 2 x c0.
4. Among those, pick the program with the larger headroom, where `headroom(program, pool) = min(5-hour remaining, weekly remaining)` as a fraction. Ties go to the lower cost, then to the higher score.
5. If nothing is left, fall back to the cheapest model whose program has headroom even above 2 x c0; if none, report "no model has headroom" instead of picking.

Assumptions in this rule, all to be tuned: the 10% floor, the 2x band, equal weight of 5-hour and weekly (min), that a task burns about the same quota on a cheaper model as its price ratio (not documented by either vendor), and that a cheaper model needs the same number of turns (unmeasured; a weaker model may take more, which this rule ignores).

## 6. Unknowns

- How much less quota a smaller model consumes in either program: no vendor figure. Claude lists model and effort as factors only; Google says usage follows work done.
- Absolute 5-hour and weekly sizes, and agy's window lengths for the two groups.
- Whether Claude's Opus and Sonnet share the same weekly pool beyond the Fable split: the Max article names only Fable as separate; a search summary mentioned per-family limits, which that article does not confirm.
- Benchmarks missing: Haiku 5.5 and Sonnet 5.5 DeepSWE; any Gemini on FrontierCode; Gemini 3.6 Flash, 3.1 Pro and GPT-OSS on any 4.0 benchmark; the Terminal-Bench maintainers' leaderboard rows (the fetched page was empty); all scores for SWE-bench, LiveCodeBench, Aider polyglot and tau-bench.
- Settings behind Argon and Flash numbers (effort, tools, attempts) are not on Google's card.
- agy ids for Argon and the 5.5 Claude models, context windows for the Flash models and 3.1 Pro: not published on the pages read. Run `agy models` on a signed-in account to get the ids.
- Gemini 3.7 Flash price: not on the current Gemini API pricing page.
- Tokens a task uses per model (a cheaper model may use more); the app's ledger can measure it per run.
- Repo staleness: `prices.ts` lacks every 5.x Claude model and Argon; `agyModels` lacks Argon and the 5.5 Claude models and still lists models removed 2026-11-02. Not changed here.
