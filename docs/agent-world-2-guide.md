# Agent World 2: install and test guide

Agent World 2 is a separate copy of the app built from the `aw/charlie` branch. It works with **Claude Code** and **agy** (Antigravity CLI) side by side. It has its own name, its own app id and its own data folder, so it never reads or changes what your regular Agent World keeps, and it opens on the **first-run setup** like a brand-new install.

## 1. Install

1. Open `Agent World 2-0.0.1-arm64.dmg` (Apple silicon) and drag **Agent World 2** into **Applications**.
2. The app is not signed with an Apple Developer ID, so macOS blocks the first launch. Do either, once:
   - right-click the app in Applications, choose **Open**, then **Open** again; or
   - run `xattr -dr com.apple.quarantine "/Applications/Agent World 2.app"` and open it normally.
3. Before you start, have at least one of the agent tools installed and signed in:
   - **Claude Code**: run `claude` once in a terminal and sign in.
   - **agy**: run `agy` once and sign in. (Setup can also open a terminal for this.)

Everything this build saves lives in `~/.agent-world-2` and `~/Library/Application Support/Agent World 2`. Agents' git worktrees are under `~/.agent-world-2/worktrees`.

## 2. First launch: the setup screens

The setup opens by itself when there are no agents yet and it was never finished. Five steps, shown on the left. **Your agents** is required; the rest can be skipped and re-run later from **Settings → Set up again**.

| Step | What you see | What to try |
|---|---|---|
| Welcome | What the app is, three promises | Continue |
| Your agents (required) | One row per tool: Claude Code, agy, state (Ready / Needs sign-in / Not installed), version and path, and a "Default for new agents" choice | Make the other one default; press **Re-scan**; see the row for a tool that is missing (**How to install**) |
| Project folder | Recent projects as cards, plus **Open a folder…** | Pick a git project to see branches per agent; Skip is allowed |
| Defaults | Four levels: Ask first, Auto-edit, Plan first, Full auto, each showing the real mode name per tool; it is the mode the first agent starts in | Pick one (the mode chip of the first agent says the same); toggle "tell me when an agent finishes" (a desktop notice, only while you are in another app) and "commit unfinished work to each agent's own branch when I quit" (in the installed app, not in dev) |
| First agent | Name (optional), provider, optional starter crew | **Hire and finish** |

Cases worth testing the first time:

- **Both tools ready**: the Provider choice appears in the hire step and every hire form.
- **Only agy (no Claude)**: the app works with agy alone; Claude shows as Not installed.
- **Only Claude**: no Provider choice is shown anywhere, and nothing about agy appears except its row in setup.
- **Nothing installed**: Continue is disabled on step 2 until one tool is ready; **How to install** shows the command.
- **agy installed but signed out**: its row says **Needs sign-in** with **Open a terminal to sign in**. A real terminal opens inside the step with `agy` started; sign in there, then press **I have signed in: check again**. The app never sees what you type.

To see first-run again: quit the app and delete `~/.agent-world-2` (all of this build's data), or in the app use **Settings → Set up again**.

## 3. Everyday use

### Hiring and telling agents apart
- **+ Agent** opens the hire form. With two ready tools it has a **Provider** choice; the model list, the "how much may it do alone" choices and the other fields follow the chosen tool.
- agy has no price, Chrome option or role change, so **Budget**, **Let it use Chrome** and **Change role…** are not shown for it. Extra instructions still work: they are sent to agy as its first message.
- In the agent list each agent has a **colour square** for its tool (orange = Claude Code, cyan = agy); hover it for the name. It only appears when two tools are in play.

### Permissions, trust and modes
- A new folder makes agy ask "Do you trust this folder?": the app shows it as a **Trust folder** card. Claude Code's equivalent works the same way.
- When an agent asks to run something, a **card with Allow / Deny** appears in the chat (and a pill on the office). For agy this covers commands and tools from connected servers; the card shows exactly what is asked, including the tool's arguments. A command that tries to imitate agy's own menu gets no card (answer it in the Terminal tab).
- The mode button under the message box lists that tool's own levels. For agy: Ask first, Edit automatically, Plan (switched live with its Shift+Tab), and Skip permissions (relaunches the agent).

### Profile card, files and changes
- The profile card says which program the agent runs on, and shows only what that program offers: its own models, its own thinking levels, its own modes, and **Compact** only where there is one.
- In **Code → Files**, a markdown file has a **Preview** button beside Save: it shows the file as formatted text, and **Source** goes back.
- In **Code → Changes**, the box above the file list searches the changed files by path.

### Chat, model, context and usage ring
- **Thinking levels follow the program and its model.** agy has no thinking setting: its levels are different models ("Gemini 3.8 Flash (High)", "(Low)"…), so you pick one in the model list and no effort choice is shown for it. Claude Code has its effort levels, shown in the hire form, the model chip and the profile card. A role made for Claude, hired onto agy, keeps only what agy can take.
- The **model chip** shows the model (for agy it is read from agy's footer, e.g. "Gemini 3.8 Flash · high") and switches model and effort by relaunching the same conversation.
- The **ring** shows context used. For Claude it is Claude's own percentage. For agy it is a percentage for Gemini models (window 1M, measured from agy's own `/context`), and "about N tokens" always; other agy models show tokens only. It also shows tokens read and written instead of dollars (agy reports no price). Claude keeps its 5-hour and weekly rows; agy has no Compact button.
- **Rewind** (button on one of your messages) works for both: the conversation goes back, and the message returns to your message box. agy saves its file in batches, so the chat may update a few seconds late.
- **/btw** side questions work for both: the question and answer show in a card and the agent keeps working; **Dismiss** closes it.
- Type **/** in the message box for the tool's own commands and skills (agy shows its own, e.g. `/context`, `/fork`, `/btw`, plus skills from `.agents/skills` and `~/.gemini/skills`).

### Agents talking to each other (the message box)
- Claude agents already have it. For **agy** it is connected with one approved change, **required in first-run setup** (setup does not go on until it is connected; Settings can disconnect it later). Each build has its own entry in agy (`agent-world` for the regular app, `agent-world-2` here): **Settings → Message box → Let agy message other agents…**. The window shows the exact file it writes (`~/.agent-world-2/bin/aw-mcp-bridge.cjs`) and the exact command (`agy mcp add … agent-world`); nothing is written until you press **Connect**. **Disconnect** removes the entry again. (agy tidies its tool list when it writes it; the other entries stay.)
- Once connected, any agent can use the `send_message` tool to message any other, Claude to agy, agy to Claude, or the same kind. The same applies to `list_agents`, `remember` and `recall`. See every message in the **Traces** tab.
- An agy agent that is not connected still receives messages (typed into its terminal) but cannot send any. That is why it cannot be picked as a hand-off target until connected.

### Handing work to another agent
- **More actions → Hand off…** (agents that have a branch). Choose who: any other agent, or **Hire a new agent** of either tool. Choose what you want: **Review** (read-only), **Continue** (their branch starts from yours) or **Answer** (a question about the changes); add a note. The window shows the exact message first.
- Agents that cannot answer through the message box are greyed out with the reason.
- The receiver sees a **Hand-off from** card (kind, branch, how to read it; the full message is behind "What it was told"); you see a **Hand-off to** card in your own chat with its state (waiting its turn / delivered). It is the same message box underneath, so it also queues when the receiver is busy.

### Cloning, subagents, tools
- **Clone** (More actions) works for both. For agy the copy opens the source conversation and branches it with agy's `/fork`; it has its own conversation, its own worktree and the history so far.
- **Subagents**: Claude's subagents work as before. agy's subagents now appear as colleagues in the office while they work, in the "N subagents working" line above the message box, and with their role, calls and answer.
- **Tools tab**: lists what the tool has connected and adds/removes servers through the tool's own commands. For agy the list shows each server's name and state, and **hides** everything after the program name (that is where keys are passed) and shows an address as its site only.
- **Handbook** opens the tool's own notes file (`CLAUDE.md` for Claude, `AGENTS.md` for agy).

### Usage tab
- The tanks on the lawn, the header chips and the Usage button pool every program's limits: the tanks and chips show the tightest five-hour and weekly allowance across them ("% left"), and hovering the tanks lists each program's own. Claude's limits are read from `claude -p "/usage"` when no agent has reported them yet.
- Top bar **Usage** opens one summary across tools: the busiest limit (least left, any tool), dollars spent (where a price exists, with "+ N tokens" for agy), and how many tools are ready. Below, one row per tool; click one for its own view: Claude's daily costs and models; agy's two limit groups (Gemini; Claude and GPT) with five-hour and weekly bars and reset times, and its tokens for the last 7 days.
- The Usage button shows a count when any limit is under 15% left.

### Settings
- The model for new agents is one list grouped by program (each program's models under its name), and Permissions follow the program chosen; "Model by job" is grouped the same way.
- Notifications, keep awake, wrap-up on quit, house rules, per-job models, the **program location for each tool** (only needed if the app cannot find it), **Message box**, and **Set up again**.

## 4. Claude Code and agy side by side

| | Claude Code | agy |
|---|---|---|
| What an agent is doing | Hooks and its status line | Read from its screen and conversation file |
| Permission card | yes | yes |
| Live mode switch | yes | yes (not for Skip permissions) |
| Rewind, /btw, clone, subagents, tools | yes | yes |
| Compact | yes | no (agy compacts by itself) |
| Price / budget | dollars, budget warnings | tokens only, no price |
| Context | percentage | percentage for Gemini, tokens always |
| Role change, Chrome | yes | not offered |
| Message box | built in | one approved setup step |
| Limits | with each agent | in the Usage tab (asked from `agy /usage`) |

## 5. Quick test checklist

1. Install, open, clear Gatekeeper, walk all five setup steps; try Skip on steps 3 to 5 and **Set up again** afterwards.
2. Hire a Claude agent and an agy agent in the same project; confirm the colours and the Provider choice.
3. In agy: trust card, allow a command, change mode with the mode button, switch model.
4. `/btw what is 2+2?` on both; rewind a message on both.
5. Connect agy to the message box; ask the agy agent to `send_message` to the Claude agent; open **Traces**.
6. Hand off a branch from one agent to the other (Review, then Continue with **Hire a new agent**).
7. Clone each agent; ask the agy agent to start a subagent and watch the office.
8. Open **Usage**, drill into each tool; open **Tools** on the agy agent and check no keys show.

## 6. Limits to know

- agy's token meanings are matched against what agy itself prints; the "read" count is a best fit.
- agy saves its conversation in batches: a rewind or a clone's copied history can show a few seconds late.
- The context percentage is shown only for models whose window was measured (Gemini 1M); others show tokens.
- The app is ad-hoc signed; macOS asks once.

## 7. Uninstall

Delete `/Applications/Agent World 2.app`, then `~/.agent-world-2` and `~/Library/Application Support/Agent World 2`. If you connected agy to the message box, run `agy mcp remove agent-world` (or press **Disconnect** first). Folders you trusted in agy stay trusted in agy's own settings.
