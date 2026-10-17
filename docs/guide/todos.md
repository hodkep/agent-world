# Todos

One board for each project, where you and your agents add, claim and finish the same tasks.

## Open the board

Open a project, then click **Todos** in the top bar. The button shows a number when tasks need you: the tasks marked **needs you** that are not done. The window's header repeats it ("1 needs you"). Without a project open there is no **Todos** button.

Each project has its own board, kept in `~/.agent-world/todos` by default. The board is a set of lists side by side, and each list holds tasks. Lists with something open come first. A list with nothing open is a small tile under "Nothing open"; click it to open it.

![The Todos board: the Workflows and Setup lists with tasks, a needs you task, and finished lists below](../images/todos.png)

## Add tasks and lists

- To add a task: click **Add a task** at the foot of a list, type the title and press Enter. Esc cancels.
- To add a list: click **New list**, type a name and press Enter.
- To rename or delete a list: click the **⋯** on its header and choose **Rename list** or **Delete list**. Deleting asks first, because it deletes the list's tasks too.
- To move a task: drag it to another list, or to another place in its list.

## Work a task

A task is **open**, **doing**, **blocked** or **done**. A row shows its title, and badges:

- **needs you**: a step only a person can do, such as a key to paste or a login.
- **doing · name**: that agent has claimed it.
- **blocked**: it is stuck. The task's panel gives the reason when there is one.
- **unfinished**: an agent's turn ended while it was on the task and it never said done or blocked.
- **done by name**, or **auto-closed** when Agent World closed it because nobody said it was done.

The row also says who made it and when, and who changed it last.

To finish a task, click the circle on its row. Click the tick on a finished task to reopen it. Finished tasks fold under **Done (N)** in their list.

## Open a task

Click a task to open its panel on the right. Click it again to close the panel. It shows:

- The address, such as `todo#14 · Library`, and the title, which you can edit.
- A banner with the state: open, doing, blocked, done, or closed by Agent World.
- **Details**: **Notes**, a **Needs you** checkbox, and who made it.
- **Where it came from**, when it was made from a chat message, with **Open the message it was made in**.
- **Where it was finished**, once it is done by an agent in a chat message, with **Open the message it was finished in**. The button closes the Todos window and opens that agent's chat at the message. The task keeps the start of the message as an excerpt.
- **How it was done**: the approach the agent wrote, the commits made while it was on the task, and the files it touched.
- **Activity**: what happened, oldest first: made, claimed, moved, asked, done, reopened.
- **Ask an agent**: choose an agent, then **Ask a question** or **Work on it**. Click **Send to name**. The agent is sent the task, its notes and the message it came from. **Work on it** also puts the agent on the task. An agent that is asleep wakes to read it. Tick **Open name chat after sending** to jump to its chat.
- **Mark done** (or **Reopen**) and **Remove**. Remove deletes the task for you and for the agents, and cannot be undone.

## Filter and search

Along the top of the window:

- **Everyone** shows all tasks.
- **Made by you** shows the ones you made.
- **Made by name** has one button for each agent that has made a task here.
- **Scratch pad** switches to the pad, below.
- **Search todos…** matches words in titles and notes.

## Change several tasks at once

Tick the box that appears beside a task when you point at it, or hold Cmd, Ctrl or Shift and click its row. Shift-click picks everything between the last task you clicked and this one. The box on a list's header picks all its open tasks. A bar appears with **N selected** and:

- **Mark done** and **Reopen**.
- **Move to**: choose a list, or **New list…**.
- **Needs you**, or **Needs you off** when all picked tasks already need you.
- **Delete**, which asks first.
- **Clear**, or press Esc. The first Esc clears the picks. A second one closes the window.

## Scratch pad

The **Scratch pad** is a checklist for jotting tasks before they go on the board.

1. Click **Scratch pad**.
2. Type a task and press Enter for the next row. Pasting several lines makes several rows. Backspace on an empty row removes it.
3. Use the button on a row to choose its list. Rows with no list go to the Inbox.
4. Click **Make N tasks**. The tasks are made as yours and the rows leave the pad. A row you ticked as finished becomes a finished task.
5. To take the last batch back, click **Undo last**. Tasks someone has already started on stay.

The pad is saved as you type.

## How agents use the board

Agents work on the same board through these tools. Every agent in the project that can reach Agent World's tools has them.

| Tool | What it does |
| --- | --- |
| `todo_list` | Lists open tasks, or filter by list, status or the ones the agent claimed. Tasks you added by hand are included. |
| `todo_search` | Searches titles, notes, how a task was done, files, commits and the messages it came from, finished tasks included. |
| `todo_get` | Reads one task in full: notes, history and the chat messages it was made and finished in. |
| `todo_add` | Adds a task. `needs_you` marks a step only a person can do. The task remembers the message the agent said it in. |
| `todo_claim` | Says the agent is doing the task now. A second agent cannot claim it while the first is on it. |
| `todo_update` | Changes title, list, notes, `needs_you`, or status (`open`, `doing`, `blocked` with a reason). |
| `todo_done` | Marks it done with a one-line note and how it was done. Records the agent, the message, and the commits it made. |

Agents have no tool to delete a task or to reopen one. Only you can.

How the sharing works:

- Everyone sees the same board. A change by you or an agent appears in the open window and is stamped with who made it in **Activity**.
- A task an agent adds with no list goes to the **Inbox**, which shows only while it holds something. Agents are asked to sort tasks into lists by feature of the project. An existing list that means the same is reused. A new list is made only when none fits. A catch-all name such as "Misc" or "Other" is refused, and an agent cannot make more than 12 lists.
- When an agent finishes a task, Agent World adds the commits and files that git shows it changed, and writes a line about it to the project's shared notes, where agents find it with `recall`.
- When an agent starts, its opening text tells it about the board. Subagents are not told. A message that looks like work already finished can carry a "Done before" line naming the task and who did it.
- A task made by a subagent shows the main agent it works for.

## Links to tasks in the chat

Write `todo#14` or `todo #14` in a message, and in any chat message, yours or an agent's, it becomes a link. The link shows a mark for the task's state and its title, or "not found" if the board does not have it. Click it to open the Todos window on that task. A bare `#14` is left alone, as are references inside code, links and buttons. Agents are asked to name tasks this way in their replies. The agent's calls to the todo tools in the chat show the same links.

## Track every request

By default agents record on the board only what is put off or left out on purpose. To have every request tracked, go to **Settings** > **Features** and turn on **Track every request as a todo**. Each message you send then becomes a task in the Inbox that the agent works on and marks done. A request that was only talked about, with nothing changed, is dropped when the agent's turn ends. When tasks wait to be named, **Name and sort N tasks** appears beside the filters. It names each one for what was done and sorts it into a list by area. It takes effect for agents started from now on and for each new message.

Next: [Settings and updates](settings-and-updates.md)
