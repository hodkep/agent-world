# Changelog

All notable changes to Agent World are listed here. The format follows [Keep a Changelog](https://keepachangelog.com), and the project follows [Semantic Versioning](https://semver.org) once it is past 1.0.

## [Unreleased]

### Fixed

- Workflows: an agent kept showing AUDIT (or another wait) beside its name because of an older run whose findings nobody had answered, with nothing in the chat to answer them. Only an agent's latest run can wait for you now.

## [0.2.2] - 2026-10-20

### Added

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

[Unreleased]: ../../compare/v0.2.2...HEAD
[0.2.2]: ../../compare/v0.2.1...v0.2.2
[0.2.1]: ../../compare/v0.2.0...v0.2.1
[0.2.0]: ../../compare/v0.1.2...v0.2.0
[0.1.2]: ../../compare/v0.1.1...v0.1.2
[0.1.1]: ../../compare/v0.1.0...v0.1.1
[0.1.0]: ../../releases/tag/v0.1.0
