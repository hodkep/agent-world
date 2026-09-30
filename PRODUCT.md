# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Electron desktop app (Chromium renderer) for macOS, Linux and Windows.

## Users

A solo developer running several Claude Code agents in parallel across their own repositories, who wants to see at a glance what each agent is doing and step in (approve, answer, redirect) without hunting through terminal tabs.

## Product Purpose

Run and steer coding agents from one place, shown as characters working in a pixel-art IT office. Each repo is an office floor; each agent is a character with its own git worktree and a real `claude` terminal. Success: the user can tell every agent's state in one glance and approve a permission request from the world in one click.

## Positioning

Existing pixel visualizers (Pixel Agents, claude-office) only watch; existing orchestrators (Claude Squad, Conductor) are plain dashboards. This product owns the sessions it shows: it launches the agents, isolates them in worktrees, and answers their permission prompts from the world.

## Operating Context

- The user signs in to their own unmodified `claude` CLI (their subscription or API key). The app never handles Claude credentials.
- Agents launched by the app get hooks through a per-session `--settings` file; nothing global in `~/.claude` is changed.
- Worktrees live in `~/.agent-world/worktrees/<repo-slug>/<agent>` on branch `aw/<agent>`. A quick fix can skip the worktree ("Work in my folder directly"), and non-git folders always work in place; several agents sharing a folder can overwrite each other. Removing an agent deletes its worktree only when nothing is uncommitted (or on an explicit discard), and its branch only when nothing on it is unmerged.
- Every agent is the user's own interactive `claude` running in a terminal the app owns. The chat view is built on Claude's saved transcript plus that terminal; the app never uses the Agent SDK or `claude -p`, so usage stays on the subscription's normal limits.
- Preferences (notifications, keep-awake, new-agent defaults, where `claude` is, update address) are kept in `~/.agent-world/preferences.json`.
- Permission requests are decided in the world; after 5 minutes they fall back to Claude's own terminal dialog.
- On restart agents are asleep; clicking one resumes its session.

## Capabilities and Constraints

- Claude Code only in v1; other agent CLIs later.
- Interfaces per agent: the office (state at a glance), Chat (conversation, tool cards, pictures, `!` shell mode, permission modes, rewind, `/btw` side questions, Ctrl+R history, queued messages), Terminal, Code (files and diffs), Tools (MCP servers and plugins: add, remove, enable), Preview (a dev server the agent started) and History (resume an earlier session).
- Anything Claude asks the user (tool approval, plan, folder trust, questions, its own menus) appears in an 8-bit dialog or inline in the chat, and comes back after a window reload.
- Agents are hired from roles (built-in, saved, or a project's `.claude/agents`), can be grouped, cloned, and handed to another agent for review; commands started by an agent can be listed and stopped from the chat.
- Usage limits (5-hour, weekly) are shown as the power plant in the office and as chips in the header.
- Shipping: installers for macOS, Windows and Linux through electron-builder (unsigned until signing certificates are provided), update checks against an address set in Settings, and a three-platform CI workflow. Windows and Linux runs are covered by that workflow, not yet by hand.
- Roles are dynamic: an agent is a senior; while it has live subagents it is the boss; subagents are interns.
- Activities shown: idle, thinking, researching, implementing, running, delegating, waiting, permission, asleep.
- No external art assets in v1: all pixel art is generated in code (no downloads, no license questions). Cosmetic upgrades and themes come later.
- Undecided: product brand name (code name `agent-world`); the name must not include "Claude" or "Anthropic".

## Brand Commitments

- Theme: IT / engineering office.
- Visual reference supplied by the user: a top-down 16px pixel office with a wood-plank workroom, a back wall with bookshelves, a clock and hanging plants, CRT desks, a meeting table, a blue-floored lounge with sofas and framed pictures, and a checker-floor kitchen, with dark wall outlines between rooms.

## Evidence on Hand

No real users, testimonials or benchmarks exist; none may be invented.

## Product Principles

1. Control over spectacle: every visual state maps to a real agent state the user can act on.
2. Own the session, don't scrape it: prefer launching and hooking agents over reading local files.
3. Never lose work: uncommitted changes block removal; nothing is deleted silently.
4. Nothing global, nothing hidden: no changes to the user's Claude config, no credentials touched.

## Accessibility & Inclusion

Every world action (select an agent, approve, deny, wake, remove) must also be reachable from the side panel with a keyboard.
