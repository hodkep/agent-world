# .okf: the project's open knowledge folder

Plain Markdown, no tooling. `spec.md` is the product spec; add other `.md` files here for decisions or background an agent should know.

- Agents are given one line saying `spec.md` holds the product specification; they open it only when someone asks about the product. It is never loaded into their context up front.
- Agent World never lists it in the Code tab, in changes or in @-mentions: it is for agents, not for the people using the app.
- It is committed with the project, so every worktree has it.
