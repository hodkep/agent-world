# Settings and updates

Where to change how Agent World alerts you, what new agents start with and where each program is, and how the app finds a newer version.

## Open Settings

Click **Settings** (the gear) in the top bar. The list on the left has three groups:

- **Office:** **General**, **Features**, **New agents**, **House rules**.
- **Programs:** **Providers**, **Accounts**, **Model by job**.
- **App:** **Message box**, **Updates**, **Setup**. **Message box** appears only when a ready program has a connection to make (Antigravity).

Each change is saved as you make it. Press **Close** when you are done. The preferences live in `~/.agent-world/preferences.json`.

![The Settings dialog on the General page, with the list of pages on the left](../images/settings.png)

## General

- **Notifications:** **When an agent needs me or finishes** (the starting choice), **Only when an agent needs me**, or **Never**.
- **Keep the computer awake while an agent works:** sleep is stopped only while something is running. On at first.
- **Open pages in the app preview:** when an agent opens an HTML page in a browser, the page also shows in that agent's Preview tab. The command it ran still runs. On at first.
- **When I quit, stop the agents' running commands and commit their unfinished work:** leaves every branch tidy. On at first.

## Features

Features change what agents are told. They add text to messages, so each switch shows a table of what it costs.

- **Library and playbook:** the skills, instructions and prompts you keep once, and the playbook that says which an agent is told and when. On at first. Off: agents are told nothing from it, and the Library window and tab say it is off.
- **Track every request as a todo:** each message you send becomes a task on the project's Todos board that the agent works on and marks done. Off at first: agents then record only what is put off.
- **Workflows:** agents follow a pipeline of plan, implement, test, review and merge, with gates you approve. Off at first. It shows the Workflow tab and the **Workflows** button in the top bar. Turning it off while runs are open asks what to do: **Let them finish, then hide**, **Stop them now** or **Cancel**.
- **Plan gate** and **Merge gate:** both on at first, and they apply only while Workflows is on. With the plan gate, an agent that starts a task writes its plan first and waits for you to approve it before it edits files. With the merge gate, **Finish** holds back landing until the plan was approved; landing anyway is always possible and is recorded.
- **Economy**, **Balanced**, **Max:** how much care a workflow takes. Economy: a plan only when the task is more than one sentence, no audit, no intent check. Balanced (the starting level): a plan every time, and a small model (haiku) audits the branch against it. Max: a plan every time, audited by a larger model (sonnet), and a second model checks the plan against your request.

The library and todo switches take effect for agents started from now on and for each new message. See [Workflows](workflows.md), [Library and playbook](library-and-playbook.md) and [Todos](todos.md) for what each does.

## New agents

What the hire form opens with. Each hire can still change it.

- **Model** and **Permissions:** the choices come from the program new agents use.
- **Work in my folder directly (no branch):** no branch and no worktree, so agents on one folder can overwrite each other.
- **Subagents:** **Levels deep** (1 to 4; the starting value is 2) and **At once under one agent** (1 to 6, 8 or 10; the starting value is 3). They keep a subagent chain from running away.

## House rules

**Added to every agent:** text that is added ahead of every agent's own instructions when it starts or wakes. It applies to every program.

## Providers

One card for each program (Claude Code, agy (Antigravity)). It says whether the program works here (`ready`, `not signed in` or `not found`). **Location** is needed only when the app cannot find the program on its own; it applies to agents started after you set it. **Re-scan** looks again.

## Accounts

For Claude Code, you can sign in more than one subscription and move agents between them without signing in again. Your own login on this computer is listed as **This computer** and is never changed.

To add an account: press **Add account**, type a name (only a label for you), press **Continue to sign in**, finish in the terminal and your browser, then press **I have signed in: check**.

Each account shows **Signed in** or **Sign in needed** with a **Sign in** button, and has **Make default** and **Remove**. The default account is used for every agent you hire. The hire form shows an **Account** choice once you have added one.

## Model by job

One list for each role title: the model used when a job is hired from that role. Each program's models are listed under it, and the hire form can still change the choice.

## Message box

Lets agents message each other. A program that needs a one-time connection is listed here (Antigravity). Press **Let agy (Antigravity) message other agents…**: the app first shows the files it will write and the commands it will run, and changes nothing until you press **Connect**. **Disconnect** undoes it. Claude Code needs no connection, so it is not listed.

## Updates

The installed app looks for a newer version about 15 seconds after it starts and then every six hours while it is open. A development build never looks.

- **Update address:** leave it empty to use the project's releases on GitHub, or give the address of a folder on the web that holds the files the build step produces. It must start with `http://` or `https://`. It is saved when you leave the field, and an address you clear takes effect after a restart.
- **Check now** looks straight away, and the line next to it says what was found, for example `Checking…`, `You have the latest version.`, `Could not check.`, or the version number of an update (`<version> is available.`, `Downloading <version>…`).

What happens when a newer version exists depends on the build:

- **A Mac build that is not signed with an Apple Developer ID** (the build described in [Getting started](getting-started.md)) cannot replace itself. It tells you instead: a chip with an arrow and the version number appears in the top bar, and **Open the release page** appears under **Check now**. Both open the release page on GitHub. Download the new version and install it as before.
- **A build that can install itself** (a Mac build signed with a Developer ID, or a build for another system) downloads the update when it finds one and says that it installs when you quit. Windows and Linux builds have not been tried by hand, so this has not been seen there.

## Run setup again

Open **Setup** and press **Set up again** to go through the first-run steps again: the agent tools found here, the project folder and the defaults. See [Getting started](getting-started.md).

Next: [Troubleshooting](troubleshooting.md)
