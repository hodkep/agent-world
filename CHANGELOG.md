# Changelog

All notable changes to Agent World are listed here. The format follows [Keep a Changelog](https://keepachangelog.com), and the project follows [Semantic Versioning](https://semver.org) once it is past 1.0.

## [Unreleased]

### Added

- Homebrew: `brew install --cask hodkep/tap/agent-world` installs the app, and the tap follows each release by itself. The cask removes macOS's quarantine mark from the app, so there is no Open Anyway step; that skips macOS's first-launch check for this app only.

### Changed

- License: from the next release the project is under the [Apache License 2.0](LICENSE) instead of MIT. It adds an explicit patent grant and says plainly that the license gives no right to the name or logo, which [TRADEMARK.md](TRADEMARK.md) now covers. Versions up to 0.1.2 were published under MIT and stay under it.

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

[Unreleased]: ../../compare/v0.1.2...HEAD
[0.1.2]: ../../compare/v0.1.1...v0.1.2
[0.1.1]: ../../compare/v0.1.0...v0.1.1
[0.1.0]: ../../releases/tag/v0.1.0
