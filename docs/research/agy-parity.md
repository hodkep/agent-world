# agy and the office: why agy agents seemed not to follow workflows, playbooks, todos or the office tools

Tested on 2026-11-03 with a real agy 1.4.12 (signed in, Gemini 3.8 Flash) in a test instance with a throwaway repo and workflows on. About eight real requests were spent. Todo#2152.

## Finding

agy follows the office when its tools are reachable. In the person's setup they were not: agy keeps **one global list of tool servers** (`~/.gemini/config/mcp_config.json`), and its `agent-world` entry started a program that no longer exists (`dist/mac-arm64/Agent World.app`, an old local build that was deleted). agy shows an error every time it tries the office, and the agent sees none of the office's tools. That one entry explains "cannot follow workflows, playbooks, todos or the system tools" in a single cause.

## What was measured

| Probe | With the broken entry | With a working entry |
|---|---|---|
| "List the tools you can call from `agent-world`" | `NONE` | All 31: `list_agents`, `send_message`, `todo_*`, `library_*`, `recall`, `remember`, `task_begin`, `plan_submit`, `step_done`, `step_reopen`, `skip_steps`, `task_done`, … |
| A todo call | not possible | `todo_list` called through `call_mcp_tool`, returned "No open todos" |
| A playbook / notes call | not possible | `recall` called by itself at the start of a task, as the opening text asks |
| A work request that changes code | no task | `task_begin`, then `plan_submit`; the Plan gate card appeared in the chat and **Approve plan** released the edit; the file was written; `step_done` for Build and Review; the Pull request step waited for Run |

So workflows, todos and the office's tools work on agy, from `task_begin` to `step_done`.

## What the code notes in todo#2152 got wrong

- "There is NO per-turn reminder for agy": there is one. agy's hooks add a "Before acting: … call task_begin first" message on every user message, and "A task is open…" once a task is open (seen in agy's own transcript). The library line about `call_mcp_tool` comes once, on the first request.
- A tiny edit (a one-word file) did not start a task. That is what the reminder says to do ("skip both for … a tiny edit"), so it is correct, not a failure.

## Why the status looked fine

Settings > Message box did notice the entry ("agy still lists agent-world, which starts a program that is not installed") and offers **Remove agent-world** and **Connect**. Nothing told the person while agents ran: the warning shows only when Settings is open, and the agent itself just sees no tools.

## Done now (on this computer)

- Removed the broken `agent-world` entry and the leftover `agent-world-charlie-try`.
- Added `agent-world` pointing at the installed `/Applications/Agent World.app` and `~/.agent-world/bin/aw-mcp-bridge.cjs` (runs as plain Node; checked). The old entry was saved in the scratchpad first. The other servers in the list were not touched.

## Friction seen, not a cause

- agy in "Ask first" asks before **every** office tool call ("Wants to use agent-world/todo_list"). The chat shows it as an Allow card, but it slows a workflow (several prompts in one small task). agy offers "always allow in this conversation".
- Gemini 3.8 Flash at "high" took minutes on trivial steps (3 minutes of thinking for a one-line file); one shell command failed after 3 minutes.

## Proposed fixes (not built)

1. Warn where the agent is: when an agy agent starts and the `agent-world` entry is missing, left behind, or points to another build, say so in its panel with a one-click repair (Remove, then Connect), not only in Settings.
2. Repair on start: if the entry exists but its program is missing, offer to fix it when the app starts.
3. Let the office's own tools be allowed once per agent, so a workflow does not stop at each call (needs agy's permission settings; to check what the app may write).
4. Test: a fake-agy test of `task_begin`, a step report and a plan gate end to end, so a regression shows in CI.
5. Update todo#2152's notes with the corrections above.
