# Chat and dialogs

Talk to an agent in its **Chat** tab, read what it did, and answer when it asks you something.

Your messages are typed into the agent's real terminal, exactly as if you had typed them there, and the chat is drawn from the agent's saved conversation. Nothing about the session changes. The **Terminal** tab shows the same session as raw text.

## Send a message

1. Select an agent (see [The office](the-office.md#select-an-agent)) and open its **Chat** tab. The cursor is in the message box.
2. Type, and press Enter. Shift+Enter starts a new line.
3. Your message appears at once, dimmed, with "Sending…" until the agent's conversation has it. The agent's reply follows, with the agent's name above it, a **Copy** button, and how long it worked.

While the agent works, a line at the bottom of the conversation says what it is doing, for example "ada is thinking", "ada is running a command" or "ada is writing code", with the command or file and a timer.

If the agent is asleep, the message box is replaced by a bar with **Wake** and the agent's name. See [Wake an agent that is asleep](the-office.md#wake-an-agent-that-is-asleep).

To find your way in a long conversation:

- **Show earlier** at the top loads older messages. **Latest** appears over the message box when you have scrolled up.
- Cmd+F (Ctrl+F on Windows and Linux) opens a search box. It counts matches ("2 of 5"). Enter goes to the older match, Shift+Enter to the newer one, and **Close** or Esc ends the search.
- Alt+Up Arrow and Alt+Down Arrow jump between the messages you sent (Option on a Mac). Two small arrows beside one of your messages do the same when you point at it.
- **Conversation tools** (the **⋯** button at the top right of the chat) has **Search**, **Save notes** (a short record of the conversation in the notes folder) and **Copy as Markdown**.
- Select words in a reply, or in the output of a command, and a button such as **Ask ada** appears over them. Click it, optionally type what you want to know, and click **Add**: the words join your message as a quote card above the box, to edit before you send. Each quote card has a field, "What about this?", and a button to remove it.

Under each message of yours are **Copy** and **Rewind** (see [Rewind](#rewind)).

## The tool cards

Everything the agent does appears in the conversation as a card.

- **A run of steps.** Two or more commands, file reads, searches, web fetches and thoughts in a row fold into one card. While the agent works it says "Working · 5 steps" and shows the newest three, with a button for the earlier ones. When the agent moves on it folds to a line such as "Ran 4 commands · thought 12s". Click the line to open or fold it.
- **A command.** A headline in plain words, folded. Click it to see the command and what it printed: the first 6 lines, then **Show all N lines**, and **Copy output**. The card says "running…" while it runs, and "failed" when it did not work.
- **An edit.** "Edited" or "Wrote", the file's name and a diff: red lines were removed, green lines added. Long ones show the first 14 lines, then **Show all N lines**. Click the file's name to open it (see [Code and preview](code-and-preview.md)).
- **Other tools.** A card for each kind: delegating work to a subagent, updating the agent's to-do list, asking you a question, proposing a plan. A call to an MCP server shows the server's name, a headline and **Details**.
- **Messages between agents.** A message from another agent is a separate card, "From agent" and the sender's name, cut to two lines until you click **Read more**, so it is never mistaken for something you typed. Work handed over from another agent is a **Hand-off** card.

![The chat of an agent: a command folded into one line, the Library and Notes rows of the office's own calls, an edit shown as a diff, and the agent's reply](../images/chat.png)

Above the message box, a button says "2 commands running" when the agent has commands running. It lists them, each with **Stop**, and **Stop all**. Another says "1 subagent working" and opens the subagents.

## The office's own rows

An agent also uses Agent World's own tools: it reads the library, adds and updates todos, writes notes, and reports on a workflow. These are not work on your project, so a run of them is not a card each. They fold into a row for each area:

| Row | What it covers |
| --- | --- |
| **Workflow** | Starting, planning and finishing a run, and looking at workflows. See [Workflows](workflows.md). |
| **Todos** | Adding, taking, updating and finishing todos. See [Todos](todos.md). |
| **Library** | Skipping and reading items, and searching the library. See [Library and playbook](library-and-playbook.md). |
| **Notes** | What the agent noted and recalled. |

Each row has an icon and one line of what was done there, for example "skipped tdd · read house-research" in **Library**, or "recalled · default ports" in **Notes**. Click a row to open a line for each call. Click a line to see what the call brought back, the first four lines, and click **Call details** for its own card.

A spinner on a row means a call is still running. A call that failed is counted in red on its row ("1 failed"), and its reason is in its line. The calls that move a workflow run along show on the run's track above the chat instead, unless one failed.

## The message box

Special inputs, wherever you are in a message:

- **/ commands and skills.** Type `/` and a list of the agent's commands and skills opens, each with its description and a tag: **built-in**, **skill** or **command**. Arrow keys move; Tab or Enter completes the highlighted one. Enter sends a command that is already typed in full. Esc closes the list. Typing `/help` shows a **Commands** card with every command and skill, grouped by where it comes from and with a filter; click one to put it in the box. `/clear` clears the conversation at once when the agent is free. Cmd+K opens a palette for the same commands.
- **@ files.** Type `@` and a list of the files and folders of the agent's folder opens, tagged **file** or **folder**. Tab or Enter puts the path into the message. A name with spaces is put in quotes.
- **! shell.** A message that begins with `!` runs as a shell command. A **shell** badge shows above the box ("Runs this command directly, without Claude interpreting it. Claude then sees the output."). The chat shows the command after a `!` and its output under it.
- **Pictures and files.** Click **Attach** (the **+** under the box), paste a picture, or drop files on the box. Each one is a chip above the box with its name; the **x** on a chip takes it off. A file already on disk is mentioned by its path. A pasted picture is saved first, in a folder the agent may read, and mentioned the same way. You can send them with no text.
  - Click the thumbnail of a picture chip to see it full size. **Edit** opens a small editor with **Pen**, **Line**, **Arrow**, **Rectangle**, **Ellipse**, **Text** and **Hide (black out an area)**, five colours, **Undo**, **Redo** and **Clear all marks**. **Save** replaces the attached picture with the marked-up one. **Close** leaves it as it was.
  - Pictures in a conversation are thumbnails. Click one to open it, with **Zoom in**, **Zoom out** and **Fit**, and the arrow keys to step through the pictures of one message.
- **Earlier messages.** On the first line of the box, Up Arrow brings back the message you sent before; Down Arrow goes forward. A line above the box shows "↑ history 2 of 5" and says your draft is kept. Esc brings your draft back. Ctrl+R searches them: type a few words and press Ctrl+R to see the latest of your messages that contains them, and again for the next older one. They are kept only while the app is open.
- **/btw side questions.** Type `/btw` and a question. The answer shows in a card, **Side question**, with your question and the answer ("Answering…" until it arrives), and a **Dismiss** button. It is not part of the conversation.
- **Undo.** Cmd+Z (Ctrl+Z) undoes typing, completions and pastes, and Shift+Cmd+Z (Shift+Ctrl+Z) redoes them.

A draft you have not sent stays in the box when you switch to another agent and back. While the agent waits for you, the box says "ada is waiting for you above" (with the agent's own name).

## Permission modes

The mode says how much the agent may do without asking. Its name is the button under the message box. For every mode except **Ask first**, its colour is also on the top border of the box, on the bar above the panel and on the character's name tag.

| Mode | Colour | What it does |
| --- | --- | --- |
| **Ask first** | grey | Asks before edits and most commands. |
| **Edit automatically** | gold | File edits go through; commands still ask. |
| **Plan** | cyan | Reads and plans. Changes nothing until you approve the plan. |
| **Auto** | orange | A classifier approves the safe actions for you. |
| **Don't ask** | purple | Only pre-approved tools run; everything else is denied. |

A red mode, **Bypass**, asks nothing and is only for a sandbox. The menu does not offer it for Claude Code agents. Antigravity agents have **Ask first**, **Edit automatically**, **Plan** and **Skip permissions**.

To change the mode, click the button and pick one, press Shift+Tab in the message box to go to the next one, or use **Mode** on the agent's profile card. A mode that needs the agent to restart on the same conversation only works between turns, and the button says **Switching…** meanwhile. The hire form's **Permissions** group offers the same levels when you hire (see [Getting started](getting-started.md#hire-another-agent)).

## Queue, send now and stop

- You can type while the agent works. A message sent then shows "Queued: sends when the agent finishes its current step". If the agent's program never takes it, it disappears from the list after a while.
- With text in the box and the agent working, **Send now** appears. It interrupts what the agent is doing and sends your message.
- To stop the agent, click the square **Stop** button (hint: "Interrupt (Esc)") or press Esc anywhere in the conversation. The line says "Stopping ada…". Stopping also denies any permission request the agent had open.
- If you stop before the agent has produced anything after your last message, the agent takes the message back: it leaves the conversation and returns to the box, with its pictures, files and quotes, to edit and send again.

Esc does one thing at a time: it closes a list of completions, a menu or a dialog, brings your draft back, or puts an open card away. The next Esc, when there is nothing left to close, stops the agent.

## Rewind

To go back to before one of your messages, click **Rewind** under it. It is not shown while the agent works or asleep.

1. Agent World opens the agent program's own rewind list in the agent's terminal and picks that message.
2. Claude Code asks what to restore. That question arrives as a card in the chat, with its own buttons: the conversation, and the code too where the program tracked changes. Where a program asks nothing, the rewind finishes by itself.
3. When it is done, the conversation after that message is gone from the chat, and the message's words are back in the message box to change and send again.

If the message is too old to be in the program's rewind list, the chat says "Could not find that message in the rewind list (older ones may be out of range)." If the agent is busy, it says "Wait until it finishes, or stop it first."

This **Rewind** is not the **Weekly Rewind** button in the top bar, which is a report on your week.

## Dialogs

When an agent needs you, a question appears as a card with a red tag, the agent's name and what kind of request it is: **ALLOW?**, **PLAN**, **QUESTION**, **TRUST?** or **ASKS YOU**. The red tag also shows in the agent's row, and the agent turns to **permission** in the office.

- In the **Chat** tab the card sits over the message box.
- If you last chose the **Terminal** tab, selecting an agent that waits opens the same card as a pop-up box.
- **+2 waiting** in the title bar (the number varies) means more requests are queued behind this one.
- To put a card away, click its **✕** (or press Esc). The agent keeps waiting. A line such as "ada is waiting for you · allow?" has **Show** to bring the card back. In the pop-up box, the foot says "Esc closes this box; the agent keeps waiting."
- A request that is still open comes back if you reload the window.
- If answering fails, a red line gives the reason and **Open terminal**.

### A permission request

The card says "Wants to use" and the tool, with what it will do under it, for example a command. Click **Allow** to let it, or **Deny** to refuse.

For a Claude Code agent, a request that nobody answers within 5 minutes falls back to Claude's own dialog in the agent's terminal: answer it there. The request from a subagent is shown on its main agent's card.

### A plan

The card says "Ready to work. Review the plan:" and shows the plan. Choose one:

- **Approve · auto-accept edits**: the agent starts, and its file edits go through without asking.
- **Approve · review each edit**: the agent starts, and you approve each edit.
- Type what to change in "What should change?" and click **Keep planning**: the agent goes on planning.

If the plan text is not available, the card says "The plan is shown in the terminal."

### Questions

The card has one page for each question, then a page to review, and a numbered step for each at the top, ending with **Send**. The page says whether to "Pick one" or "Pick any that apply", and lists the answers, each with a description. A question you pick one answer for also has a last row, "Something else…", where you type your own.

![A question from the agent as a dialog: page 1 of 2, with four numbered answers and a Something else field, and Answer in terminal at the foot](../images/chat-dialog.png)

- Click an answer, or press its number key (1 to 9). For "Pick one", picking an answer moves to the next page. For "Pick any that apply", each click ticks or unticks an answer.
- Arrow keys Up and Down move between answers, Space or Enter chooses, and Left and Right turn the pages. **Back** and **Next** do the same, and **Next** reads **Review** on the last question.
- The review page, "Check your answers", lists every answer, each with **Edit**, and "not answered yet" for the missing ones. **Send answers** is available when every question has an answer.

### Folder trust

The first time Claude Code works in a folder it asks: "Trust this workspace before the agent starts?", with the folder's path. **Trust folder** says yes. **Exit** says no.

### The agent program's own menus

A menu the agent program draws in its terminal that Agent World has no card of its own for appears as an **ASKS YOU** card once it has stayed on screen for a moment: a title, what it is about, and a button for each option, the first in brass. **Cancel** is there only where the program's Esc does something. Examples are a permission dialog the program shows itself and a picker.

The first questions of a new Claude Code are among these: the text style, an API key found in your environment, how to log in, and the security notes. None of them can be skipped. The sign-in page that waits for a code from your browser cannot be answered here: its card has **Open terminal**.

### Answer in terminal

Every card has **Answer in terminal** at its foot. It closes the card and takes you to the agent's **Terminal** tab, with the keyboard in the terminal, where you answer the agent program's own dialog. Use it when a card cannot do what you need, or when you prefer the program's own dialog. When the dialog is gone from the terminal, the card goes away. From the card in the chat, it also makes **Terminal** the tab agents open on, until you click **Chat** again.

## The controls under the message box

| Control | What it does |
| --- | --- |
| **Attach** (+) | Attach pictures or files. |
| The mode button | The permission mode: see above. |
| The model button, for example "sonnet · high" | **Model and effort**. Changing either restarts the agent on the same conversation; it says "Restarting…". Only between turns ("Available between turns."). |
| The ring | **Context and usage**: how much of the context window is used, with **Compact** to summarise the conversation, the 5-hour and weekly limits, the cost and the lines changed. |
| **More actions** (⋯) | **Review** (ask a peer to review the branch), **Clone** (fork the chat into a new branch), **Handbook** (the project's CLAUDE.md), **Tools** (MCP servers and plugins), **Finish this branch**, **Hand off…**, **Rename**, **Change role…**, **Group…** and **Remove agent**. Controls the agent's program cannot do are not offered. |
| **Send** or **Stop** | Send the message, or interrupt the agent while it works. |

**Hand off…** opens "Hand off ada's work" (with the agent's own name), where you choose who gets the branch (another agent, or a newly hired one) and what you want from them: **Review**, **Continue** or **Answer**. You can add a note, see "What they will be told", and click **Send hand-off**. **Finish this branch** is described in [Code and preview](code-and-preview.md).

Next: [Code and preview](code-and-preview.md)
