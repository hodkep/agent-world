# Code and preview

Review what an agent changed, commit and land its branch, and look at its work running.

## Reach the tabs

Select an agent in the office. The tabs above its panel are **Chat**, **Terminal**, **Code**, **Tools**, **Library** (when the library has something for it), **Workflow** (only with Workflows on, see [Workflows](workflows.md)), **Traces** and **Preview**. A dot on **Preview** means a dev server of that agent is running. A file opened from the chat that fits no other tab gets a tab of its own, named after the file.

Clicking a file name in the chat goes to the tab that fits it: an HTML page or PDF opens in **Preview**, a code file in the agent's branch opens in **Code**, and anything else opens in the file's own tab, which has **Open with default app**.

## Review a branch

Open **Code**, then **Changes**. The list is what the agent changed since its branch left the base branch: committed work, uncommitted edits and new files. Click a file to see its diff on the right, as one inline view. The list refreshes while the agent works; the **↻** button refreshes it by hand.

The column has three views, switched at the top:

- **Branch**: everything the branch changes compared with its base.
- **Uncommitted**: what is not committed yet. In a narrow column it is called **Pending**.
- **History**: the branch's commits.

![The Code tab: the Changes list with a changed file's diff, and Merge into main at the foot](../images/code.png)

### Branch

- **compared with**: the branch the changes are measured against, and where **Merge** and a pull request go. Click it to pick another local or remote branch. This only changes the comparison; git itself is not touched. When the base looks out of date, a note offers **Compare with** the branch your own checkout is on, or **Keep it**.
- The chips show how many files, and how many are added (**A**), modified (**M**) or deleted (**D**). Click a chip to show only those.
- **Search changed files…** narrows the list. **Tree** shows folders; **List** shows one flat list with file names first. The choice is remembered.
- The **✕** on a file discards its uncommitted changes (a new file is deleted). It asks first and cannot be undone.

### Uncommitted

Files are grouped as **Staged**, **Changes** and **New files**. Each group has **Stage all** or **Unstage all**; each row has **+** (stage), **−** (unstage) and **✕** (discard, with a question). With files staged the button reads **Commit N staged** and commits only those. With nothing staged, **Commit all** takes every change, new files included.

### History

**Since main** lists the commits made since the branch left its base; **All** lists every commit that leads to the branch. Search by message, author or hash. A commit row shows its hash, author, age, files and lines added and removed, **HEAD** for the current one, and **LOCAL** for one not pushed yet. Click a commit to see its message and files, and click a file for that commit's diff. **Copy hash** copies it, **← History** goes back, and **Show older commits** loads more.

## Commit

In **Branch** view, type a message in **Message…** and click **Commit all**. It commits every change in the agent's worktree. The agent's plan file (`.agent-world/plan.md`) is left out. To commit only some files, use **Uncommitted** and stage them first.

## Browse and edit files

**Files** lists the worktree's files, tracked and new (git's ignored files are left out). **Search…** filters the list; folders open and close. Click a file to open it in a tab.

- Edit in place, then **Save** (⌘S). A dot on the tab means unsaved changes. Closing such a tab asks **Discard** or **Keep editing**.
- ⌘W closes the tab. On Windows and Linux the same keys are Ctrl+S and Ctrl+W.
- A Markdown file has **Preview**, which reads it as formatted text, and **Source**, which goes back. This is not the **Preview** tab.

Edits are written straight into the agent's worktree, so the agent sees them.

## Send code to the agent

Select code in a diff or in an open file. A button reading **Ask** and the agent's name appears, or press ⌘L (Ctrl+L on Windows and Linux). The code goes into that agent's message box as a chip and the editor stays as it is, so you can add more. For a selection in a diff, the chip carries the code after the change, and the lines before it when the selection touches a change. Chips waiting in the message show under the editor as **In the message**: click one to go to its lines, **✕** takes it off, and **Open chat** goes to the message box. Text selected in **Terminal** and in a file's own tab has an **Add selection to message** button too.

## Land a branch

At the foot of **Changes** is **Merge into main** (the base branch's name replaces `main`). Its **▾** menu, **More ways to finish**, has three choices:

- **Merge into main**: merges the branch into your own checkout, keeping each commit, after a question. It refuses unless your checkout is on that base branch with nothing uncommitted. On a conflict the merge is aborted and the base is left unchanged.
- **Push & open PR**: pushes the branch to `origin` and opens a pull request against the base. It needs a remote called `origin` and the GitHub command line tool (`gh`).
- **Finish name…**: opens the Finish dialog.

**Finish this branch** in the chat's **More actions** menu opens the same dialog.

### Finish this branch

The dialog first shows **Ready?**, four checks that must all pass:

1. The branch has commits the base does not.
2. Everything is committed (a count of uncommitted files otherwise; commit them in **Code**).
3. Your own checkout is on the base branch with nothing uncommitted.
4. The merge would not conflict with the base.

Then **Land it**:

- **Into** picks the branch to land on. It also changes what the branch is compared with.
- **Merge, keeping each commit**, or **Squash into one commit** with a **Commit message**.
- **Then remove name, its worktree and branch**, ticked by default. Untick it to keep the agent.

The button reads **Land on main**, or **Land anyway on main** when the merge gate holds it (see below). Landing happens in your own checkout.

With Workflows on, Finish also shows an **Against the plan** block with the plan, the review's findings to tick as seen, and extra rows in the checklist. Finish refuses to land while the plan was not approved or a finding is unseen, and **Land anyway** is always possible. The other buttons do not apply those checks: **Merge into main** merges as soon as you confirm. See [Workflows](workflows.md) for what holds a merge and how to release it.

An agent that works directly in your project folder, or in a folder that is not a git repository, has no branch. **Code** then shows a note instead of **Changes** and **Files**: there is nothing to compare, commit or merge until the folder is a git repository and the agent is hired again.

## Preview

**Preview** shows web pages next to the agent's chat. Three kinds open there:

- A dev server the agent started. The app spots a local address in the agent's terminal output and checks that something answers. The page appears on its own, and the tab has a dot while it runs. A server that stops answering is dropped after about half a minute.
- A page file on your computer. When an agent opens an HTML page (or PDF) in your browser, it is also shown here, unless you turned off **Open pages in the app preview** in Settings. You can type a path such as `~/design/index.html` in the address bar.
- A site on the internet. Type its address or click a link in the chat (⌘-click or Ctrl-click opens your browser instead).

The address bar takes `5287` (meaning `localhost:5287`), `localhost:3000/app`, `example.com` or a file path. Its list offers **Running now** servers and **Recent** pages; ↑↓ choose, Tab completes, Enter opens, Esc closes. **✕** forgets a recent address.

The first time a site on the internet opens, Preview asks: **Open here** or **In my browser**. It tells you the site is on the internet and has no access to your files or to Agent World, and says so when the connection is not encrypted. The answer is remembered per site on this computer; forgetting the address forgets it. Pages in Preview cannot use the camera, location or notifications, cannot download files, and open links in the same pane.

The toolbar has **Back**, **Forward**, **Reload**, the address bar, **Screen size**, **Select element** and **Open in browser**.

- **Screen size**: **Desktop** (the panel's width), **Tablet** (820 × 1180) or **Mobile** (390 × 844), with a device list and **rotate**. It is remembered for each agent.
- **Select element**: click something on the page and it goes into the agent's message box as words plus a picture of it. Esc cancels.
- When nothing answers at the address, Preview says so and the page appears as soon as something does.

## Terminal

**Terminal** is the agent's own terminal, the real program running in a terminal the app owns. Keys go straight to it. **Chat** and **Terminal** are two views of the same session.

On a Mac, ⌘F searches the output and ⌘K clears the view. A selection offers **Add selection to message**. ⌘-click (Ctrl-click) on an address in the output opens it in your browser, and on a file path opens the file. Dropping files on the terminal types `@` mentions into the input; you still decide when to send.

## Tools

**Tools** lists what this agent's program can reach, and changes it through the program's own commands.

- **MCP servers**: each with its address or command, a status and **Remove** (click, then **Sure?**). **Add server** takes a name and either a web address (`https://…`) or a command (`npx some-server`); servers added here are kept to this project. **↻** checks them again.
- **Project memory**: notes shared by every agent in the project. Add one with **Save**; **Forget** removes one.
- **Plugins**: each shows its version, whether it is enabled and its scope, with **Enable** or **Disable**, and **Uninstall** (click, then **Sure?**).

## Traces and History

**Traces** lists the messages agents sent each other, newest first: who asked whom, the status and the time. Click one to read it in full. **Only name** limits the list to one agent.

**History** in the top bar opens **Past conversations**: earlier conversations saved for the open folder, grouped by day, newest first, up to 40. Search by what you asked. Clicking one continues it as a new agent. One that an agent already runs is greyed out.

Next: [Workflows](workflows.md)
