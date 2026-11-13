# Installing Agent World (macOS, and Linux beta)

The rest of this page is for a Mac. [Linux (beta)](#linux-beta) is at the end.

**Before you start:** nothing needs installing first. Agent World carries its own `git`, and its setup screen installs the Claude Code CLI for you (press **Install Claude Code**) and Antigravity if you want it. You sign in once with your own account in a terminal inside the setup screen. Agent World runs your own `claude`; it never handles your login.

1. Pick the file for your Mac: `Agent-World-<version>-arm64.dmg` for Apple silicon (M1 and later), `…-x64.dmg` for Intel. (Apple menu > About This Mac shows which you have.) If GitHub is slow for you, the same dmg is on the project's mirror: [Apple silicon](https://dl.agent-world.in/latest/Agent-World-arm64.dmg), [Intel](https://dl.agent-world.in/latest/Agent-World-x64.dmg).
2. Open the dmg and drag **Agent World** into **Applications**.
3. The app is not signed with an Apple Developer ID, so macOS blocks the first launch ("Agent World" cannot be opened because Apple cannot check it for malicious software). This is needed once. Either:
   - **macOS 15 (Sequoia) and later:** try to open the app once, then go to **System Settings > Privacy & Security**, scroll down to the Security section, and press **Open Anyway** next to "Agent World was blocked", then confirm with your password. Right-click > Open no longer works on these versions.
   - **macOS 14 and earlier:** right-click the app in Applications, choose **Open**, then **Open** again.
   - **Any version:** run `xattr -dr com.apple.quarantine "/Applications/Agent World.app"` in a terminal, then open it normally.

   Because the app is not signed, it cannot replace itself when a new version comes out. It tells you when one is available and opens its page on GitHub, and you download and install it the same way.

   The Preview keeps the logins it stores encrypted, with a key in your Keychain (an item called "Agent World Safe Storage"). If macOS ever asks whether Agent World can use it, press **Always Allow**. If you press **Deny**, the Preview may not be able to keep logins; the rest of the app works as before.
4. Follow the setup screens: install and sign in to Claude Code, choose a project folder, click **+ Agent**, and the character walks in.

With Homebrew, three commands do steps 1 to 3:

```
brew tap hodkep/tap
brew trust --cask hodkep/tap/agent-world
brew install --cask hodkep/tap/agent-world
```

The cask removes the quarantine mark macOS puts on downloaded apps, so there is no Open Anyway step. That skips macOS's first-launch check for this app only; use the dmg above if you want that check.

Why three: Homebrew 6 and later will not load anything from a tap that is not its own until you trust it. The old one-line `brew install --cask hodkep/tap/agent-world` stops with "Cask is unavailable", and once the tap is added it still stops with "Refusing to load cask hodkep/tap/agent-world from untrusted tap". The tap and the trust are each needed once on each Mac. Until the tap is trusted, `brew outdated` and `brew upgrade` refuse in the same way, so a Mac that installed the cask before Homebrew 6 needs the `brew trust` line too before Homebrew will upgrade it.

## Building the installers yourself

```
pnpm install
pnpm run dist        # dist/*.dmg for arm64 and x64
```

`pnpm run pack` builds just the app folder for a quick check.

## Linux (beta)

Linux is new and only lightly tested: the release build is checked by starting it on Ubuntu, and the app has been used on macOS. Expect rough edges and say what you find. Only 64-bit Intel and AMD (x64) is built.

Pick a file from the [releases page](../../releases): `Agent-World-<version>-amd64.deb` for Debian and Ubuntu, or `Agent-World-<version>-x86_64.AppImage` for any other distribution.

- **deb:** `sudo apt install ./Agent-World-<version>-amd64.deb`, then open **Agent World** from the menu or run `agent-world`. It also sets up what Chromium's sandbox needs on Ubuntu 24.04 and later.
- **AppImage:** `chmod +x Agent-World-<version>-x86_64.AppImage`, then run it. It needs FUSE 2 (the `libfuse2` package; `libfuse2t64` on Ubuntu 24.04). Without it, run it with `--appimage-extract-and-run`. If it stops at once with a sandbox error (Ubuntu 23.10 and later restrict what an AppImage may set up), install the deb instead; `--no-sandbox` also starts it, but turns Chromium's sandbox off for that run, and the Preview opens web pages.

Setup works as on a Mac: it installs the Claude Code CLI and has you sign in, in a terminal inside the app; the app carries its own `git`. The Preview keeps its logins encrypted through the desktop's secret service (GNOME Keyring or KWallet), so one has to be running.

The app does not install updates itself on Linux: it says when a newer version is out, and you download the new file.

## Signing later

With an Apple Developer ID certificate, set `CSC_LINK` and `CSC_KEY_PASSWORD` (and the `APPLE_*` notarisation variables) and remove `identity: "-"` from `electron-builder.yml`; the entitlements it needs are already in `build/entitlements.mac.plist`.
