# Changelog

All notable changes to Agent World are listed here. The format follows [Keep a Changelog](https://keepachangelog.com), and the project follows [Semantic Versioning](https://semver.org) once it is past 1.0.

## [0.1.0] - 2026-10-16

The first public release.

### Added

- A pixel-art IT office where each project is a floor and each agent is a character with its own git worktree and a real, interactive Claude Code or Antigravity (`agy`) session that the app owns. What an agent is doing (thinking, running, waiting for you, asleep) shows at a glance.
- For each agent: a chat built from the saved conversation (tool cards, pictures, queued messages, rewind, `/btw` side questions, history search), the real terminal, a code and diff view, a Tools tab, and a Preview tab for the dev servers and pages an agent starts: local servers, local html files and sites on the internet, which it asks about once.
- Permission requests, plans, questions and folder trust from the agents are answered in the office or the chat.
- Hiring agents from roles, groups, clones, hand-offs for review, and subagents shown as interns.
- A shared library of skills, instructions and prompts, and a playbook that says when an agent should reach for each of them. The rulebook is given to the agent, which decides what applies; what it read and passed over is shown.
- Workflows, with checks, an audit and a run track, a todo board the agents and you share, and usage limits shown as the power plant.
- Installers for macOS, experimental Windows and Linux builds that have not been run by hand, and update checks against the project's GitHub releases (or an address set in Settings).

### Notes

- The macOS build is signed ad hoc, so the first launch needs approval: see [INSTALL.md](INSTALL.md).
- Not affiliated with Anthropic or Google: see [NOTICE.md](NOTICE.md).

[0.1.0]: ../../releases/tag/v0.1.0
