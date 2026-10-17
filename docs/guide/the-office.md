# The office

The office shows every agent of the open project as a character. Where it stands and what floats over its head say what it is doing, and you act on it from the world, from the list or from the keyboard.

## What the office shows

Each project is an office. The name of the open folder is in the project button at the left of the top bar, and a sign on the lawn behind the building reads "now working in" and the folder's name.

Each agent is a character with a name tag under its feet. The tag shows the first 8 characters of its name. It turns pale gold while the agent is selected. When the agent has started subagents, the tag adds a count, for example `x2`. A small badge on the tag shows a permission mode other than **Ask first** (see [Permission modes](chat-and-dialogs.md#permission-modes)). A thin bar under the tag shows how full the agent's context window is: green, yellow above 60%, red above 80%.

![The office with agents in each activity: one idle on a sofa, others thinking, running a command, researching, implementing and delegating, one with a red bubble and an ALLOW? tag in the list, and one asleep that is only in the list](../images/office-activities.png)

In the picture the agent list is open. In the app the list folds into a one-line bar while an agent is selected: see [Select an agent](#select-an-agent).

Other things that move:

- A sheet is added to the pile on an agent's desk for each file it writes or edits.
- An agent in the **Plan** permission mode works at the whiteboard instead of its desk.
- An agent that reads something from the library walks to the bookshelf and shows a pill, "read" and the item's name.
- The kanban board on the wall shows each agent's own task list as sticky notes in that agent's colour: to do, doing, done.
- When one agent messages another, an envelope flies from one to the other.
- A sign on the lawn, "lines today", lists up to four agents that have changed the most lines.

## Read an agent's activity

The list, the agent's profile card and the office all use the same activity words. For Claude Code agents they come from what the agent is doing right now.

| Activity | What it means | What you see |
| --- | --- | --- |
| **idle** | It finished its turn and waits for your next message. | It rests on a sofa in the lounge. No bubble. |
| **waiting** | It finished and is waiting for you (Claude's idle report). | In the lounge, with a "?" bubble. |
| **thinking** | Working out its next step. Any tool with no category of its own, such as an MCP tool, also shows as thinking. | At its desk, with a thought effect above its head. |
| **researching** | Reading or searching: files, patterns, the web. | At its desk, typing slowly, with a magnifier bubble. |
| **implementing** | Writing or editing files. | At its desk, typing fast, with a page being written above the desk and the file's name. |
| **running** | Running a shell command. | At its desk, with a cyan projection above it showing the command. |
| **delegating** | Handing work to a subagent. | At its desk, with an org-chart bubble. |
| **permission** | It needs you to approve or answer something. | A red bubble with a blinking "!", a waving arm, and a monitor that flashes red and amber. |
| **compacting** | Summarising the conversation to free up context. | At its desk, with a bubble. |
| **blocked** | Its turn ended in an error. | In the lounge, with a bubble. |
| **asleep** | Its program is not running. | Not in the office at all. Only its row in the list says **asleep**. |

The profile card says the same in longer words: Thinking, Reading and searching, Editing files, Running a command, Handing work to subagents, Compacting, Idle, Waiting for you, Needs your answer, Blocked, Asleep.

Each monitor on a desk follows the agent that sits at it: dark when empty or asleep, a blinking cursor for thinking, scrolling coloured code for implementing, fast green lines for running, pale lines for researching.

## Roles

The role is not assigned. It follows from what the agent is doing, and the list shows it next to the name.

| Role | Who | How it looks |
| --- | --- | --- |
| **senior** | A regular agent working at its own desk. | A hoodie. |
| **boss** | A senior that has handed work to subagents. | A gold crown and a suit, while its subagents are working. |
| **intern** | A subagent, started by another agent. | A cap. |

A new subagent arrives by car, and the agent that called for help shouts "HELP!". With reduced motion turned on in your system, it just walks in at the door. Interns sit beside their boss's desk, up to six of them, and use the meeting table when those are taken. An intern beside its boss has no name tag of its own: the boss's tag carries the count.

Interns are not rows in the list. To see them, click **Subagents** in the top bar. It lists every agent's subagents together, with **Working**, **Done** and **Stopped** counts and an **Open** button for each agent that has subagents (it reads **Open ada** for an agent named ada).

## Select an agent

To select an agent, click its character or its row in the list. A selected character has a pulsing gold bracket at its feet, and an idle one also has a bobbing chevron above its head.

- Clicking the character also opens its profile card over the office: its status in words, how much context it has used, what it has spent and how many lines it changed, its model, thinking level and permission mode, and some counts. You can change the model, thinking level and mode there; the model and thinking level only between turns. Close the card with its **×**, with Esc, or by clicking outside it. To bring it back, click the agent's name in the panel bar (double-click the name to rename the agent).
- Clicking the row selects the agent without opening the card.
- The panel on the right then shows the agent's tabs: **Chat**, **Terminal**, **Code**, **Tools**, **Traces**, **Preview**, and **Library** and **Workflow** when they have something for it. See [Chat and dialogs](chat-and-dialogs.md) and [Code and preview](code-and-preview.md).
- Selecting an agent puts the keyboard in its message box. The panel opens on the way you last talked to an agent, **Chat** or **Terminal**, and remembers it.
- In a window narrower than 1100 pixels the panel is a drawer over the office. It opens when you select an agent, and **Hide panel** closes it.

The list shows a row for each agent of the open project: a coloured dot, its name, a red tag when it waits for you, its role, its activity and what it has cost. With an agent selected, the list folds into a bar: **Previous agent** and **Next agent** arrows, a button with the number of agents that opens the whole list, the agent's name, its activity, its permission mode when it is not **Ask first**, its cost, and an **others waiting** tag when another agent needs you.

The panel is resizable: drag its left edge, or focus the edge and press the Left and Right arrow keys. Double-click it to reset the width. **Expand** gives the panel more room.

Two shortcuts in the office itself:

- Drop files on a character to mention them to that agent.
- Click the closed book on a desk to open that agent's changes in its **Code** tab.

## Hire an agent

To hire an agent, click **+ Agent** in the top bar. It is disabled until a project folder is open. Fill in the form and click **Hire**: the form is described in [Getting started](getting-started.md#hire-another-agent). The new character walks in through the front door, rests on a sofa, and is selected.

With no agents in the project, the panel shows a welcome with **+ Agent**, a button to hire a starter crew (Explorer, Test writer, Reviewer), and a link to bring back an earlier conversation.

To bring back an earlier conversation as a new agent, click **History** in the top bar. **Past conversations** lists the conversations of the open folder by day, with a search box. Click one to continue it as a new agent. One that an agent here already runs is disabled.

## Wake an agent that is asleep

An agent is asleep when its program is not running, for example after the app restarts. It has no character in the office, but its row stays in the list.

1. Click its row in the list.
2. In its **Chat** tab, click the button that reads **Wake** and the agent's name, for example **Wake ada**. The bar next to it says "ada is asleep."
3. The agent comes back with its saved session and walks in through the door.

On the **Grid**, an asleep agent's tile says "asleep: open to wake".

## Answer a permission request from the world

When an agent needs your approval it turns to **permission**: a red blinking "!" over its head, and a red tag in its row that says what it wants (see the table below).

1. Click the red tag, the agent's row or its character.
2. The request is in the agent's **Chat** tab, over the message box: "Wants to use" a tool, with what it will do under it.
3. Click **Allow** or **Deny**.

![A request to use Bash with the command rm -rf dist, answered with Allow or Deny in the side panel, and the agent's red tag in the list](../images/permission.png)

The tag in the list names the kind of request:

| Tag | What it is |
| --- | --- |
| **ALLOW?** | A tool wants to run. |
| **PLAN** | A plan is ready for you to review. |
| **QUESTION** | The agent asks you something. |
| **TRUST?** | Claude Code asks whether to trust the folder. |
| **ASKS YOU** | One of the agent program's own menus. |

How to answer each one, including **Answer in terminal**, is in [Dialogs](chat-and-dialogs.md#dialogs).

- If you last chose the **Terminal** tab to talk to agents, selecting an agent that waits opens a pop-up box with the same question instead.
- A request from a subagent is shown on the card of the agent above it, and that agent shows as waiting.
- While another agent waits, the bar shows **others waiting**. Click it to open the list.
- With notifications on in Settings and the app in the background, a desktop notification says what the agent wants. Clicking it brings the window forward and selects that agent. See [Settings and updates](settings-and-updates.md).
- For a Claude Code agent, a request that nobody answers for 5 minutes falls back to Claude's own dialog in the agent's terminal.

## The top bar

Except for **+ Agent**, the buttons are icons. Point at one, or Tab to it, to see its name and a hint.

| Button | What it does |
| --- | --- |
| Project button (the folder's name and a **git** or **no git** tag) | Opens **Projects**: your recent folders, **Open another folder…** and **New window**. |
| **+ Agent** | Opens the hire form. |
| **History** | Brings back an earlier conversation from this folder. |
| **Subagents** | Every agent's subagents together. A number shows how many are alive. |
| **Grid** | Shows every agent at once. **Overview** is a tile for each agent with its state, cost and the last lines of its terminal. **Conversations** lays chats and terminals side by side; drag agents in from the list. |
| **Todos** | The tasks of this project, yours and the agents'. A number shows how many need you. See [Todos](todos.md). |
| **Workflows** | Runs and stats of the agents' workflows. Shown when Workflows is on. See [Workflows](workflows.md). |
| **Library** | Skills, instructions and the playbook. See [Library and playbook](library-and-playbook.md). |
| **Usage** | **Usage & Estimated Costs**: the limits and what the agents have cost. A number shows how many limits are nearly used up. |
| **Weekly Rewind** | Your week of agent work. |
| **Shortcuts** | The list of keyboard shortcuts. |
| **Settings** | Notifications, defaults for new agents, where each program is. See [Settings and updates](settings-and-updates.md). |
| **Hide panel** / **Show panel** | Hides or shows the side panel. |

When a new version is available, a chip for it appears beside **Shortcuts**.

Over the office, at the bottom left, **Zoom out**, **Zoom in**, **Fit office** and **Reset** change the view; the mouse wheel zooms and dragging pans. **Terminal** shows or hides the terminals of the project under the office.

## The usage tanks

The two tanks on the lawn show how much is left of your usage limits, so a glance says whether the agents can keep working.

![Hovering the tanks on the lawn: a panel listing the 5-hour and weekly limits of Claude Code with the share left and the time until each resets](../images/usage.png)

- Each connected program has a pair of tanks: **5h** for the 5-hour limit and **wk** for the weekly limit. The liquid is what is left, and the percentage is written under each tank.
- The liquid is blue, turns amber once 70% is used and red once 90% is used. A tank with no reading yet shows "?".
- With 10% or less left, the glass cracks and drips.
- A small control box beside the tanks says **ok**, **low** (10% or less left), **out** or **wait** (no reading yet). The beacon above it blinks when a limit is nearly gone.
- When a program has several logins (Settings), a small round gauge for each login sits above its tanks: the left half is its 5-hour limit and the right half its weekly one.
- Point at the tanks with the mouse to see **Your usage limits** with every limit and when it resets.

The tanks are a mouse hint only. The same numbers are in the **Usage** window, which you can open from the keyboard, and in the usage button under each agent's message box.

## Use it from the keyboard

Every world action can be done from the panel without the mouse. To select an agent, press Ctrl+Tab, or open the list with the button that shows the number of agents, Tab to a row and press Enter. Then Tab to **Allow**, **Deny**, **Wake** or the buttons in a dialog. The shortcuts below work anywhere. **Cmd** is the Command key on a Mac; on Windows and Linux use **Ctrl** instead. **Ctrl** is always the Ctrl key. Press **Cmd+/** (**Ctrl+/**) to see them all, with a search box.

| Keys | What they do |
| --- | --- |
| Ctrl+Tab, Shift+Ctrl+Tab | Next or previous agent of this project. |
| Shift+Cmd+[, Shift+Cmd+] | Previous or next project. |
| Cmd+K | A command palette for the selected agent: type a command or skill, with its arguments, and press Enter. It runs only when the agent is free. |
| ``Ctrl+` `` | Show or hide the terminals. |
| Cmd+/ | Show the shortcuts. |
| Esc | Close a dialog, menu or card. |
| Left and Right arrows | On the panel's edge: resize the panel. |

The shortcuts for the chat are in [Chat and dialogs](chat-and-dialogs.md). To remove an agent, open **More actions** under its message box and choose **Remove agent**. If its worktree has uncommitted changes, the panel lists them and offers **Cancel (commit in terminal)**, **Remove, keep worktree** and **Discard changes**.

Next: [Chat and dialogs](chat-and-dialogs.md)
