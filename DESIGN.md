---
name: agent-world
description: A 16px pixel-art engineering office where each coding agent's place shows its state.
colors:
  night-bg: "#12101a"
  panel: "#1a1726"
  panel-raised: "#221e33"
  navy-line: "#2c3350"
  rim-ink: "#08070c"
  text: "#e4e4ee"
  muted: "#a4a2b8"
  brass: "#f2c230"
  wood: "#8e5b34"
  alarm-red: "#d83a3a"
  work-green: "#5f9e5f"
  think-cyan: "#6ad0e0"
  select-gold: "#ffe066"
  object-ink: "#14111c"
  figure-ink: "#1a1522"
  wall-navy: "#2c3350"
  wall-trim: "#3c4568"
  plank-a: "#8e5b34"
  plank-b: "#87552f"
  plank-c: "#94613a"
  plank-seam: "#6a4124"
  lounge-carpet: "#4a6a96"
  check-light: "#e4e4ec"
  check-dark: "#26262f"
  server-floor: "#3a3f4d"
  desk-top: "#c68e57"
  crt-shell: "#d9d5c8"
  raspberry-sofa: "#b03f5e"
  leaf: "#3f8f4f"
  rack: "#2a2e39"
  bubble-paper: "#f6f6fa"
  panel-hover: "#2c2742"
  brass-hot: "#f8d04c"
  alarm-hot: "#e65050"
  work-green-text: "#9fdc9f"
  dim: "#4a4860"
  alarm-well: "#2a1620"
  brass-dim: "#5a4c1e"
  track: "#2a2640"
  danger-text: "#ff8a8a"
  shadow-scrim: "#00000080"
  shadow-inset: "#00000066"
  bevel-light: "#ffffff59"
  you-violet: "#b38bff"
typography:
  wordmark:
    fontFamily: "agent-world 3x5 bitmap (procedural, pixelfont.ts)"
    fontSize: "15px (5px glyph x3)"
    lineHeight: 0
  world-label:
    fontFamily: "agent-world 3x5 bitmap (procedural, pixelfont.ts)"
    fontSize: "5 art pixels"
    lineHeight: "7 art pixels"
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "13px"
    fontWeight: 400
  title:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "13px"
    fontWeight: 600
  mono:
    fontFamily: "Menlo, Consolas, monospace"
    fontSize: "12px"
  micro:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "10px"
    letterSpacing: "0.1em"
  lead:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "14px"
  heading-1:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "16px"
  heading-2:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "15px"
  label:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "11px"
    letterSpacing: "0.08em"
rounded:
  none: "0px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  tile: "16px"
components:
  button:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
    padding: "4px 10px"
  button-hover:
    backgroundColor: "#2c2742"
  button-primary:
    backgroundColor: "{colors.brass}"
    textColor: "{colors.rim-ink}"
    rounded: "{rounded.none}"
    padding: "4px 10px"
  button-primary-hover:
    backgroundColor: "#f8d04c"
  button-danger:
    backgroundColor: "{colors.alarm-red}"
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
    padding: "4px 10px"
  agent-row:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
    padding: "5px 8px"
  agent-row-selected:
    backgroundColor: "#2e2a18"
  permission-band:
    backgroundColor: "#2a1620"
    textColor: "{colors.text}"
    padding: "10px 12px"
  name-tag:
    backgroundColor: "#0c0a12"
    textColor: "{colors.text}"
    height: "7 art pixels"
---

# Design System: agent-world

## Overview

**Creative North Star: "The Night-Shift Office"**

A top-down 16px pixel office seen after dark: wood-plank workroom under a navy back wall, CRT desks, a meeting table, a server closet with blinking racks, a blue-carpet lounge with raspberry sofas, a checker kitchen, all inked with thick near-black room outlines and set in a grass-and-road exterior. Every pixel is drawn in code; nothing is a raster asset. The world is the interface: where a character stands, what its screen shows and what floats over its head are the agent's state.

The app shell around the canvas is lifted from the same building. Its surfaces are the night sky and navy wall, its accent is the brass of the boss's crown and the wordmark, its edges are the same 2px ink rim the rooms wear. The shell is quiet and dense so the office carries the colour; it never becomes a dashboard of status cards.

**Key Characteristics:**
- Place = state: activity is read from location, screen animation and bubble, not from badges.
- Integer device-pixel scaling; every art pixel is the same size on every screen.
- One 16px tile grid; characters are 16x24 sprites standing with feet on the tile's bottom edge.
- One bitmap font (3x5, 5 wide for m/n/w) shared by world labels and the shell wordmark.
- Hard ink outlines everywhere: 1px on objects and figures, 2px on rooms and shell chrome.
- Zero radius, zero gradients, stepped (never eased) animation.

## Colors

A night-dark neutral field with warm wood and brass, and a small set of state colours that mean the same thing in the world and in the panel.

### Primary
- **Crown Brass** (brass): the single accent. Primary buttons, the wordmark, role labels in the panel, the boss's crown and gold name tag, focus outlines and text selection. It marks "the one thing to act on or the one in charge".

### Secondary
- **Selection Gold** (select-gold): the selected character only: the pulsing bracket at its feet, the idle chevron above it, its name tag text. Brighter and paler than brass so selection never reads as rank.

### Tertiary (state colours)
- **Alarm Red** (alarm-red): permission requests. The blinking roster dot, the red/amber flashing monitor, the red bubble; the danger button (discard work).
- **Work Green** (work-green): implementing, running, researching dots in the roster.
- **Think Cyan** (think-cyan): thinking and delegating dots; also a trace colour on implementing and delegating screens.
- **You Violet** (you-violet): what is yours: the dot on a todo you made, your messages in a mail thread, and work you scheduled. Never a state colour.

### Neutral
- **Night** (night-bg): canvas and app background, the sky behind the office.
- **Panel / Panel Raised** (panel, panel-raised): header and side panel; buttons and roster rows sit one step up.
- **Navy Line** (navy-line): scrollbars and the only non-ink line; it is the office's back-wall navy.
- **Rim Ink** (rim-ink): every 2px shell border, room outlines, and text on brass.
- **Object Ink / Figure Ink** (object-ink, figure-ink): the 1px rim on furniture (`box()` in furniture.ts) and on character sprites; bubble frames use object ink.
- **Text / Muted** (text, muted): primary copy; activity strings, detail lines, hints.

### World materials
The building palette `P` in furniture.ts is the single source for room materials: three alternating plank tones with a darker seam (plank-a/b/c, plank-seam), wall navy with a lighter trim and darker base, dotted lounge carpet, light/dark kitchen checker, a dotted server tile floor, desk wood, off-white CRT shells, raspberry sofas, three-tone leaves, dark racks. Book spines use a fixed nine-colour set. Characters draw from seeded tables (9 hair, 5 skin, 7 hoodie, 3 suit, 5 tee) with shade factors (0.72 hair, 0.84 skin, 0.74 cloth) for the second tone.

### Interaction tints and scrims
Hover and state shades are named, not improvised: Panel Hover (a raised button under the pointer), Crown Brass Hot and Alarm Hot (primary and danger buttons under the pointer), Work Green Text (green copy on dark: added lines, success), Danger Text (red copy on dark), Dim (an asleep dot, an empty track), Alarm Well (the recessed red behind a permission band), Brass Dim (the thin rim inside a sent message) and Track (the unfilled part of the usage ring). Shadows use Shadow Scrim (pop-ups and dialogs), Shadow Inset (the recessed message box) and Bevel Light (the top highlight on the send button).

### Named Rules
**The One Building Rule.** Every room colour comes from the one `P` palette, and the shell's neutrals are taken from it (night, navy wall, wood, brass). A new room or panel adds to `P` or `:root`; it never brings its own hexes.

**The Same Meaning Rule.** A state colour means the same state in the world and the panel: red is permission in the roster dot, the bubble and the monitor. Never reuse alarm red for decoration.

## Typography

**Display Font:** agent-world bitmap font (pixelfont.ts), drawn at integer scale with `image-rendering: pixelated`
**Body Font:** system UI sans (ui-sans-serif, system-ui, -apple-system, Segoe UI)
**Label/Mono Font:** Menlo, Consolas, monospace

**Character:** The bitmap font is the world's voice: lower-case input rendered as blocky 3x5 caps, so name tags scale with the office and the wordmark reads as part of the building. The shell uses the platform sans at one small size so it stays out of the art's way; mono carries anything that came from a terminal.

### Hierarchy
- **Wordmark** (bitmap, 5px glyph at 3x): "agent world" in brass in the header. Built through `PixelWord`, never a web font.
- **World label** (bitmap, 5 art px on a 7px tag): character names, max 12 characters, on a 0.82-alpha near-black tag; text colour is role-coded (boss brass, selected gold, others text).
- **Title** (600, 13px): agent names in the roster and panel head.
- **Body** (400, 13px): panel copy, buttons (primary buttons 700).
- **Mono** (12px): activity strings, branch, tool detail, git status; single-line with ellipsis.
- **Label** (11px, 0.08em, uppercase, brass): the agent's live role (senior / boss / intern) beside its name.

### Named Rules
**The One Font Rule.** Any text drawn inside the world, or any display text in the shell, uses the bitmap font at integer scale. No anti-aliased type on the canvas.

**The Live Label Rule.** The uppercase brass label only ever carries a live data value (the agent's role). It is not a section heading or eyebrow.

## Layout

The window is a header bar, then a row of stage and side panel. The stage takes all remaining width; the panel is `min(38vw, 560px)` wide, collapses from a header toggle, and is forced open (toggle disabled) while any permission request is pending.

The world is built on a 16px tile map (office.ts), with a 24-tile exterior margin of grass, sidewalk and road. Default scale is the largest integer multiple of device pixels at which the whole office fits the stage; the wheel steps zoom by whole integers from 2 to 8; drag pans (4px threshold so a pan is never a click), clamped so the building's centre stays on screen. Root position is rounded to device pixels.

Shell spacing is small and dense: 4px gaps in the roster, 8px between controls, 10-12px section padding. The roster row is a fixed grid (10px dot, name, role, 96px activity).

**The Integer Pixel Rule.** Scale is an integer in device pixels, divided by devicePixelRatio for layout; textures use nearest filtering and antialias is off. Never fractional-scale the art.

**The Place Is State Rule.** Activity picks the spot (`purposeFor` in World.ts): running goes to the server consoles; interns work at the meeting-table laptops; waiting goes to the coffee machine; idle and asleep go to the lounge sofas; delegating stands at the head of the meeting table; everything else (thinking, researching, implementing, permission) sits at the agent's own CRT desk. Desk and intern seats are permanent homes; other spots are borrowed and released. New agents enter through the front door; leaving agents walk out of it.

## Elevation & Depth

Flat, with pixel depth only. Depth in the world comes from y-sorting (a character's zIndex is its y + 8), the dark ink rim on every object, and small hard-edged black drop shadows: 0.22 alpha under furniture, 0.4 / 0.25 under standing characters (none when seated). Overlays (bubbles, tags, selection marker) sit in a layer above the whole office.

In the shell, depth is a 2px inset bevel on buttons, never a cast shadow.

### Shadow Vocabulary
- **Button bevel** (`box-shadow: inset 0 2px 0 rgb(255 255 255 / 0.06), inset 0 -2px 0 rgb(0 0 0 / 0.25)`): every shell button at rest.
- **Button pressed** (`box-shadow: inset 0 2px 0 rgb(0 0 0 / 0.3)`): active state.
- **Dot rim** (`box-shadow: 0 0 0 2px var(--ink)`): the roster state dot.

### Named Rules
**The Inked Edge Rule.** Every drawn object gets a 1px dark rim and every room a 2px one; that rim is what keeps things legible at 2-3x. Shell chrome follows it with 2px rim-ink borders.

## Shapes

Everything is square. Shell radius is 0 on buttons, rows and panels; the state dot is an 8px square; the world has no curves beyond what pixels make. Borders are 2px rim ink between header, panel sections and stage. Focus is a 2px brass outline offset 2px.

## Components

### Buttons
Chunky, pressable, square.
- **Shape:** square (0px), 2px rim-ink border, inset bevel.
- **Default:** panel-raised fill, text colour, 4px 10px padding.
- **Primary:** brass fill, ink text, bold. One per context (+ Agent, Approve).
- **Danger:** alarm-red fill; reserved for destroying work (Discard changes).
- **Hover / Active / Focus / Disabled:** lighter fill; pressed bevel; 2px brass outline at 2px offset; 0.45 opacity.

### Roster rows
- **Style:** full-width buttons in a 4px-gap list; state dot, bold name, brass role label, mono activity.
- **Selected:** dark brass-tinted fill with brass border (`aria-pressed`).
- **State dot:** coloured by activity; permission blinks with `steps(2)` at 0.6s and stops under reduced motion.

### Permission band
The top of the side panel while requests exist: a dark wine band (#2a1620), each request as "name wants tool" with mono detail and Approve (primary) / Deny.

### Characters
16x24 sprites composed from string layers (head, torso, legs; hair style by key hash). Views front/back/side (side mirrored), poses stand/walk1/walk2/sit. Role markers stamp over the base: seniors wear a hoodie with the hood gathered at the neck; the boss wears a gold crown on a dark band plus a suit with a red tie; interns wear a blue cap, a tee and a lanyard badge. Palette is seeded from the agent key so repeated names still look different. Animation is stepped: walk frames every 130ms at 5 tiles/s, 1px breathing every 700ms, blink every 4s, elbows typing at the desk (researching slower than implementing), a waving arm on permission.

### Bubbles and name tags
- **Bubble:** 13x10 paper box with an ink frame and tail, holding a 7x5 ink icon per activity; bobs 1px; hidden when idle. Permission flips red/pink with a white or red "!".
- **Name tag:** under the feet, bitmap label on a translucent ink plate, role-coded colour.
- **De-overlap:** tags are pushed down and bubbles up (greedy `spread`, max 6 steps) until none covers another or any tag; a bubble pushed up draws a dotted leader back to its head.
- **Selection:** a pulsing gold bracket at the feet (never on a neighbour), plus a bouncing chevron when the character is idle.

### Monitors
Each desk CRT animates the state of whoever sits at it: dark when empty or asleep, a blinking cursor for thinking, scrolling coloured code for implementing, fast green lines for running, grey-on-white for researching, a small org chart for delegating, flashing red/amber "!" for permission.

## Do's and Don'ts

### Do:
- **Do** draw every new asset in code on the 16px grid, with a 1px ink rim, from the `P` palette.
- **Do** map every new visual state to a real agent state and a place in the office, and mirror it in the side panel.
- **Do** keep scale integer in device pixels and filtering nearest.
- **Do** render world text and display text with the bitmap font.
- **Do** keep shell chrome to 2px rim-ink borders, 0 radius and the inset bevel.
- **Do** step animations (frame swaps, `steps()`), and stop blinking under reduced motion.

### Don't:
- **Don't** show agent state as a grid of status cards or badges; it lives in the office.
- **Don't** import raster art, sprite sheets or icon fonts.
- **Don't** round corners, add gradients, or use soft cast shadows in the shell.
- **Don't** use alarm red or brass for decoration; they mean permission and primary/rank.
- **Don't** let a tag or bubble cover another; route new overlays through `spread`.
- **Don't** hide the permission queue behind a collapsed panel.

## Surfaces added after the office

These reuse the office's tokens (panel, panel-raised, rim-ink, brass, think-cyan) and its square corners; none introduces a new colour except the permission-mode colours below.

- **Chat**: user messages right-aligned on panel-raised, assistant text on night-bg, tool calls as bordered cards that fold, code blocks coloured by Monaco. The composer stays at full height at any window size; the log gives way first. Cards above the composer (running processes, `/btw` side question, waiting questions) share one bordered, 6px-margin style.
- **8-bit dialog**: the same box for approvals, plans, trust, questions (one page each, then Review) and Claude's own menus; opens from the blinking marker or inline in the chat.
- **Permission modes**: each mode has one colour and a 5x5 glyph (Ask first grey, Edit automatically gold, Plan cyan, Auto orange, Don't ask purple, Bypass red). The colour appears on the composer chip, the roster and the character's name tag.
- **Stamps and the track** (chat, and later the Workflows window): the office's own calls are a **row for each area** (workflow brass, todos green, library think-cyan, notes orange), each with the area's name in small caps, its outline icon and one line of words saying what was done there, so a todo and a workflow call are never told as one thing; a click opens a line for each call (a coloured icon tile, the verb in bold, the detail), and a click on a line shows what it brought back with the call's own card behind "Call details". The workflow says *run* where a todo says *task*. A failed call counts in red on its row. An open run is a track above the chat: its steps as square stations on a rail (green met, brass where it stands, amber met after trouble, red failed), the agent drawn as the same character the office shows standing on its station, and a paper speech bubble when the run waits on the person. The pictures are the chat's own icons (book, tick, pencil, flag, magnifier, tools, cross) and the agent figure is drawn from a small bitmap in code; nothing is an image. A failed call is never a card.
- **A held merge**: when git holds an agent's merge into the base branch, the run track gets a brass marker ("Land held", muted "Land held · not yet" once the person put the band away; clicking it brings the band back) and the band sits directly under the track in the chat: "Merge held" in small brass caps with `branch → base`, what holds it, the review's findings each with a square tick for seen, and Land anyway (brass) beside Not yet (ghost). No separate panel and no dialog. The agent's Workflow tab shows the same marker text in the track's bubble.
- **Runs ledger and tiles** (Workflows window): the Runs tab is quiet, in the app's greys. Two charts on top: a thin bar for each workflow with a small column for each day (how often it was invoked), and a bar for each stage (plan, checks, review, landing) split into followed first time, after trouble and not followed (muted green, amber, red), with "3 of 4" on the right. Under them a table of the runs grouped by what to do about them (needs you, still open, landed with trouble, landed clean, stopped), a column each for wall time, how long the person was waited on (violet, with a thin share bar when it was a quarter or more), checks, review, commits and cost; each column heading carries the total for the shown days, and a row opens in place to say how it went line by line. Colour is only for what needs a look. A 7 / 30 days switch moves it all. The Insights tab is a grid of 22px tiles, one per gate per run (green met, amber met after trouble with the count in it, red missed or overridden, hollow not asked, brass-ringed waiting); the footer under each column is its number.
- **Power plant**: two tanks in the office for the 5-hour and weekly limits, filling and turning amber then red as they are used. Traffic in the street only follows agent activity.
- **Settings**: a modal `<dialog>` with fieldsets (alerts, new-agent defaults, updates, Claude program); each change is saved immediately, so there is no Save button.
- **Roster**: agents can be grouped under small uppercase headings; the list and detail header fold away and the panel edge drags (double-click resets).
