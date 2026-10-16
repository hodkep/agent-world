# Workflows: what is tested, and where

Every scenario of the workflow feature, the program it is checked on, and the spec that checks it. Written for slice 13 (the walkthrough), kept as the list a change to workflows should be checked against.

How the specs run:

- **Unit** (`npx vitest run`): pure rules and services, with real git and real shell where the rule is about them.
- **E2E** (`npx electron-vite build`, then `env -u CLAUDE_CONFIG_DIR npx playwright test e2e/<spec>`): the built app, a fake Claude (`e2e/fake-claude.mjs`) and a fake agy (`e2e/fake-agy.mjs`), the real MCP server, real hook scripts and real git. The app that runs is the **built** one: rebuild after a change to `src/main`.
- **Walkthrough** (`WALK_SHOTS=<folder> npx playwright test e2e/workflows-walkthrough.e2e.ts e2e/workflows-journey.e2e.ts e2e/workflows-layout.e2e.ts`): the same, keeping a screenshot of each scenario.
- **Real** (`npx playwright test -c playwright.real.config.ts real/<spec>`): the real programs on the person's own accounts, in a throwaway project. Costs usage; never part of the normal run.
- **Pilot** (`PILOT=1 npx vitest run -c vitest.pilot.config.ts pilot/<file>`): a real model asked the app's own prompts many times, to measure how often it is right.

| Area | Scenario | Claude | agy | Where |
|---|---|---|---|---|
| Switch | Off until switched on; the Settings switch, its cost, the top-bar button | yes | n/a | `workflows-switch` |
| Switch | The Features step of first-run setup | yes | n/a | `workflows-switch` |
| Switch | Turned off with runs open: let them finish, stop them now, winding down | yes | n/a | `workflows-runs` |
| Switch | The choice and the default workflow survive a restart | yes | n/a | `workflows-layout` |
| Runs | The window's week in numbers, cost from the ledger, how a run began | yes | n/a | `workflows-views` |
| Runs | An agent's Workflow tab, round by round | yes | n/a | `workflows-views` |
| Runs | A commit with no announced task starts a run from the commit | yes | n/a | `workflows-auto` |
| Task | task_begin returns the workflow's brief; step_done; task_done | yes | yes | `workflows-steps`, `workflows-journey` |
| Task | A step the agent names again after a failed check is heard as the fix | yes | yes | `workflows-journey`, unit `service.test` |
| Plan | Plan gate end to end: submit, edits held, answer in the chat | yes | n/a | `workflows-plan` |
| Plan | A plan sent back; the hold lifted without approving | yes | n/a | `workflows-plan` |
| Plan | The dial: economy may skip the plan, balanced asks | yes | n/a | `workflows-plan` |
| Plan | An edit held by the program's own hook while the plan waits | yes | yes (plugin 0.1.2) | `workflows-plan` (claude), `workflows-providers` (agy) |
| Plan | A commit held, with or without `--no-verify`, for any program | yes | yes | `workflows-commit-gate`, `workflows-journey` |
| Plan | The repository's own hooks (plain and husky-style) still run | yes | yes | unit `commitGate.test`, `workflows-commit-gate` |
| Plan | An agent working in the project folder itself is held at the commit and the branch | n/a | n/a | `workflows-journey`, unit `commitGate.test` |
| Plan | Two agents of different programs are held and freed separately | yes | yes | `workflows-journey` |
| Intent | At max a model reads the request against the plan; its questions block approval | yes | yes | `workflows-intent` (claude), `workflows-journey` (agy) |
| Intent | A failed check never blocks the plan; below max none is asked | yes | n/a | `workflows-intent` |
| Audit | Finish shows the plan against what the audit found; findings must be seen | yes | yes | `workflows-merge`, `workflows-providers` |
| Audit | Model and cost shown: dollars for Claude, tokens for agy | yes | yes | `workflows-merge`, `workflows-providers` |
| Audit | An audit that fails says why and never holds Land | yes | yes | `workflows-merge`, `workflows-providers` |
| Audit | No model ready at all: the row says so | n/a | n/a | unit `mergeRows.test` |
| Merge | Land refused by the server until ready; Land anyway recorded | yes | n/a | `workflows-merge` |
| Merge | Economy: no plan needed, no audit; merge switch in Settings | yes | n/a | `workflows-merge` |
| Checks | Approve a project's commands, run, fail, send back, fix, pass, land | yes | yes | `workflows-checks` (claude), `workflows-journey` (both) |
| Checks | Out of tries: ask, skip, run again; decline holds landing by name | yes | n/a | `workflows-checks` |
| Checks | A changed file asks again, with the difference | yes | n/a | `workflows-checks` |
| Approve | A step the person approves waits in the chat and holds landing | yes | n/a | `workflows-steps` |
| List | Built-in, global and project workflows; broken files; copy, delete, default | yes | n/a | `workflows-defs` |
| List | Keyboard: tab to the list, arrows, Home and End, Enter | yes | n/a | `workflows-layout` |
| List | A narrow window | yes | n/a | `workflows-layout` |
| Skills | Ready, granted and gone skills in the list, the draft and the brief | yes | n/a | `workflows-skills` |
| Skills | The grant lets the agent read a skill during its task and ends with it | yes | n/a | `workflows-skills` |
| Builder | Describe, propose, nothing written until a button, saving approves commands | yes | yes | `workflows-builder`, `workflows-providers` |
| Builder | Edit a saved workflow: diff, new commands, replace, stale refused | yes | n/a | `workflows-builder` |
| Builder | Save for everything, save as a new one, discard, a bad file | yes | n/a | `workflows-walkthrough` |
| Builder | Close and reopen the window: the same builder; a second project's own | yes | n/a | `workflows-walkthrough` |
| Builder | The builder follows the default program; agy needs the message box connected | n/a | yes | `workflows-providers` |
| Builder | A real builder, from a sentence to a saved valid file | real (49 s) | not tried | `real/builder.real.ts` |
| Chat | The office's calls are a row for each area (workflow, todos, library, notes), each opening to a line per call and what it brought back; the calls that move a run leave the chat; a failed one is a red count on its row | yes | n/a | `workflows-chat`, `office-calls`, `todo-cards`, unit `officeCalls.test` |
| Track | Where the open run stands: a bubble while the plan waits, met, retried and failed stations, none once landed; above the chat and in the agent's tab | yes | n/a | `workflows-chat`, `workflows-runs-view`, unit `runTrack.test` |
| Runs | A bar for each run (the person waited on, the agent, checks, what failed), the week in sentences, a run that opens line by line | yes | n/a | `workflows-runs-view`, `workflows-views`, unit `insights.test` |
| Insights | A tile for every gate of every run, the numbers under each column, the red row and the amber column, 7 or 30 days | yes | n/a | `workflows-runs-view`, unit `insights.test` |
| Resilience | Restart with a plan waiting and a draft open | yes | n/a | `workflows-walkthrough` |
| Resilience | A half-written log line, broken drafts, approvals and workflow files | yes | n/a | `workflows-walkthrough`, unit `runs.test`, `store.test` |
| agy | An older plugin is noticed and updated on approval | n/a | yes | `workflows-providers`, unit `mail.test` |
| agy | Headless questions: no tool, one retry on a permission | n/a | real | unit `ask.test`, pilot `audit-agy`, `intent` |
| Real | A real agent through plan, hidden check (failed twice), audit and Land | real (1.5 min) | partial | `real/journey.real.ts`, `real/agy.real.ts` |
| Real | agy: connected through the app, the office's tools called through the bridge, the plan file written past the hold, a plain agy session still able to write after the plugin update | n/a | real | `real/agy.real.ts` |

Known gaps are listed in `docs/workflows-design.md` under D40 (what is only advice) and in the report for slice 13.

What real agy did not prove: the journey past the plan. With this person's global rules (a hard gate that asks for approval in chat) agy wrote its own plan and waited for a reply instead of handing one in through the office, and it also saw a second Agent World entry in agy's own list. A person would answer in the chat; an automated run cannot. The plan gate and the commit gate for agy are covered by the fake agy, the hook route and the pilots above.
