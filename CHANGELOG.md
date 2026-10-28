# Changelog

All notable changes to Agent World are listed here. The format follows [Keep a Changelog](https://keepachangelog.com), and the project follows [Semantic Versioning](https://semver.org) once it is past 1.0.

## [Unreleased]

## [0.6.3] - 2026-10-28

### Added

- Updates: Settings > Updates has a Stable row and a Beta row, each with its own Check and Download, so you choose whether to try a beta; installing a beta replaces the stable app you have.

![Settings, Updates, with the Stable row up to date and a beta ready to download](https://raw.githubusercontent.com/hodkep/agent-world/v0.6.3/docs/images/releases/0.6.3/beta-row.png)

### Fixed

- Chat: git graphs, mindmaps, timelines, Gantt charts and quadrant charts in a reply are drawn in readable colours on the dark theme.

![A git graph in a chat reply, drawn in readable colours](https://raw.githubusercontent.com/hodkep/agent-world/v0.6.3/docs/images/releases/0.6.3/git-graph.png)

- Todos: a task's Where it came from folds a long message on whole blocks, opens to all of it, scrolls a wide table sideways, and keeps 4000 characters.
- Todos: asking an agent to push, rebase or pull, even with details, no longer creates a to-do.

## [0.6.2] - 2026-10-28

### Added

- Accounts: the row for This computer, your own login, can be renamed like the others.

![Settings, Accounts, with the own login renamed to Laptop](https://raw.githubusercontent.com/hodkep/agent-world/v0.6.2/docs/images/releases/0.6.2/rename-own-login.png)

### Fixed

- Todos: opening a subtask on the Todos board brings its task's card into view with the subtask's line in gold.
- Chat: while an agent works, its group of steps says Thinking… between steps instead of going quiet.
- Terminal: the Terminal tab no longer opens with its text wrapped wrongly until the panel is resized.

## [0.6.1] - 2026-10-28

### Added

- Todos: the task you open on the Todos board is marked in its list, with its title in gold, and scrolled into view, out of a folded Done section or a quiet tile.
- Chat: your answer to a form shows as a card in the form's own words (the question, what you picked), with what the agent got folded under it, instead of raw JSON.
- Chat: a subtask's line in the office's todo row, and its `todo#N` chip in a reply, read `todo#2 › todo#3`, and a click on the first number opens the task it is part of.
- Release: the What's new dialog and the update popover show the pictures in a release's notes.

![The Todos board with the open task's card marked beside its panel](https://raw.githubusercontent.com/hodkep/agent-world/v0.6.1/docs/images/releases/0.6.1/open-card.png)

![A form in the chat and your answer under it as a card in words](https://raw.githubusercontent.com/hodkep/agent-world/v0.6.1/docs/images/releases/0.6.1/form-answer.png)

### Fixed

- Office: an agent that finishes while you are on another agent shows the green mark and a Finished tag on its tile.
- Office: agents that are waiting for you after finishing play carrom, fetch drinks and nap in the office, as idle ones do.

![The agents panel with a Finished tag on the tile of an agent that finished while you were on another](https://raw.githubusercontent.com/hodkep/agent-world/v0.6.1/docs/images/releases/0.6.1/finished-tile.png)

## [0.6.0] - 2026-10-27

### Added

- Notes: a Notes window stays above every other window (Option+Shift+Command+N), with live-preview Markdown notes and checklists, separate notes per project, and lines that become tasks and subtasks or are asked of an agent.
- Todos: a task can have subtasks, shown as a checklist on its card; tasks take labels you add, rename, recolour and remove; a task opens in a tidier tabbed view.
- Usage: a Tokens tab shows exactly where tokens went, with what the cache served, and the Weekly Rewind shows the week's rise or fall in tokens like cost.
- Office: the agent list marks which agents finished or need you, and the agent number counts them.
- Chat: `/btw` (a side question that does not interrupt the agent) shows in the command list for Claude agents, and its card answers in place.

### Changed

- Agents are asked to mark a task done once its change is pushed or tested, not when the code is first written.

### Fixed

- Chat: text copied from the chat pastes as clean markdown, with tables and lists kept.

## [0.5.1] - 2026-10-26

### Fixed

- Chat: text copied from the chat pastes cleanly into other apps, without the dark background and fonts.

## [0.5.0] - 2026-10-26

### Added

- Chat: agents draw diagrams and ask with forms in the chat on their own; click a diagram to open it large, zoom, pick boxes, notes or messages to ask about, and draw on it.
- Chat: the message box shows markdown as you type it, with the markers hidden except on the line the caret is in.
- Chat: **Restart agent** in the agent's "..." menu asks first, then starts the program again on the same conversation.
- Workflows: a workflow is drawn as a flow diagram, every step takes instructions, and a check, an audit or a pull request can wait for **Run**.
- Library: agents read the app's own guide from the Library when asked how to do something in the app.
- Shortcuts: Cmd+Alt+1 to 9 jump to the tabs of the side panel.
- Accounts: a signed-out login of this computer can be signed in from Settings > Accounts.

### Fixed

- Terminals: switching project shows only that project's terminals, and coming back finds them as you left them.
- Workflows: the agent behind the builder stays inside the builder, out of the agents list and the office.

## [0.4.0] - 2026-10-25

### Added

- Grid: a pane can show the agent's terminal instead of its chat, with a `>_` button in the pane header; each project remembers the choice for each pane.
- Chat: the list of commands an agent left running shows how long each has been running, with its program as a title, its process id, and a **Stop** that turns red.

### Changed

- Workflows: the pull request step waits for your approval, with buttons, before anything is pushed or the agent is asked to open it, and the workflow bar says what it is waiting for.
- Settings: the **Update address** setting is gone; the app looks for updates only at this project's releases on GitHub.

### Fixed

- Projects: a project whose folder is gone can be removed from the projects menu; its cross asks first, naming the agents that worked in it.
- Accounts: Claude Code counts as ready when one of your accounts is signed in, even if this computer's own login is not, and a dot on Settings and Accounts shows while a login needs signing in.

## [0.3.1] - 2026-10-25

### Changed

- Switching: pressing a tile of the switch bar switches to that agent or project.
- Office: the office is calmer, the office boy plays carrom until the supervisor comes, and the cat sits at the end of a desk.
- Office: a sign in words during a fire drill or a power cut, role labels on hover, lights at night and splashes in the rain.
- The app now runs on Electron 45, and its dependencies are updated.

### Fixed

- Chat: a code block's **Copy** writes the text as it was written, not its coloured form with the lines joined.
- Office: the weather moves on in real minutes however seldom the window is drawn, and rain is a short spell.
- Terminals: the drawer belongs to each project and stays closed in one that never opened it.
- Terminals: in a small window the drawer stops where the chat panel begins instead of running under it.

## [0.3.0] - 2026-10-22

### Added

- Remote control: a typed reply from a phone can answer an agent's plan, step, audit and held-push gates, but only when it comes from the agent's own program (off by default; agy's questions and file prompts show in the chat).
- Chat: ⌘⌥↓ (Ctrl+Alt+↓) jumps to the latest message, also from the message box.
- Switching: hold Ctrl+Tab or ⇧⌘[ ] to see a bar of agents or projects; each press steps on, letting go switches, Esc stays.
- Office: staff walk about, idle agents drink and play carrom, and the room follows the hour and the weather (**Office life** in Settings turns it off).

### Fixed

- Settings: **Switch all agents here** restarts three agents at a time and shows progress with **Stop after these**, so many agents no longer freeze the app.
- Chat: the Ask box over selected words stays inside the conversation, in the side panel and in a grid pane.
- Usage: asking for limits while a poll runs waits for it, so Usage is not empty.
- Shortcuts: the second column's first heading keeps its gap above it.
- Tests: four specs that failed at random are steady.

## [0.2.7] - 2026-10-21

### Added

- Workflows: while an agent's work is being audited, its chat shows a card saying so, with the number of commits and the seconds so far, and Set aside; it turns into the findings, or, for an audit that found nothing, into one line that goes away after a few seconds. Before, nothing showed until the audit had findings.

### Fixed

- Preview: the page of an agent that is asleep is kept too, so it stays loaded, as you left it, when you go to another tab or another project and back. Before, only an awake agent's page was kept, and an agent that has been idle starts asleep, so the page was usually lost.
- Tests: the fake chat agent keeps a message that is read together with the one before it, which dropped the second of two sent at once and made a chat spec fail at random.

## [0.2.6] - 2026-10-21

### Changed

- Office: the **Projects** panel (the project button) and the **Agents** panel (the agent number) list what was active last first. An agent is active when a turn starts or ends or when you send it a message; opening it does not count. The order is kept after a restart and does not move while a panel is open, and the number keys follow it, so 1 is the most recent.

### Fixed

- Preview: a page that has been opened stays loaded when you switch to another project and come back, as you left it, without reloading. At most three pages are kept loaded, counted across projects.
- Notifications: clicking the notice of an agent in another project opens that project with the agent selected, instead of showing the open project's agent list.
- Code: an agent working in a folder that is not a git repository now has its files listed in the Code tab, to open, edit and save, with no Changes tab (there is nothing to compare). Before it said there were no files to list. The folder is read directly, leaving out `.git`, `node_modules`, build folders and caches, up to 5,000 files, and `@` in the message box offers them too.
- Code: opening or saving a file in the Code tab no longer follows a link inside the folder that leads out of it (or leads nowhere): the file is refused, as a path that escapes the folder always was.
- Workflows: a pull request waits for the audit on every branch an agent pushes, not only its own: a branch at the audited commit goes through under any name, a branch with other commits is held, and a commit on any other branch of the agent's worktree is refused. The agent is told to open the pull request once the audit has passed.
- Workflows: starting a new task before the pull request of the last one is raised no longer re-gates the old work against the new task's plan. The audit, its findings and the push hold follow the run that owns the commits on the branch, not the agent's latest run.

## [0.2.5] - 2026-10-21

### Added

- Code: an **.html file** gets the same **Preview** / **Source** button a Markdown file has. Preview shows the file as the page it makes, as last saved, so its own stylesheet and pictures load; scripts run in a sandboxed frame that cannot reach the app, and Save refreshes it.
- Code: a **.pdf file** opened from the file tree shows as a PDF instead of unreadable text. It is never opened in the editor, so it cannot be overwritten, and **Open in Preview** sends it to the Preview tab.
- Right-click **Reveal in Finder**, for files and folders, wherever a path is shown: Files and Changes in the Code tab, open-file tabs, the Code and Terminal tabs (the agent's folder), file links and tool cards in the chat, the profile card, skills, projects, attachments, an account's folder, and a local file in Preview. A folder an agent names in chat is now a link too; a click reveals it.

### Fixed

- Grid: each project keeps its own view (office canvas or grid) and its own grid layout, also after you quit. Before, the choice was one setting for the whole app, so leaving one project on the canvas and putting another in grid mode brought the first back as a grid. A terminal cell whose shell ended with the earlier run opens a new shell.
- Office: a plan, approval, audit or push that waits for you in another project now counts in that project's tile in the project menu and in the red dot on the project button, as a permission does. Before, only the project you were in counted its workflow waits.
- Office: the small tag in the Workflow tab and the project lists is 10px, the documented micro size.

## [0.2.4] - 2026-10-21

### Changed

- Workflows: when a merge fails for a reason that is no conflict, such as no git identity, **Land** says what git said instead of "Merge conflict in some files".
- Chat: **⇧⌘L** (Ctrl+Shift+L) on words selected in a reply opens the same Ask box as the **Ask** button, instead of quoting them into the message at once.
- Development: the end-to-end specs of a pull request run on macOS 14, split over two Macs, where jobs start in seconds; the required check `test (macos-latest)` now fails when a job before it was abandoned (a job that never got a Mac), instead of passing. Vite is updated from 8.3.1 to 8.3.3.

### Fixed

- Chat: a message typed while its agent is still starting waits for the agent's input box instead of being lost, which left the chat on "Sending…" with the agent idle.
- Chat: scrolling up from the end of the conversation leaves it at once, so a row that changes size no longer pulls the view back and makes it flicker.
- Tests: specs that failed at random under load wait for what an agent makes (up to 45 seconds), the workflow builder spec waits for the agent's launch to be in the log, the fake chat agent reports that it has started, and three races inside the specs are closed.

## [0.2.3] - 2026-10-20

### Added

- Workflows: the **NOT LANDABLE** card has a **Move onto main** button. It moves the branch's own commits onto the base, keeping a backup branch; if a commit does not apply it stops and puts everything back, and **Undo** returns to the branch as it was.
- Workflows: the audit card shows one row per cause, with every file it covers, each answered by **Seen, fine**; an out-of-scope row also has **Add to plan**, which keeps it in scope for later audits of the run.
- Workflows: the builder's draft has a **Preview** under its steps: for each step what it will ask of you and where you stop, from the step kinds, so it follows your edits.
- Workflows: a request the agent announces while its run is open is an item of that run, not another run, so one job is one track, one audit and one pull request. The Workflow tab lists the items.
- Workflows: **Remove** on the built-in Standard (and **Restore Standard**) in the Workflows tab. A project with no workflow asks nothing of its agents: no task is recorded, nothing is held, no reminder is added and no run starts from a commit, the same as with workflows off.
- Chat: ⇧⌘L (Ctrl+Shift+L) adds the selected words, file text, terminal output or code to your message to the agent, wherever the Ask button shows. It does nothing without a selection.
- Grid: clicking an agent's name in a pane opens its profile card over that pane, with the same settings as everywhere else. Esc, a click elsewhere or the name again puts it away.
- Settings: an account is renamed by clicking its name in Settings > Accounts (Enter saves, Esc cancels). Only the label changes: the folder, the sign-in and the agents on it stay.
- Settings: **Switch all agents here** is always available and lets you choose which agents move, by project.

### Changed

- Workflows: the built-in **Standard** workflow ends in a new **Pull request** step instead of **Land**. Git's `pre-push` holds the push of the agent's branch until the plan is approved and the findings are seen (**Set aside** lifts it), and a push that goes through ends the run, so a run no longer waits for a merge the app never sees. A push that skips the hold with `--no-verify` is recorded as pushed anyway. Workflows you wrote keep their **Land** step.
- Updates: an installed app now looks for a newer version every three hours while it is open, not every six.
- Updates: a copy installed with Homebrew is no longer offered the in-app download. The update chip shows `brew upgrade --cask hodkep/tap/agent-world` with a Copy button, so Homebrew's own record of the version stays true.
- Development: on a pull request the quick checks (commit messages, typecheck, unit tests) run first on Linux, the end-to-end specs are split over four Macs, and a change to documents alone, or a draft pull request, skips the end-to-end run, behind the same required check.

### Fixed

- Two projects can each have an agent with the same name. A name only has to be free inside its project, and an agent writing to another by name reaches the one in its own project first.
- The Crew, History and Hire dialogs, and Subagents, are drawn outside the side panel, so they show in grid mode too, where the panel is hidden.
- Workflows: an agent kept showing AUDIT (or another wait) beside its name because of an older run whose findings nobody had answered, with nothing in the chat to answer them. Only an agent's latest run can wait for you now.
- Workflows: a push that goes through now really ends a run that ends in a pull request, as the agent is told; its own `task_done` afterwards is no error. **Set aside** followed by a push is recorded as pushed anyway, naming the review.
- Workflows: a held push lists the findings to answer, and the run story and the Workflow tab say what was added to the plan and how a push went through.
- Settings: after **Switch all agents here** the roster, the profile cards and the allowances showed the old accounts until the app was reloaded; they now follow as each agent is moved.
- A hook script that exits before its payload is written is no longer reported as an error (a test failed on Linux's faster exit).

## [0.2.2] - 2026-10-20

### Added

- Settings: **Switch all agents here** is always available and lets you choose the agents: they are listed by project with boxes, every agent not on the account is ticked to begin with, and one already on it can be ticked to restart on it.
### Changed

- Workflows: nothing sticks above the message box any more. The Finish band, which was always open whenever an agent had commits ahead of its base, and the Merge held band under the run track are replaced by one card at the end of the conversation: the audit's findings still to look at, a failed audit, or what holds the merge. It never shows while the agent works and never opens by itself. **All seen, fine** answers the findings at once; **Set aside** lifts what holds the merge and records the audit as not followed (the track, the Runs ledger and a line in the chat with **Undo**). The squash and "remove the agent after" options of the old band are gone from the chat; **Merge into main** and **Push & open PR** in the Code tab remain.

### Fixed

- Code: the line numbers of the old side in the Changes diff are shown in full, up to four digits; the right-most digit was hidden under the editor (lines 10 to 39 read as 1, 2, 3).
- Chat: a line break inside a list item or a paragraph of a reply shows as a line break, as in the Claude Code terminal (a line under a numbered item no longer joins the item's line); a blank line still starts a paragraph.
- Library: **Reached for** judges a rule on the prompts that looked related to it, not on every time the rulebook reminder named it (an agent is told to say nothing about a rule that does not apply, so most reminders could only end in silence). Each row shows how often it was reminded, the related prompts, how often it was read (any time later in that session, not only within 3 turns) and said no, and a verdict: most said no (make the "when" narrower), passed over in silence when it applies (make it firm or a step), fair, working, or too few to judge. Only whether a prompt looked related is kept, never the prompt.

## [0.2.1] - 2026-10-19

### Added

- Code: the diff on the Changes tab folds the unchanged code by default, with a row such as "49 hidden lines" for each stretch. **Unchanged code: Show | Fold** and **Context: 3 / 5 / 10** sit above the diff and are kept; ⌘⌥U (Ctrl+Alt+U) switches them, and **F1** has **Show all hidden lines**. Selecting code in a folded diff asks the agent about the real line numbers.
- Updates: Settings > Updates shows the version installed, with **What's new** (the notes of that version, from the changelog that now comes with the app) and **Check now**; the popover under the update chip shows what is new in the version offered (the release's own text, cleaned and with links that open in the browser) before **Download**; the first start after an update says so once with **See what's new** (remembered the moment it is shown; the first start and a downgrade say nothing). Every link in release notes shows the host it really goes to, and only https links work.
- Code: for an agent working in the folder itself the commits list shows every commit of the folder, a page at a time, with a line where the agent started and a search done by git.

### Changed

- Workflows: the agent's words in the plan gate, in a step's brief and in the Land band's plan block are read as in the chat: Markdown shows, an address is a link, and the path of a real file is a link that opens it (a page in the Preview).

### Fixed

- **Check now** is greyed, with the reason, from the moment an update download starts until the app restarts, and the app does not look again meanwhile, so it cannot start the same download over.
- A branch that shares no history with its base (after the base was rewritten) is no longer counted commit by commit with a green "No conflicts": Land says it does not come from the base's history, shows no count, and cannot be pressed.

## [0.2.0] - 2026-10-19

### Added

- Homebrew: `brew install --cask hodkep/tap/agent-world` installs the app, and the tap follows each release by itself. The cask removes macOS's quarantine mark from the app, so there is no Open Anyway step; that skips macOS's first-launch check for this app only.
- Chat: a question the agent asks has a **Cancel question** button, in the chat and in the pop-up, that declines it as Esc does in the terminal. A plan has a **Reject plan** button that does the same. If the program does not take the Esc, the card says so and **Answer in terminal** is still there.
- Chat: a line of the office's todo calls has a `todo#N` chip that opens the task on the Todos board, two clicks from the row instead of four. A task that is no longer on the board shows as removed.
- Workflows: the audit starts by itself, once per round, when the agent's steps before it have passed (it is one model call, so a run that commits again is not audited again by itself; **Run the audit now** does it), and it and Land are decided in a band in the agent's chat. **Finish this branch** and the Finish window are gone, and **Run the audit now** is there if it has not started.
- Workflows: whatever waits for you (a plan, check commands, an approval, audit findings, Land) shows as a pill beside the agent (PLAN, APPROVE, CHECK?, AUDIT, LAND), in the agent switcher and "others waiting", counts on the Workflows button, and the agent raises a hand in the office, as for a permission.

### Changed

- License: from this release the project is under the [Apache License 2.0](LICENSE) instead of MIT. It adds an explicit patent grant and says plainly that the license gives no right to the name or logo, which [TRADEMARK.md](TRADEMARK.md) now covers. Versions up to 0.1.2 were published under MIT and stay under it.

### Fixed

- Preview: a Preview that has been opened stays loaded when you go to another tab, so its page is not loaded again until the app is reloaded. The last three opened are kept, and one is let go when its agent sleeps.
- Workflows: a run the app starts from a commit (the agent never called `task_begin`) is grouped **Not announced**, not **Landed clean**; it belongs to the todo the agent is on, and a different todo starts a new run. An agent that sets a task to doing with `todo_update` now claims it, and each turn with no task open reminds the agent to call `task_begin`.
- Claude Code that is signed in and set up was shown as **Needs sign-in** (and signing in again changed nothing) on a Mac where `~/.claude/.claude.json` exists without the first-run flag. The flag is now looked for in every file Claude Code keeps, and any one saying the first questions were answered is enough. Its usage tanks on the lawn, which are drawn for ready programs only, came back with it.
- The Workflows window and its count list only the open project's runs.
- Every look the app takes at a repository (status, history, diffs) goes through the chosen git without git's optional locks, so a commit or add made at the same moment cannot fail with an `index.lock`.
- An agent that works in your folder directly is no longer refused a name because an old `aw/<name>` branch exists (it makes no branch), and its Code tab lists what is uncommitted in the folder, with staging, commit and discard, and the commits made since it was hired, instead of saying there is nothing to show.

## [0.1.2] - 2026-10-18

### Added

- Updates: a Mac build without a Developer ID can download a newer version and install it from inside the app. The chip in the top bar opens a popover with **Download**, a progress bar, the checks it passed, and **Install and restart**; Settings > Updates shows the same. The file comes only from this project's GitHub release and is kept only if its size and sha512 match the published ones; the new app is checked (identity, version, signature) before it replaces the old one, which is put back if anything fails. Where the app cannot replace itself it says why and keeps the download.

## [0.1.1] - 2026-10-18

### Added

- Workflows: the builder's draft can be edited in place. Names, briefs, skills, a check's command, its tries and gate, and the steps themselves can be changed, moved, removed and added, with **Undo edits**, and saving waits until the checker is satisfied.
- Workflows: **Edit with the builder** starts a fresh chat with a saved workflow as the draft. Every save through the builder is written down, shown as **History** under the workflow, and readable by the builder with the new read-only tool `workflow_history`.
- Workflows: a run belongs to the todo its agent is on. The Runs ledger shows the task, the task says how its run stands and opens it, finishing the run finishes the task, and the builder's own chats are no longer tracked as requests.
- Workflows: a plan with no open questions says the agent asked none, and a note for the agent can be sent with the approval.
- Guide: pages and pictures for the builder's draft and for a task with its run.

### Fixed

- Workflows: an agent is told once that a check waits for your approval, not on every step report, until you answer or the workflow file changes.
- Workflows: a follow-up round reads the workflow file again and takes a changed copy, so an edited file's commands are asked about again.
- Workflows: agents are told a workflow's description covers a task only when it covers all of it, so copy changes are not read to cover new code.
- Chat: a long conversation no longer loses its end on a slow machine, and a jump to one of your messages settles where it should. Alt+Up from the end of a conversation goes to your last message.
- Release: the installers are named `Agent-World-<version>-<arch>`, with hyphens, so the file on GitHub, the one a build makes and the ones the docs name are the same.

### Security

- `dompurify`, `katex`, `lodash-es` and `source-map-js` are held to their patched versions, including the copies that monaco, mermaid and vite bring in.
- The CI workflow's token can only read the repository.

## [0.1.0] - 2026-10-16

The first public release.

### Added

- A pixel-art IT office where each project is a floor and each agent is a character with its own git worktree and a real, interactive Claude Code or Antigravity (`agy`) session that the app owns. What an agent is doing (thinking, running, waiting for you, asleep) shows at a glance.
- For each agent: a chat built from the saved conversation (tool cards, pictures, queued messages, rewind, `/btw` side questions, history search), the real terminal, a code and diff view, a Tools tab, and a Preview tab for the dev servers and pages an agent starts: local servers, local html files and sites on the internet, which it asks about once.
- Permission requests, plans, questions and folder trust from the agents are answered in the office or the chat.
- Hiring agents from roles, groups, clones, hand-offs for review, and subagents shown as interns.
- A shared library of skills, instructions and prompts, and a playbook that says when an agent should reach for each of them. The rulebook is given to the agent, which decides what applies; what it read and passed over is shown.
- Workflows, with checks, an audit and a run track, a todo board the agents and you share, and usage limits shown as the power plant.
- Installers for macOS (Apple silicon and Intel), and update checks against the project's GitHub releases (or an address set in Settings).

### Notes

- The macOS build is signed ad hoc, so the first launch needs approval: see [INSTALL.md](INSTALL.md).
- Not affiliated with Anthropic or Google: see [NOTICE.md](NOTICE.md).

[Unreleased]: ../../compare/v0.6.0...HEAD
[0.6.0]: ../../compare/v0.5.1...v0.6.0
[0.5.1]: ../../compare/v0.5.0...v0.5.1
[0.5.0]: ../../compare/v0.4.0...v0.5.0
[0.4.0]: ../../compare/v0.3.1...v0.4.0
[0.3.1]: ../../compare/v0.3.0...v0.3.1
[0.3.0]: ../../compare/v0.2.7...v0.3.0
[0.2.7]: ../../compare/v0.2.6...v0.2.7
[0.2.6]: ../../compare/v0.2.5...v0.2.6
[0.2.5]: ../../compare/v0.2.4...v0.2.5
[0.2.4]: ../../compare/v0.2.3...v0.2.4
[0.2.3]: ../../compare/v0.2.2...v0.2.3
[0.2.2]: ../../compare/v0.2.1...v0.2.2
[0.2.1]: ../../compare/v0.2.0...v0.2.1
[0.2.0]: ../../compare/v0.1.2...v0.2.0
[0.1.2]: ../../compare/v0.1.1...v0.1.2
[0.1.1]: ../../compare/v0.1.0...v0.1.1
[0.1.0]: ../../releases/tag/v0.1.0
