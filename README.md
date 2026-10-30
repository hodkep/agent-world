<p align="center">
  <img src="docs/images/banner.svg" alt="Agent World: a pixel-art office with five agents, each in a different state" width="880">
</p>

<p align="center">
  <img alt="latest release" src="https://img.shields.io/github/v/release/hodkep/agent-world?style=flat-square&labelColor=12101a&color=f2c230&label=release">
  <img alt="licence Apache 2.0" src="https://img.shields.io/badge/licence-Apache%202.0-f2c230?style=flat-square&labelColor=12101a">
  <img alt="platform: macOS" src="https://img.shields.io/badge/platform-macOS-f2c230?style=flat-square&labelColor=12101a">
  <img alt="Node 22 or newer" src="https://img.shields.io/badge/node-22%2B-f2c230?style=flat-square&labelColor=12101a">
</p>

<p align="center"><b>Run and steer your coding agents from one place, shown as characters working in a pixel-art IT office.</b></p>

<img src="docs/images/hero.gif" alt="Hire an agent, watch it walk in and work, and approve its permission request from the office" width="800">

Each project is an office floor. Each agent is a character with its own git worktree and a real, interactive `claude` (Claude Code) or `agy` (Antigravity) session that the app owns. You see at a glance who is thinking, running, waiting for you or asleep, and you step in without hunting through terminals.

- **Control over spectacle.** Every visual state maps to a real agent state you can act on.
- **Own the session, don't scrape it.** The app launches and hooks the agents it shows. Your `claude` is unmodified, and nothing global in `~/.claude` is changed.
- **Never lose work.** Uncommitted changes block removal. Nothing is deleted silently.

## <img src="docs/images/icons/hooks.svg" width="24" height="24" alt=""> Quick start

1. **Download** the installer for your computer from the [releases page](../../releases): on a Mac, the `arm64` dmg for Apple silicon (M1 and later) or the `x64` dmg for Intel. Open it and drag **Agent World** into Applications.
2. **Open it once.** The Mac app is not signed with an Apple Developer ID yet, so macOS blocks the first launch. On macOS 15 and later, try to open it, then go to System Settings > Privacy & Security and press **Open Anyway**. Older macOS and the terminal route are in [INSTALL.md](INSTALL.md).
3. **Follow the setup screens.** Nothing has to be installed first: the app carries its own `git`, and setup installs the Claude Code CLI for you and has you sign in once, in a terminal inside the app. Agent World runs your own `claude` and never handles your login. Antigravity (`agy`) is optional.
4. **Hire.** Pick a project folder, click **+ Agent**, name it, and the character walks in.

Prefer Homebrew? These do steps 1 and 2:

```
brew tap hodkep/tap
brew trust --cask hodkep/tap/agent-world
brew install --cask hodkep/tap/agent-world
```

The cask removes the quarantine mark, so there is no Open Anyway step (that skips macOS's first-launch check for this app only). Homebrew 6 and later loads nothing from a tap that is not its own until you trust it, which is the `brew trust` line: once on each Mac, and needed again for `brew upgrade` if you skipped it (more in [INSTALL.md](INSTALL.md)). Steps 3 and 4 still apply.

<img src="docs/images/hire.png" alt="The hire form: a name, a role, a model, and how much the agent may do without asking" width="720">

More in the [user guide](#user-guide).

## Features

### <img src="docs/images/icons/office.svg" width="24" height="24" alt=""> The office

Each agent works at a desk, and what the character does is what the agent does: thinking, researching, implementing, running, delegating or waiting for you. An agent that is asleep leaves the floor and stays in the agents panel. Click a character, or its tile in the panel, to open its chat.

<img src="docs/images/office-activities.png" alt="The office with eight agents, one in each activity" width="720">

The number beside the chat is the agents of the project: rest the pointer on it and a panel of tiles opens, one for each agent with its picture, name and what it is doing, and a red mark on the ones that wait for you. The number counts those to look at.

<img src="docs/images/office-agents-panel.png" alt="The agents panel open under the number: a tile for each agent with its number, picture, name and state, and + Agent" width="720">

The project button works the same way: rest on it and a panel of your recent folders opens, each with its picture, how many agents work there and a red number when one of them waits for you. One click switches project.

<img src="docs/images/office-projects-panel.png" alt="The projects panel open under the project button: a tile for each recent folder, a red number on the one with an agent waiting, Open another folder and New window" width="720">

<img src="docs/images/office-agent-marks.png" alt="The agents panel with a red mark on the tile of the agent that asks for permission, and the number reading 1" width="720">

### <img src="docs/images/icons/chat.svg" width="24" height="24" alt=""> Chat

The conversation of each agent is built from Claude's saved transcript and the real terminal: tool cards, edits as diffs, pictures, and dialogs for what the agent asks. Rewind, queue messages, or run a command with `!`. **Restart agent** starts the program again on the same conversation.

<img src="docs/images/chat.png" alt="A chat with a command, the office&#x27;s own calls as rows, an edit as a diff, and the reply" width="720">

### <img src="docs/images/icons/diagrams.svg" width="24" height="24" alt=""> Diagrams and forms in the chat

Agents draw diagrams in their replies and ask with forms. Click a box to pick it and ask about it, open the diagram large to zoom and draw on it, and answer a form with its button: the agent is told what the form held.

<img src="docs/images/chat-diagram.png" alt="A flowchart and a sequence diagram in a reply, one box picked, with Ask about them" width="720">

<img src="docs/images/chat-form.png" alt="A form an agent asks with: a choice, a slider, a box to tick and a Start button" width="720">

### <img src="docs/images/icons/chat.svg" width="24" height="24" alt=""> A message box that draws markdown

The message box shows markdown as you type it, with the marks hidden on every line but the one the caret is in. Commands, skills and files are tinted wherever they are in the message, and what is sent is what you typed.

<img src="docs/images/chat-markdown-box.png" alt="The message box with a heading, bullets, a quote, bold and code drawn as typed, and a file tinted" width="400">

### <img src="docs/images/icons/btw.svg" width="24" height="24" alt=""> Side questions with /btw

`/btw` asks a side question without interrupting the agent: the answer shows in its own card in the chat.

<img src="docs/images/chat-btw.png" alt="The Side question card with its answer, above the message box" width="720">

### <img src="docs/images/icons/permission.svg" width="24" height="24" alt=""> Permissions answered in the world

A request shows above the character and in the panel. Allow or deny it in one click, or answer in the agent's own terminal. After five minutes it falls back to Claude's own dialog.

<img src="docs/images/permission.png" alt="A request to run a command, with Allow and Deny" width="720">

### <img src="docs/images/icons/worktrees.svg" width="24" height="24" alt=""> Worktrees and the push hold

Each agent works on its own branch (`aw/<name>`) in its own git worktree, and the Code tab shows what it changed. With workflows on, git itself holds an agent's push of its branch, before the pull request, until the plan, the review and its findings are settled; you release it from the agent's chat.

<img src="docs/images/merge-held.png" alt="The run track with a held push and the card at the end of the conversation where it is answered" width="720">

A run is drawn as a flow diagram in the agent's **Workflow** tab, each step a card with where it stands.

<img src="docs/images/workflow-tab.png" alt="The Workflow tab: a run as a flow, with the card that waits for you" width="720">

### <img src="docs/images/icons/workflows.svg" width="24" height="24" alt=""> Workflows and Runs

A workflow is a plan you approve (with a note for the agent if you want one), checks that run, a review of the branch against the plan, and the pull request. The Runs tab charts how often each workflow ran and how well each stage was followed, over a ledger of runs grouped by what there is to do about them. A run belongs to the todo its agent is on, and the todo shows how its run stands. To make a workflow, describe it to the builder, a read-only agent that proposes one; to change one, start the builder from it. Either way you can edit the draft step by step before you save it, and every save is kept in the workflow's history.

<img src="docs/images/runs.png" alt="The Runs tab: two charts and a ledger of runs grouped by outcome" width="720">

<img src="docs/images/workflow-builder.png" alt="The builder&#x27;s draft as a flow of steps, edited in place before it is saved" width="720">

### <img src="docs/images/icons/library.svg" width="24" height="24" alt=""> Library and playbook

Skills, instructions and prompts kept once for every program, and a playbook that says which agent is told what, and when. The chat shows what the library did for each message.

<img src="docs/images/playbook.png" alt="The playbook: two rules, each with when an agent should reach for it" width="720">

<img src="docs/images/library.png" alt="The shelf of skills, with one open" width="720">

### <img src="docs/images/icons/todos.svg" width="24" height="24" alt=""> Todos

One board for you and your agents: lists, tasks that need you, tasks an agent has claimed or finished. A `todo#14` in an agent's reply is a link to the task. A task can have subtasks, shown as a checklist with a progress bar on its card, and labels you add, rename and recolour; a task opens in tabs.

<img src="docs/images/todos.png" alt="The todo board with lists, a task that needs you, and two that agents are doing" width="720">

<img src="docs/images/todos-subtasks.png" alt="A task with three subtasks as a checklist with a progress bar, and labels on the cards" width="720">

### <img src="docs/images/icons/notes.svg" width="24" height="24" alt=""> Notes

A small window of Markdown notes that stays above every other window (Option+Shift+Command+N). Each project has its own notes, checklists are drawn with boxes, and a line becomes a task, with its indented lines as subtasks, or is asked of an agent.

<img src="docs/images/notes.png" alt="The Notes window with a checklist whose lines became tasks" width="570">

### <img src="docs/images/icons/usage.svg" width="24" height="24" alt=""> Usage limits

Your Claude 5-hour and weekly limits are the tanks on the lawn behind the office. Hover them to see what is left and when it resets; the **Usage** button in the top bar opens the full picture and counts the limits that are running low.

<img src="docs/images/usage.png" alt="The tanks on the lawn with what is left of the 5-hour and weekly limits" width="720">

### <img src="docs/images/icons/tokens.svg" width="24" height="24" alt=""> Tokens and the Weekly Rewind

The **Tokens** tab of Usage shows where the tokens went, counted exactly as Claude Code and agy report them: fresh input, what the cache served, what was written to it and output, by provider, account, agent, project or model. The **Weekly Rewind** shows the week's cost and tokens with their rise or fall from the week before.

<img src="docs/images/usage-tokens.png" alt="The Tokens tab: one bar for everything and a table by agent with the cache share" width="720">

<img src="docs/images/usage-rewind.png" alt="The Weekly Rewind: the week&#x27;s cost and tokens against the week before, and the day chart" width="720">

### <img src="docs/images/icons/accounts.svg" width="24" height="24" alt=""> Accounts

Sign in more than one Claude Code subscription, hire agents on any of them, and move agents between accounts without signing in again.

<img src="docs/images/accounts.png" alt="Settings on Accounts: this computer&#x27;s login, and a second account that is the default for new agents" width="640">

### <img src="docs/images/icons/terminals.svg" width="24" height="24" alt=""> Terminals for each project

A drawer of your own shells under the office, starting in the project's folder. Each project keeps its own, and they are still there when you come back.

<img src="docs/images/terminals.png" alt="The terminals drawer with two shells of the open project" width="720">

### <img src="docs/images/icons/shortcuts.svg" width="24" height="24" alt=""> Shortcuts

Cmd+/ lists every key: stepping between agents and projects, the tabs of the side panel, Notes, the terminals and more.

<img src="docs/images/shortcuts.png" alt="The Shortcuts sheet" width="720">

### <img src="docs/images/icons/agents.svg" width="24" height="24" alt=""> Antigravity beside Claude

Hire `agy` (Antigravity) agents next to Claude Code ones. Setup finds both programs on your computer, and each agent gets its own worktree, chat, library and todos whichever program it runs.

<img src="docs/images/setup.png" alt="Setup: Claude Code and Antigravity side by side, and the git the app uses" width="720">

## User guide

Short, task-shaped pages, one for each area, each with a picture.

| Page | What it covers |
| --- | --- |
| [Getting started](docs/guide/getting-started.md) | Install, setup and your first agent |
| [The office](docs/guide/the-office.md) | Reading the office, hiring, waking, answering requests |
| [Chat and dialogs](docs/guide/chat-and-dialogs.md) | Talking to an agent and answering what it asks |
| [Customize the look](docs/guide/customize-the-look.md) | Asking an agent to restyle the app, keeping or undoing it, and widgets |
| [Code and preview](docs/guide/code-and-preview.md) | Changes, files, the terminal, tools, preview, finishing a branch |
| [Workflows](docs/guide/workflows.md) | Plans, checks, review, landing, Runs, Insights, the builder, and runs on the todo board |
| [Library and playbook](docs/guide/library-and-playbook.md) | Skills, instructions, prompts and when agents use them |
| [Todos](docs/guide/todos.md) | The shared board |
| [Settings and updates](docs/guide/settings-and-updates.md) | Preferences, accounts, providers, updates |
| [Troubleshooting](docs/guide/troubleshooting.md) | A blocked first launch, sign-in, a repository with no commits, no git |

## <img src="docs/images/icons/hooks.svg" width="24" height="24" alt=""> How it works

The app owns each session, so it does not have to guess what an agent is doing.

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': '#1a1726', 'primaryTextColor': '#e4e4ee', 'primaryBorderColor': '#f2c230', 'lineColor': '#a4a2b8', 'secondaryColor': '#221e33', 'tertiaryColor': '#12101a', 'fontSize': '14px'}}}%%
flowchart LR
  you([You]) <--> app["<b>Agent World</b><br/>the office, chat and panels"]
  app -- "starts a terminal it owns" --> agent["<b>Agent session</b><br/>your own claude or agy"]
  agent -- "reports what it does:<br/>hooks, office tools, git hooks" --> app
  app -- "creates and cleans up" --> wt[("<b>git worktree</b><br/>branch aw/name under<br/>~/.agent-world/worktrees")]
  agent -- "edits and commits" --> wt
```

- **Hooks, not scraping.** Each agent is started with a per-session settings file that reports what it does (a tool call, a request, a stop) to the app. Nothing in `~/.claude` is changed.
- **Its own worktree.** Every agent works on a branch `aw/<name>` in `~/.agent-world/worktrees/<repo-slug>/<name>`, so agents do not overwrite one another. Removing one deletes its worktree only when nothing is uncommitted.
- **git held from outside.** An agent's `git` is pointed, through git's own environment variables, at the app's hooks folder, so a commit or a merge can be held whatever program made it. No file of your repository or your git configuration is touched, and your own terminal is untouched.
- **Short headless calls.** The usage limits, and the branch review when workflows are on, use short headless calls to your own `claude` or `agy` on your own account.

## <img src="docs/images/icons/status.svg" width="24" height="24" alt=""> Status and roadmap

The latest version is on the [releases page](../../releases/latest); [CHANGELOG.md](CHANGELOG.md) lists what changed in each.

- **macOS** is the platform it has been used on. The Mac app is not signed with an Apple Developer ID yet, so the first launch needs **Open Anyway**, and the app tells you when a newer version is out but cannot install it itself. The release workflow signs and notarises the build once the Apple signing secrets are set.
- **Windows and Linux** are not supported yet: there are no installers for them.
- **Programs:** Claude Code and Antigravity (`agy`).
- **Next:** signed Mac builds, more agent programs behind the same seam ([docs/providers-design.md](docs/providers-design.md)), and further looks for the office.

Read [CHANGELOG.md](CHANGELOG.md) for what changed.

## <img src="docs/images/icons/build.svg" width="24" height="24" alt=""> Build from source

You need Node.js 22 or newer and [pnpm](https://pnpm.io) 10.

```
pnpm install
pnpm dev            # the app, restarting on every change
pnpm build          # the production bundle in out/
pnpm test           # unit tests
pnpm typecheck
pnpm dist           # installers for this computer in dist/
```

`pnpm test:e2e` builds the app and runs the end-to-end tests with fake agents, so it needs no sign-in. The `pilot/` and `real/` suites run real agents, cost real tokens and need a signed-in CLI: see [CONTRIBUTING.md](CONTRIBUTING.md).

## <img src="docs/images/icons/contributing.svg" width="24" height="24" alt=""> Contributing

Contributions are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) has the test rules, the commit format, and the one command that retakes every picture here (`pnpm shots`). [PRODUCT.md](PRODUCT.md) says what the app is for and [DESIGN.md](DESIGN.md) how it looks. The design notes are in [docs/providers-design.md](docs/providers-design.md) (how an agent program is added) and [docs/workflows-design.md](docs/workflows-design.md) (workflows, checks and the review). Security problems: [SECURITY.md](.github/SECURITY.md). Everyone taking part follows the [code of conduct](.github/CODE_OF_CONDUCT.md).

## <img src="docs/images/icons/licence.svg" width="24" height="24" alt=""> Licence

[Apache License 2.0](LICENSE) from 0.2.0; versions up to 0.1.2 were published under the MIT licence and stay under it. The core is open: use it, change it, and send improvements. The maintainer may also offer separate commercial editions with extra features. The name and logo are not covered by the license: see [TRADEMARK.md](TRADEMARK.md). Agent World is not affiliated with Anthropic or Google. The Claude and Antigravity marks in the app belong to their owners: see [NOTICE.md](NOTICE.md).
