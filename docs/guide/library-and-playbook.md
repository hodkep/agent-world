# Library and playbook

Keep skills, instructions and prompts once, and say which of them each agent is told, and when.

## What the library holds

The library is one shared shelf for every project and every agent program (Claude Code and Antigravity's `agy`). It holds three kinds of item:

- **Skills**: a folder with a `SKILL.md` and, optionally, other files.
- **Instructions**: a text an agent should follow.
- **Prompts**: a text an agent can be handed to do a job.

Each item has a name, a one-line description (what it is for and when to use it) and the text an agent reads. The items are kept in Agent World's data folder, `~/.agent-world/library` by default.

The **playbook** is the second half. An item in the library does nothing until a playbook rule picks it. A rule says how an agent gets the item: told every time, pointed at when it applies, put in by a workflow step, or not at all.

## Open the library

Click **Library** in the top bar. The window has three tabs: **Shelf**, **Playbook** and **Reached for**.

If the top bar says **Library (off)**, the feature is switched off. Open it and click **Open Settings → Features**, or go to **Settings** > **Features** and turn on **Library and playbook**. Your items and playbooks are kept while it is off. Agents are told nothing from them.

## Put items on the shelf

On the **Shelf** tab:

- To copy skills you already have: click **Import…**. Agent World lists the skills it finds in `~/.claude/skills`, `~/.gemini/skills`, `~/.gemini/antigravity/skills`, `~/.gemini/antigravity-cli/skills`, the open project's `.claude/skills` and `.agents/skills`, and the skills of Claude plugins that are installed and switched on. Skills the library does not have yet are ticked. Click **Import N selected**. The originals stay where they are, and a skill whose name the library already has is skipped.
- To write an instruction: click **New instruction**, fill in the name, the one line, and **Text an agent reads**, then click **Save**.
- To write a prompt: click **New prompt** and do the same.

Use the **All**, **Skills**, **Instructions** and **Prompts** buttons to narrow the shelf.

Items sit in three places, by how the playbook uses them:

- **On the desk** (told every time).
- **On the shelf** (pointed at, or put in by a step).
- **In the box**: items in no playbook. Use **Find an item…** to search the box by name or description.

Click an item to read it. Its panel has three tabs: **What an agent reads** (the item's text, with its size in lines and tokens), **Files** (a skill's other files and where the skill is kept) and **Used by** (where it came from, what it costs to read and list, and how often agents have read it, split by Claude and agy). Click **Edit** to change an item, or **Remove** to delete it from the library. A removed item stops being used by every playbook.

![The Shelf tab with the item commit-style open: its text, size in tokens, and the tabs What an agent reads, Files and Used by](../images/library.png)

## Choose what agents are told

On the **Playbook** tab:

1. Pick a scope at the top: **Everywhere** applies to every project. The button named after the open project's folder applies to that project only, and shows only while a project is open. Where both have a rule for the same item, the project's rule wins. A project can switch an item off for itself this way.
2. Click **Add an item…**, search or open a group, and click the item. It is added as **Pointed at**, soft, with no "when" yet.
3. Move it with the **⋯** menu on its row: **Told every time**, **Pointed at**, **By a step** or **Off**. **Remove from playbook** takes it out.
4. For a **Pointed at** rule, write the "When to use" sentence on the row. See below.
5. Set the firmness: **soft**, **medium** or **hard** (the three-step gauge on the row).

Rules are grouped under **Told every time**, **In the rulebook, the agent decides**, **Put in by a workflow step** and **Off**. Click **?** at the top right for the plain-words glossary.

### The four ways to use an item

- **Told every time**: the item's words go into the agent's opening text, so it knows them from its first message. An item whose text is longer than 300 tokens is not copied in; the opening text tells the agent to read it first with `library_get` and follow it for the whole session.
- **Pointed at**: only a line saying when it applies goes into the opening text. The agent judges from that line whether its work needs the item, and reads it then. Agent World does not match the line to your message.
- **By a step**: a workflow step puts the item in when that step starts. It is not in the opening text. A skill named on a step of the workflow an agent is working on can be read by that agent even when the playbook leaves it out.
- **Off**: in the library, but never put in front of an agent.

### The "When to use" sentence

Write one plain sentence the agent can judge against its work, such as "a research task", "a merge conflict" or "failing tests". A row without one is listed as "when it applies". The sentence is what the agent sees, so make it narrow.

### Firmness

- **soft**: the "when" line is in the opening text only.
- **medium**: the item is also named in a short rulebook line added to a message. That line goes with the first message, every sixth message after, after a context compaction, and after a pause of more than an hour.
- **hard**: the same line, plus a request to decide silently which rules apply, read the ones that do with `library_get`, and call `library_skip` with a reason for any it passes over that could have applied.

Firmness shows on every rule except **Off**.

### What an agent will be told

With a project open, the right half of the Playbook tab shows the result for the playbook now in force (**Everywhere** plus the project's):

- **What every agent starts with**: the exact opening text, for the program you pick under **Agent of**. Told items are coloured, and so are the when-lines.
- **It can ask for**: the items the agent can read.
- **Reminder**: the rulebook line and when it is sent.
- **Who gets this**: the project's agents and whether each started on the current text.

The header shows `opening text ≈ N / 300 tokens`. 300 is the budget. Over it, a notice says every agent pays the cost on every message; move something to **Pointed at** or shorten it.

An agent keeps the opening text it started with. After you change a playbook, a notice reads "N agents started before you changed this playbook" with a **Restart N agents** button. An agent in the middle of a turn is skipped, and the notice tells you to try again when it finishes.

![The Playbook tab with two rules, Told every time and In the rulebook, and the opening text an agent starts with](../images/playbook.png)

## What each program gets

Both programs get the opening text added to their instructions when they start. When an agent can reach Agent World's tools, it also gets the four library tools below.

- **Claude Code**: also gets a folder of the playbook's skills (every skill not **Off**), built for that session only. Nothing is installed in `~/.claude`. The rulebook line is added to messages by Claude's own hook.
- **agy**: reads items through the library tools. The rulebook line reaches it through the `aw-library` plugin, which **Settings** > **Message box** installs. Until agy is connected there, the Playbook tab warns "agy is not connected": its agents get the always-on rules and the catalog, but no line for the message they are sent. If an agy agent has worked and the plugin never reached the office, a notice names it.

## The tools agents call

The library tools exist only while the library is on.

| Tool | What it does |
| --- | --- |
| `library_index` | Lists the items the project's playbook gives this agent, with what each is for and what it costs to read. |
| `library_get` | Reads one item by id. For a skill with extra files, a file can be named. |
| `library_search` | Searches those items by a few words. |
| `library_skip` | Says an item the agent was pointed at does not apply, with a reason. |

An agent can read only items in its playbook (or named on its workflow step). Anything else is refused.

## See what the library did

- **In the chat**: notes under a message say what the library did. **Told at the start** shows the opening text. An item note says it was pointed at, then read and how long after, or passed over with the agent's reason, or read when the work needed it. **Rulebook sent** marks a message that carried the rulebook line. Click a note to see the exact words the agent was given and their size.
- **On the agent**: a **Library** tab appears on an agent once the library has done something for it. It shows **What it was told** on the left and **What it did**, in order, on the right.

## Reached for

The **Reached for** tab shows, for each item agents were pointed at, how often they then read it. A row has three bars: **pointed**, **read** and **said no**. Use the **Program** menu to see **Both programs**, **Claude** or **agy**.

- An item counts as read if the agent reads it in that message or within three messages after.
- Only medium and hard **Pointed at** rules are counted as pointed at.
- Below three pointings a row says "Too few to judge yet". Otherwise, under 40% read is flagged first, under 70% next, and the rest is "Working".
- Click a row to see what agents said when they passed the item over. For a flagged row it offers three fixes: **Write a when** (jumps to the rule's "when" box), **Make it firm** (sets **hard**) and **Make it a step** (moves it to **By a step**). These edit the rule where it lives: the project's playbook if it has the item, else **Everywhere**.

## What it costs

The opening text has a budget of 300 tokens and is paid once per session. A message that points at an item adds about 60 tokens. **Settings** > **Features** shows a table of these as estimates for a short task, a normal session and a long day. The real figure depends on your playbook and on how you work.

Next: [Todos](todos.md)
