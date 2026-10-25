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

To choose when you are alerted, set **Notifications** to **When an agent needs me or finishes** (the starting choice), **Only when an agent needs me**, or **Never**. The switches below it keep the computer awake while an agent works, show pages an agent opens in its Preview tab, and, when you quit, stop the agents' running commands and commit their unfinished work. All three are on at first.

## Features

Features change what agents are told and add text to messages, so each switch shows what it costs.

- **Library and playbook:** on at first. See [Library and playbook](library-and-playbook.md).
- **Track every request as a todo:** off at first. See [Todos](todos.md).
- **Workflows:** off at first. It adds the Workflow tab and the **Workflows** button in the top bar. Turning it off while runs are open asks you to choose **Let them finish, then hide**, **Stop them now** or **Cancel**. See [Workflows](workflows.md).
- **Plan gate** and **Merge gate:** both on at first, and they apply only while Workflows is on.
- **Economy**, **Balanced** (the starting level) and **Max:** how much care a workflow takes. The line under the choice says what each does.

The library and todo switches take effect for agents started from now on and for each new message.

## New agents

This is what the hire form opens with; each hire can still change it. Set the **Model**, the **Permissions**, and **Work in my folder directly (no branch)**. Under **Subagents**, **Levels deep** (starting value 2) and **At once under one agent** (starting value 3) keep a chain of subagents from running away.

## House rules

Text typed under **Added to every agent** is added ahead of every agent's own instructions when it starts or wakes, for every program.

## Providers

Each program has a card saying whether it works here (`ready`, `not signed in` or `not found`). Type a path in **Location** only when the app cannot find the program on its own; it applies to agents started after you set it. **Re-scan** looks again.

## Accounts

For Claude Code, you can sign in more than one subscription and move agents between them without signing in again. Your own login is listed as **This computer** and is never changed.

To add an account: press **Add account**, type a name (only a label for you), press **Continue to sign in**, finish in the terminal and your browser, then press **I have signed in: check**.

Each account has **Sign in** (when it needs one), **Make default** and **Remove**. Click an account's name to rename it: **Enter** saves and **Esc** cancels. Only the label changes; the folder, the sign-in and the agents on it stay. This computer's own login has no label to change. The default account is used for every agent you hire, and the hire form shows an **Account** choice once you have added one.

A signed-in account also has **Switch all agents here**, which is always available. It lists the agents by project with a box for each. Every agent not on the account is ticked to begin with; tick or untick agents, or a project's box for all of its agents, or use **all**, **none** and **only those not on** the account. The ticked agents that are working now are stopped, moved, then sent `continue`, and the idle or asleep ones are moved quietly. **Stop them, switch and continue** does it. A ticked agent that is already on the account is restarted on it, which puts right one whose process kept the old login. Each conversation resumes in the same session on the new account. **Switch idle ones only** leaves the working agents where they are, and an agent that does not stop in time stays on its old account. The agents are moved three at a time, each group starting when the one before has its input box back (or after 30 seconds), so a big office does not swamp the computer; the dialog says which group it is on and which agents are starting, and **Stop after these** leaves the agents it has not reached on their old account (**Look again** offers the rest). Antigravity agents have one login and are left alone.

## Model by job

Choose the model used when a job is hired from each role. The hire form can still change it.

## Message box

To let an Antigravity agent message the others, press **Let agy (Antigravity) message other agents…**. The app shows the files it will write and the commands it will run, and changes nothing until you press **Connect**. **Disconnect** undoes it. Claude Code needs no connection.

## Updates

The installed app looks for a newer version about 15 seconds after it starts and then every three hours while it is open. A development build never looks.

The version you have is at the top of the page, with **What's new**, which opens the notes of that version (from the changelog that came with the app), and **Check now**. The line below says what was found. Once a download has started, **Check now** is greyed (hover it for why) until the app restarts, because looking again would start the download again.

![The installed version, What's new, and Check now greyed while 0.9.0 is downloaded](../images/updates-version-and-notes.png)

The first start after an update says so in a line under the top bar, with **See what's new**; it shows once.

To look now, press **Check now**. Agent World looks only at this project's releases on GitHub.

When a newer version exists:

- **A Mac build that is not signed with an Apple Developer ID** (the build described in [Getting started](getting-started.md)) puts a chip with an arrow and the version number in the top bar. Press it to open a small window under it, which also shows what is new in that version (the release's own text) before you download it: **Download** fetches the new version from this project's GitHub release and shows how far it is; when it has been checked, **Install and restart** closes Agent World, puts the new version in place of this one and opens it again (agents that are working will be asleep after the restart; wake them to resume). While it downloads the chip shows the percentage. **Settings > Updates** shows the same state and the same buttons. If it fails, the window says why in a sentence and offers **Try again**, **Show in Finder** (when the file was kept) or **Open the release page**. How this is kept safe is below.
- **A copy installed with Homebrew** (the cask in the project's tap) gets the same chip, but no **Download**: Homebrew keeps its own record of the version, so it is the one to update. The popover shows `brew upgrade --cask hodkep/tap/agent-world` with **Copy command**; quit Agent World, run it in Terminal and open the app again. If Homebrew says nothing is new yet, run it again in a few minutes, since the tap follows a release shortly after it is published.
- **A build that can install itself** (a Mac build signed with a Developer ID) downloads the update and says that it installs when you quit.

### How an update of a build without a Developer ID is kept safe

The standard updater of a Mac app only replaces an app signed by the same Apple Developer ID, and this build has none, so Agent World does the replacing itself, with these limits:

- It fetches only from this project's GitHub release (`github.com`, and the host GitHub sends release downloads on to, over https), at addresses it builds from the repository and the release's tag; it never takes an address from what the release says. It refuses a version that is not newer than yours and a file over 600 MB.
- It keeps the file only if its size and its sha512 are the ones in `latest-mac.yml` of the same release, and deletes it otherwise.
- Before it replaces anything it unpacks the new app next to the old one and checks that it is Agent World (`dev.agentworld.app`), is the version that was announced, and passes `codesign --verify`. The old app is kept as a backup and put back, and reopened, if any step fails; the reason is kept in the update log.
- It asks for no password and writes nothing outside the folder Agent World is in and its own `updates` folder. Your agents' data in `~/.agent-world` is not touched. Where the app cannot change its own folder, or macOS runs it from a read-only place, it does not try: it keeps the download and says what to do.

One thing you may notice: macOS can ask again for access to folders such as Documents or Downloads after an update. An app signed without a Developer ID has a new identity with every build, so macOS treats each one as a new app; replacing the app by hand does the same. A Developer ID would stop that too.

What this does not give you: the checksum comes from the same release as the file, so trust rests on the security of the GitHub account that publishes the releases (two-factor sign-in is on), not on a signature from Apple. An Apple Developer ID is the better answer in the long run: with it the standard updater works with no code of ours in the way, and macOS itself checks who made the update.

## Run setup again

Open **Setup** and press **Set up again** to repeat the first-run steps. See [Getting started](getting-started.md).

Next: [Troubleshooting](troubleshooting.md)
