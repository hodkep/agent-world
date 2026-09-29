---
version: 1
slug: "src-renderer-world-world-ts"
primary_target: "src/renderer/world/World.ts"
related_targets: ["src/renderer/App.tsx","src/renderer/styles.css"]
---

Scope: the office world (Pixi canvas) plus the app shell around it. Mode: Operate.
Audience/job: solo developer watching and steering several Claude Code agents; must read every agent's state at a glance and act (approve, open terminal) in one click.
Constraints: no external art assets; integer device-pixel scaling; every world action also reachable from the side panel.

## Direction contract
THESIS: A living engineering office where place = state; refuses the dashboard grid of status cards.
OWN-WORLD: 16px top-down pixel office from the user's reference: wood-plank workroom, navy back wall with bookshelves, clock, kanban board, vines; CRT desks; meeting table with laptops; server closet with blinking racks; blue-carpet lounge with raspberry sofas and framed pictures; checker kitchen. Thick near-black room outlines.
STORY: Seniors work at CRT desks, walk to server racks to run commands, grab coffee while waiting for you, rest on sofas when done; bosses (crown + suit) stand at the meeting table while interns (cap + lanyard) work on laptops.
FIRST VIEWPORT: whole office fills the stage at integer scale; side panel (permission queue, agent header, terminal) on the right, collapsible.
FORM: user-pinned, corroborated: the user wrote "we need some good world UI like this" and attached the reference office image; a pinned direction beats the roll, so no seed key.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
