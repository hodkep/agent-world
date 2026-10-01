# Agent World: product spec

## What it is
A desktop app (Electron) where each Claude Code session is an agent working at a desk in a 16px pixel-art office. Where an agent stands and what it does shows its state at a glance, and the side panel is where you talk to it.

## Who it is for
One developer running several coding agents at once, each in its own git worktree and branch, who wants to see who needs them without reading terminals.

## What it does
- Hire agents (a model, a mode, standing instructions, a role) in the folder you are working in; each gets a worktree and a branch unless it works in place.
- Show every agent's activity in the office, and what needs you (permission, plan, question) as a card in the chat.
- Chat with an agent (typing into its real terminal), or use the raw terminal; browse its changes, edit files, commit and merge.
- Hand work between agents (review, clone onto another model), keep shared notes across agents.
- Track usage: context, the 5-hour and weekly limits, cost.
- Per-folder crews: the agents shown are the ones hired in the open folder.

## Constraints
- Local only: it drives the user's own signed-in `claude`; no accounts, no server.
- The pixel-art world is drawn in code (Pixi.js), no image assets. The shell follows DESIGN.md.
- Agents never see each other's terminals; they talk through the app's messaging tool.
- Anything an agent starts is the user's to stop; on quit the app stops it and saves unfinished work to the agent's branch.

## Not goals
Multi-user collaboration, a hosted version, replacing the terminal for people who prefer it.
