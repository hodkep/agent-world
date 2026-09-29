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
- Worktrees live in `~/.agent-world/worktrees/<repo-slug>/<agent>` on branch `aw/<agent>`. Non-git folders allow several agents sharing files, with a warning.
- Permission requests are decided in the world; after 5 minutes they fall back to Claude's own terminal dialog.
- On restart agents are asleep; clicking one resumes its session.

## Capabilities and Constraints

- Claude Code only in v1; other agent CLIs later.
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
