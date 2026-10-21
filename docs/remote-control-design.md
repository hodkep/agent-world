# Remote control: working from a phone or the web without a platform of our own

Status: findings from a spike (2026-10-22) and a proposed design. Nothing is built.

## Why

Claude Code (`--remote-control`, `claude remote-control`) and agy (`--remote-control`, a remote-control daemon) can each let a person continue a session that runs on their own machine from claude.ai/code or a phone app. Agent World's gates (the plan gate, step approvals, the audit, the push hold, permission cards) are decided on cards in the desktop app, so a person who is away from the desk can talk to the agent but cannot answer what the office is waiting on.

Constraints: the app is local, with no server of its own, and the core must stay provider-agnostic (see [providers-design.md](providers-design.md): the core never names a provider). So the remote channel is each provider's; what the app owns is turning it on and making its own decisions answerable from more than one place.

## What we know

**From the docs** (code.claude.com, Remote Control): the session runs on the machine, makes outbound HTTPS only, opens no inbound ports; it needs a claude.ai login (Pro, Max, Team, Enterprise; not API keys, Bedrock, Vertex, a custom base URL; a Team or Enterprise owner has to enable it); an interactive session has one remote connection; the `claude` process must keep running. There is no documented API for a custom client: only claude.ai/code and the mobile apps.

**Observed in the spike** (Claude Code 2.1.306, the Work account on a Claude Team plan, `claude --remote-control` in a throwaway repo in a tmux session, log-only command hooks for every event, one hook that waits 20 seconds, answers given from claude.ai/code):

| Question | Observed |
| --- | --- |
| Does `UserPromptSubmit` fire for a prompt typed on the web? | Yes, with the prompt text, as for a typed one. |
| Do the other hooks fire in a remote-controlled session? | Yes: `SessionStart`, `PreToolUse`, `PermissionRequest`, `Notification`, `Stop`. |
| Does a blocking `PreToolUse` hook hold a tool call while the person is remote? | Yes. The call ran after the 20 seconds. |
| Does a permission prompt show on the web while a `PermissionRequest` hook is still running (20 s)? | Yes, at once: the prompt did not wait for the hook, and a `Notification` of type `permission_prompt` was sent while the hook was still running. The command ran after it was answered. |
| Is a command that needs no permission (`echo`, in manual mode) asked about? | No: no `PermissionRequest`. |
| `AskUserQuestion` | `PreToolUse`, `PermissionRequest` and a `permission_prompt` notice; answered from the web. |
| `ExitPlanMode` (plan mode) | `PreToolUse`, `PermissionRequest` and a notice "needs your approval for the plan"; approved from the web; later events carry `permission_mode: auto`. |
| How does the app find the link to open on a phone? | The terminal prints `/remote-control is active · … https://claude.ai/code/session_…`. |

Not tested: agy; HTTP hooks (the spike used command hooks); a hook that returns a decision while the person is remote; whether answering on the web stops a hook that is still running; what happens when the account is an API-key account (the docs say it does not work).

## Design

1. **A provider capability.** `capabilities.remote` says a provider can be remote-controlled. The launcher adds the provider's own switch (`--remote-control [name]` for Claude Code and agy) when an agent's Remote setting is on; the screen adapter reads the session link the program prints, and the agent's card shows "Open on phone". A provider without the capability does not show the setting (the usual null object). Accounts that cannot use it (API key, an organisation that has it off) get the provider's own message.
2. **One registry of pending decisions in the core.** Every gate that waits for the person (plan, step, audit findings seen, push hold, and what is asked through the office's permission and question cards) registers `{ id, kind, agent, code, resolve }`. Resolvers are the desktop card, as now, and the conversation (below). The first answer wins, and the other surface updates ("answered from the conversation").
3. **A conversation resolver, for gates that end the agent's turn.** Plan, step, audit and push-hold gates already end with the agent's turn ("the answer arrives as your next message"). The agent's instruction says to tell the person in the conversation what is waiting and the short code ("Plan waiting. Reply `approve 7k2` or `changes 7k2: …`"). The person's reply reaches the app through the prompt hook the app already has for the library reminder (`UserPromptSubmit` for Claude Code, `PreInvocation` for agy). The core matches a strict grammar and the code while a decision is pending for that agent, resolves it, and answers the hook with the usual follow-up text. A decision comes only from a human prompt: the agent cannot produce one, which is why an approval tool the agent calls is not used.
4. **Mid-turn prompts stay native.** Permission and question prompts block the agent's turn, so a reply typed into the conversation would queue behind them. The spike shows the provider's own prompt reaches the remote client at once and does not wait for the app's hook, so nothing special is needed: the person answers it there. The app's card, which shows the same request, must be taken down when the request is answered elsewhere (to confirm: whether the hook is told).
5. **Notifications.** The provider's phone app already notifies about the conversation and the permission prompt; the agent's message in step 3 is the notification for the app's own gates.

Rejected: serving the office UI over the LAN or a tunnel of our own (a web platform with its own authentication and exposure); an MCP tool the agent calls to approve (the agent could approve itself).

## Risks

- If a provider's remote prompts skip its prompt hook, step 3 fails for it; agy has to be checked in its own spike before it is promised.
- Reply-in-chat is weaker than a desktop card: the code guards against accidents, not against someone with the session open on their own account, who can answer the provider's prompts anyway.
- Remote control depends on the account: it will be off for some organisations and for API keys.
- Claude Code asks its trust question for a new folder in the terminal, which the app already handles; a remote client cannot answer it.

## Slices

1. Spike for agy (`agy --remote-control`): which hooks fire for a remote prompt.
2. The capability and the setting: launch flag, session link on the agent's card, per provider; no change to gates.
3. The registry of pending decisions behind the existing cards, with the desktop card as its only resolver (a refactor with the same behaviour).
4. The conversation resolver, with the instruction text for the gates and the code; unit tests for the grammar, an end-to-end spec with a fake program that sends a prompt as a remote client would.
5. Take down the app's permission and question cards when the provider's prompt was answered elsewhere.
