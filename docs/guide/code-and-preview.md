# Code and preview

Review what an agent changed, commit and land its branch, and look at its work running.

## Reach the tabs

Select an agent in the office. The tabs above its panel are **Chat**, **Terminal**, **Code**, **Tools**, **Library**, **Workflow** (only with Workflows on, see [Workflows](workflows.md)), **Traces** and **Preview**. A dot on **Preview** means a dev server of that agent is running. Clicking a file name in the chat opens an HTML page or PDF in **Preview**, a code file of the branch in **Code**, and anything else in a tab of its own with **Open with default app**.

## Review a branch

Open **Code**, then **Changes**. The list shows what the agent changed since its branch left the base branch: commits, uncommitted edits and new files. Click a file to see its diff. **↻** refreshes the list.

![The Code tab: the Changes list with a changed file's diff, and Merge into main at the foot](../images/code.png)

Switch the column between:

- **Branch**: everything compared with the base.
- **Uncommitted**: what is not committed yet (**Pending** in a narrow column).
- **History**: the branch's commits.

In **Branch**:

- To change the base, click the branch after **compared with** and pick another. This only changes the comparison and where merges and pull requests go.
- To narrow the list, use the **A**, **M** and **D** chips or **Search changed files…**. **Tree** and **List** change the layout.
- To discard a file's uncommitted changes, click its **✕**. It asks first.

In **Uncommitted**, files are grouped as **Staged**, **Changes** and **New files**, with **Stage all** or **Unstage all** on each group and **+**, **−** and **✕** on each row. In **History**, choose **Since main** or **All**, search by message, author or hash, and click a commit for its files and diffs.

## Commit

To commit everything, type a message in **Message…** and click **Commit all**. The agent's plan file (`.agent-world/plan.md`) is left out. To commit only some files, stage them in **Uncommitted**; the button then reads **Commit N staged**.

## Browse and edit files

**Files** lists the worktree's files. Click one to open it in a tab, edit it, and click **Save** (⌘S). Edits go straight into the agent's worktree. A Markdown file has **Preview** and **Source** to read it formatted or as text; this is not the **Preview** tab.

## Send code to the agent

Select code in a diff or a file, then click **Ask** and the agent's name, or press ⌘L (Ctrl+L). The code goes into that agent's message box as a chip. Chips waiting there show under the editor as **In the message**.

## Land a branch

- **Merge into main** (the base's name replaces `main`) merges the branch into your own checkout after a question. It refuses unless that checkout is on the base branch with nothing uncommitted. On a conflict it aborts and leaves the base unchanged.
- **Push & open PR**, in the **▾** menu **More ways to finish**, pushes to `origin` and opens a pull request. It needs `gh`, the GitHub command line tool.
- **Finish name…** in the same menu, or **Finish this branch** in the chat's **More actions** menu, opens the Finish dialog.

In Finish, the **Ready?** list must pass: commits to land, everything committed, your checkout on the base with nothing uncommitted, and no conflict. Under **Land it**, pick **Merge, keeping each commit** or **Squash into one commit**, and leave **Then remove name, its worktree and branch** ticked or not. The button reads **Land on main**, or **Land anyway on main** when the merge gate holds it.

The plan and review checks apply in Finish, not to **Merge into main**: that button applies none of the gates and merges as soon as you confirm. See [Workflows](workflows.md).

An agent that works directly in your folder has no branch. **Code** then shows a note instead of **Changes** and **Files**.

## Preview

**Preview** shows web pages beside the chat:

- A dev server the agent started. Its page appears on its own when something answers at the address.
- A page file on your computer. HTML pages an agent opens in your browser also show here, unless you turned off **Open pages in the app preview** in Settings.
- A site on the internet.

To open something, type `5287` (for `localhost:5287`), `localhost:3000/app`, `example.com` or a path like `~/design/index.html` in the address bar, or pick from **Running now** and **Recent**. ⌘-click (Ctrl-click) a link in the chat to use your browser instead.

The first time a site on the internet opens, Preview asks **Open here** or **In my browser**. Pages there cannot reach your files or Agent World, use the camera, location or notifications, or download files.

The toolbar has **Back**, **Forward**, **Reload**, **Screen size** (**Desktop**, **Tablet**, **Mobile**), **Select element** (click something on the page to send it to the agent as words and a picture) and **Open in browser**.

## Terminal, Tools, Traces, History

- **Terminal** is the agent's own terminal; keys go straight to it. A selection offers **Add selection to message**.
- **Tools** lists MCP servers and plugins. Use **Add server**, **Remove**, **Enable**, **Disable** and **Uninstall** (click, then **Sure?**). It also holds **Project memory**, notes shared by every agent in the project.
- **Traces** lists messages agents sent each other. **Only name** narrows it to one agent.
- **History** in the top bar opens **Past conversations** for the open folder. Click one to continue it as a new agent.

Next: [Workflows](workflows.md)
