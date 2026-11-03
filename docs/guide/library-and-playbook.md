# Library and playbook

Keep skills, instructions and prompts once, and say which of them each agent is told, and when.

## What the library holds

One shared shelf for every project and both programs (Claude Code and `agy`). It holds **skills** (a folder with a `SKILL.md`), **instructions** and **prompts**. Each has a name, a one-line description and the text an agent reads. Items live in `~/.agent-world/library` by default.

The **playbook** says how an agent gets an item. An item does nothing until a playbook rule picks it.

## Open the library

Click **Playbook and tools** in the top bar. Its tabs are **Skills**, **Playbook** and **Usage**.

If the button says **Playbook and tools (off)**, open it and click **Open Settings → Features**, then turn on **Library and playbook**. Your items and playbooks are kept while it is off, and agents are told nothing from them.

## Put items in the library

On the **Skills** tab:

- To copy skills you already have: click **Add skill…**, tick the skills you want and click **Import N selected**. It lists skills found in `~/.claude/skills`, the `~/.gemini` skill folders, the open project's `.claude/skills` and `.agents/skills`, and enabled Claude plugins. Originals stay where they are.
- To write an instruction: click **New instruction**, fill in **Name**, **When to use it** and **Text an agent reads**, then click **Save** (or press ⌘↵; Esc cancels).
- To write a prompt: click **New prompt** and do the same.

Click an item to read it, **Edit** to change it, or **Remove** to delete it from the library. Use **Find an item…** to search. A skill's **Files** tab lists its other files with their size in tokens: **Open** opens one in the program your Mac uses for it, and **Show in Finder** shows the skill's folder. The line above the list says how many skills are on for Claude, and its meter shows about how many tokens their names and descriptions add to the start of every session.

The list groups skills as **Used this month**, **Gathering dust** (on for Claude but not used in 30 days) and **Off for Claude**, with instructions and prompts last. Each skill has its shelf colour, a square for each of the last 30 days (brighter for more uses), the faces of the agents that used it, how often it was used and what it costs. **Clear the dust** turns every skill gathering dust off for Claude; each can be turned back on. When an agent loads a skill while the window is open, its row blinks and shows +1. Opening a skill shows the same numbers under its description.

## Choose where a skill works

Open a skill: its **Where it works** tab shows the library copy, a socket for each place and a cable to each place the skill reaches. Click a socket to switch it. One copy lives in the library; nothing is copied.

- **Claude in the app**: on by default. Every Claude agent gets the skill when it starts, on every account the app has set up, and nothing is installed in an account's own folder. Switch it off to keep the skill in the library only. A skill a playbook rule names still reaches the agent, and a rule set to **Off** keeps one away.
- **Claude (outside the app)**, **Antigravity CLI**, **Antigravity app** and **This project**: click one marked **plug in** to link the skill into that program's skills folder; it then says **linked**. The link points at the library copy, so an edit shows everywhere. A place that is not installed here says **not here** and is greyed out. If a folder of the same name is already there, the socket says **a copy** and is left as it is.

A skill that is linked into **Claude (outside the app)** is not added again when an agent starts, so Claude does not list it twice.

Agents already running keep the skills they started with until they restart.

<img src="../images/library.png" alt="The Skills tab with the item commit-style open: its text, size in tokens, and the tabs What an agent reads, Files and Used by" width="720">

## Choose what agents are told

On the **Playbook** tab, the bookshelf at the top shows what is **On the desk** (told every time) and **On the shelf** (pointed at), and a notice appears there when the opening text is over budget. Below it:

1. Pick a scope: **Everywhere**, or the button named after the open project's folder. The project's rule wins over **Everywhere** for the same item.
2. Click **Add an item…** and click an item. It is added as **Pointed at**, soft.
3. To change how it is used, click **⋯** on its row and choose **Told every time**, **Pointed at**, **By a step** or **Off**. **Remove from playbook** takes it out.
4. For **Pointed at**, write the "When to use" sentence on the row: one plain sentence the agent can judge against its work, such as "failing tests".
5. Set the firmness with the three-step gauge: **soft**, **medium** or **hard**.

What the modes mean:

- **Told every time**: the item's words are in the agent's opening text.
- **Pointed at**: only the "when" line is in the opening text. The agent decides whether to read the item.
- **By a step**: a workflow step puts the item in.
- **Off**: never put in front of an agent.

A **soft** rule is only in the opening text. A **medium** or **hard** rule is also named in a short line sent now and then with your messages. **hard** also asks the agent to say, with `library_skip`, why it passed over a rule that could apply. Click **?** for the glossary.

The right half shows **What every agent starts with** for the program you pick under **Agent of**, plus **It can ask for**, **Reminder** and **Who gets this**. The header shows `opening text ≈ N / 300 tokens`, and a notice appears over 300.

An agent keeps the text it started with. After you change a playbook, click **Restart N agents** in the notice to apply it.

<img src="../images/playbook.png" alt="The Playbook tab with two rules, Told every time and In the rulebook, and the opening text an agent starts with" width="720">

## The guide to Agent World

The Library holds one skill the app makes itself, **Agent World guide**, in the **Agent World** group of **Add an item…**. Its pages are these pages: the app copies the guide that ships with it, so what an agent reads and what you read on GitHub is the same text. The **Everywhere** playbook has a **Pointed at** rule for it, "the user asks how to do something in Agent World", so an agent reads the page first instead of answering from memory. Take the rule out and it stays out.

## Tools agents call

| Tool | What it does |
| --- | --- |
| `library_index` | Lists the items the playbook gives this agent. |
| `library_get` | Reads one item by id. |
| `library_search` | Searches those items by a few words. |
| `library_skip` | Says an item does not apply, with a reason. |

An agent can read only items in its playbook. Claude Code also gets the playbook's skills as skills it can load itself. For `agy`, connect it under **Settings** > **Message box** so its messages carry the line too.

## See what the library did

- In the chat, notes under a message say what the library did, such as **Told at the start**, **Rulebook sent**, or an item read or passed over. Click a note to see the exact words.
- On an agent, the **Library** tab shows **What it was told** and **What it did**. It appears once the library has done something for that agent.

## Usage

The top of the **Usage** tab shows the library's skills over the last 30 days, with the start-of-session cost meter. **Most used** ranks them with a bar each, the faces of the agents that used them, the accounts and when each was last used. A use is Claude loading the skill, or an agent reading it. **Gathering dust** lists the rest with what each still costs at the start of every session: click **Turn off for Claude** to stop paying for it, **Remove** to delete it from the library, or **Clear the dust** to turn them all off for Claude. **Who reached for what** shows each agent with the skills it used.

Below that, the tab judges each item on the prompts that looked related to it, not on every time the rulebook reminder named it (an agent is told to say nothing about a rule that does not apply, so most reminders can only end in silence). Under each name is how often it was reminded; the bars are **related** prompts, how often the item was **read** then (any time later in that session), and **said no**. The verdict is one of: most said no (the "when" is too wide: make it narrower), passed over in silence when it applies (make it firm or a step), fair, working, or too few to judge. Only whether a prompt looked related is kept, never the prompt. Use **Program** to switch between **Both programs**, **Claude** and **agy**. Click a row to see what agents said when they passed it over.

To fix a flagged row, click **Write a when** (**Write a narrower when** when most said no), **Make it firm** or **Make it a step**.

## What it costs

The opening text costs up to about 300 tokens once per session, and a message that points at an item about 60. **Settings** > **Features** has the estimates.

Next: [Todos](todos.md)
