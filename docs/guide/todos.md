# Todos

One board for each project, where you and your agents add, claim and finish the same tasks.

## Open the board

Open a project, then click **Todos** in the top bar. A number on the button counts tasks marked **needs you** that are not done. Each project has its own board, kept in `~/.agent-world/todos` by default.

![The Todos board: the Workflows and Setup lists with tasks, a needs you task, and finished lists below](../images/todos.png)

## Add tasks and lists

- To add a task: click **Add a task** at the foot of a list, type the title and press Enter.
- To add a list: click **New list**, type a name and press Enter.
- To rename or delete a list: click **⋯** on its header and choose **Rename list** or **Delete list**. Deleting a list deletes its tasks.
- To move a task: drag it to another list or place.

A list with nothing open shrinks to a tile under "Nothing open". Click it to open it.

## Work a task

To finish a task, click the circle on its row. Click the tick on a finished task to reopen it. Finished tasks fold under **Done (N)**.

A task is open, doing, blocked or done. **needs you** marks a step only a person can do. **unfinished** means an agent's turn ended without it saying done or blocked. **auto-closed** means Agent World closed it because nobody said it was done.

## Open a task

Click a task to open its panel; click it again to close it. In the panel you can:

- Edit the title and **Notes**, and tick **Needs you**.
- Click **Open the message it was made in**, or on a finished task **Open the message it was finished in**. The chat of that agent opens at the message.
- Read **How it was done** (the approach, commits and files) and **Activity**.
- Under **Ask an agent**, choose an agent, then **Ask a question** or **Work on it**, and click **Send to name**. **Work on it** also puts the agent on the task.
- Click **Mark done** (or **Reopen**), or **Remove**. Remove deletes the task for you and for the agents.

## Filter and search

- **Everyone**, **Made by you** and **Made by name** (one button for each agent that made a task) filter the board.
- **Search todos…** matches titles and notes.
- **Scratch pad** switches to the pad, below.

## Change several tasks at once

Tick the box that appears beside a task when you point at it, or hold Cmd, Ctrl or Shift and click its row. Shift-click picks a range. A bar appears with **N selected** and **Mark done**, **Reopen**, **Move to**, **Needs you** (or **Needs you off**) and **Delete**. Click **Clear** or press Esc to let go.

## Scratch pad

To jot tasks before they go on the board:

1. Click **Scratch pad**.
2. Type a task and press Enter for the next row. Pasting several lines makes several rows.
3. Use the button on a row to choose its list. Rows with no list go to the Inbox.
4. Click **Make N tasks**.

Click **Undo last** to take the last batch back.

## How agents use the board

Agents work on the same board through these tools.

| Tool | What it does |
| --- | --- |
| `todo_list` | Lists open tasks, including the ones you added by hand. |
| `todo_search` | Searches tasks, finished ones too. |
| `todo_get` | Reads one task in full, with its history. |
| `todo_add` | Adds a task. With no list it goes to the **Inbox**. |
| `todo_claim` | Says the agent is doing it now. Another agent cannot claim it meanwhile. |
| `todo_update` | Changes title, list, notes, needs you, or status. |
| `todo_done` | Marks it done with a note and how it was done. |

Everyone sees the same board. **Activity** says who changed what. A finished task keeps the commits and files git shows the agent changed. Agents have no tool to delete or reopen a task. Only you can.

## Links to tasks in the chat

`todo#14` in a chat message, yours or an agent's, becomes a link showing the task's title and state. Click it to open the **Todos** window on that task. A bare `#14` is left alone.

## Track every request

By default agents record only what is put off. To track every request, go to **Settings** > **Features** and turn on **Track every request as a todo**. Each message you send then becomes a task in the **Inbox**. Click **Name and sort N tasks** to name them and put them in lists.

Next: [Settings and updates](settings-and-updates.md)
