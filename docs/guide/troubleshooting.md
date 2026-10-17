# Troubleshooting

Fixes for the problems you are most likely to meet on the first day: a blocked launch, setup and sign-in, a repository with no commits, a computer with no git, and an agent that is asleep.

## macOS blocks the first launch

The app is not signed with an Apple Developer ID, so macOS says that "Agent World" cannot be opened because Apple cannot check it for malicious software. You approve it once. Use one of these:

- **macOS 15 (Sequoia) and later:** try to open the app once. Then go to **System Settings > Privacy & Security**, scroll down to the Security section, press **Open Anyway** next to "Agent World was blocked", and confirm with your password. Right-click > Open no longer works on these versions.
- **macOS 14 and earlier:** right-click the app in Applications, choose **Open**, then **Open** again.
- **Any version:** run this in a terminal, then open the app normally:

  ```
  xattr -dr com.apple.quarantine "/Applications/Agent World.app"
  ```

## Setup will not let you continue

On the **Your agents** step, **Continue** is disabled until at least one agent tool is ready. The state beside each tool tells you what is missing.

**Not installed.** Press **Install Claude Code** (or **Install agy (Antigravity)**). The installer runs in a terminal in the step, and the app looks again by itself when it ends. If the tool is still not found, the step says "The installer stopped and Claude Code is still not found. Nothing was changed." Press **Try again**, or press **Copy** and run the command in a terminal yourself.

If the tool is installed in a place the app does not look (it looks on your PATH and the usual places), open **Settings**, choose **Providers** and type its path in **Location**, then press **Re-scan**.

**Needs sign-in.** See the next section.

**Connect agy (Antigravity) to the message box to continue.** An Antigravity that is ready must be connected once before you can continue. Press **Let agy (Antigravity) message other agents…**. The app shows the files it will write and the commands it will run, and changes nothing until you press **Connect**.

If you have no agents and either setup was not finished or no agent tool is ready, setup opens again each time you start the app.

## Needs sign-in

**Needs sign-in** means the tool is installed but cannot be used yet. For Claude Code that has two causes: nobody is signed in, or the first questions of a new Claude Code (text style, security notes) were never answered. Claude Code would otherwise ask them in the middle of a chat, so setup has you do it first, in a terminal.

To fix it:

1. On the **Your agents** step, press **Open a terminal to sign in**. A terminal appears in the step.
2. Sign in there, in the program's own window, and answer the questions it asks. A page may open in your browser. The app never sees what you type.
3. Press **I have signed in: check again**. The tool should now say **Ready**.

For Antigravity the step says to run `agy` once in a terminal and follow the prompts; the same button opens that terminal.

If you use Claude Code with a provider of its own (Bedrock or Vertex), there is no login to ask for and it shows **Ready**.

## The first questions of a new Claude Code appear in the chat

A Claude Code that runs for the first time in a configuration folder asks a few questions before it works. Setup normally has you answer them in the terminal, but they can also come up in an agent's terminal, for example for an account you added in Settings (each account has a folder of its own). The app shows each question as a card in the agent's chat, marked **ASKS YOU**, with a button for each answer. It is the same card whether it sits in the chat or opens as a box from the agent's marker in the office.

The questions are: the text style, an API key found in your environment, how to log in, the page that waits for a code from your browser, and the security notes.

- To answer: press the button for your choice. Most of these questions cannot be cancelled, so they have no **Cancel**. The API key question does.
- To answer in the real terminal instead: press **Answer in terminal**. It opens the agent's Terminal tab.
- The login page that waits for a code can only be finished in the terminal, so its card has an **Open terminal** button. Claude Code opens a page in your browser to sign in (if it did not, it shows an address in the terminal). Finish there and paste the code the page gives you into the terminal.

The agent keeps waiting until the question is answered, even if you close the card.

![The card in the chat for a new Claude Code's first question: choose the text style, with the options as buttons and Answer in terminal below](../images/first-run.png)

## A project folder that is a git repository with no commits yet

Agents get their own branch and worktree by starting from a commit. A repository with nothing committed has no branch to start from, so the agent works in the folder itself: no worktree and no `aw/` branch. The hire form says so:

- **Work in my folder directly (no branch)** is ticked and greyed out.
- A note reads: "This repository has no commits yet, so the agent works in the folder itself. Once it has a first commit, new agents get a branch of their own."
- **Branch from** is not offered.

Several agents in one folder can overwrite each other's files, so one agent at a time is the safe way to work here. To get the usual branch for each agent, make a first commit in the folder, for example:

```
git add -A
git commit -m "First commit"
```

After that, new agents get a branch of their own. An agent that was already hired keeps working in the folder.

## A computer with no git

You do not need to install git. Agent World carries its own and uses it when the computer has no working git of its own. The app chooses its git when it starts.

On the **Your agents** step, the **Git** row shows which one is used and where it is:

- `your computer's git`: the computer has one that works, so the app and your agents use it.
- `bundled with Agent World`: the computer has none, so the app and your agents use the one that comes with it. The step says "Nothing to install." The bundled git is also put first on the path of every agent's terminal, so the git commands an agent runs, and the commit hook, use it. Your computer's own git is left as it is.

A new Mac has a file at `/usr/bin/git` that is not git: it opens Apple's installer for the command line tools when something runs it. The app never runs it to find out. It counts `/usr/bin/git` only when `xcode-select -p` says Apple's tools are installed, and otherwise uses its own git. So you will not get Apple's installer window because of Agent World.

If the **Git** row says **Not found** ("No git on this computer and none comes with this build"), you are running a build that was made without the bundled git, for example one built from source. Install git with `xcode-select --install`, then start the app again.

## An agent is asleep

When you restart the app, every agent is asleep. An asleep agent's chat says "<name> is asleep." with a **Wake <name>** button in place of the message box. Press it to resume the agent's session and carry on with the conversation.

## Windows and Linux

Installers for Windows and Linux are built and the project's automated build covers them, but they have not been tried by hand. The Windows build is not signed, so Windows shows its SmartScreen warning on first run. If you hit a problem on either system, use the issue templates described in [CONTRIBUTING.md](../../CONTRIBUTING.md).

Next: [Getting started](getting-started.md)
