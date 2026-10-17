# Installing Agent World (macOS)

**Before you start:** nothing needs installing first. Agent World carries its own `git`, and its setup screen installs the Claude Code CLI for you (press **Install Claude Code**) and Antigravity if you want it. You sign in once with your own account in a terminal inside the setup screen. Agent World runs your own `claude`; it never handles your login.

1. Pick the file for your Mac: `Agent-World-<version>-arm64.dmg` for Apple silicon (M1 and later), `…-x64.dmg` for Intel. (Apple menu > About This Mac shows which you have.)
2. Open the dmg and drag **Agent World** into **Applications**.
3. The app is not signed with an Apple Developer ID, so macOS blocks the first launch ("Agent World" cannot be opened because Apple cannot check it for malicious software). This is needed once. Either:
   - **macOS 15 (Sequoia) and later:** try to open the app once, then go to **System Settings > Privacy & Security**, scroll down to the Security section, and press **Open Anyway** next to "Agent World was blocked", then confirm with your password. Right-click > Open no longer works on these versions.
   - **macOS 14 and earlier:** right-click the app in Applications, choose **Open**, then **Open** again.
   - **Any version:** run `xattr -dr com.apple.quarantine "/Applications/Agent World.app"` in a terminal, then open it normally.

   Because the app is not signed, it cannot replace itself when a new version comes out. It tells you when one is available and opens its page on GitHub, and you download and install it the same way.
4. Follow the setup screens: install and sign in to Claude Code, choose a project folder, click **+ Agent**, and the character walks in.

## Building the installers yourself

```
pnpm install
pnpm run dist        # dist/*.dmg for arm64 and x64
```

`pnpm run pack` builds just the app folder for a quick check.

## Signing later

With an Apple Developer ID certificate, set `CSC_LINK` and `CSC_KEY_PASSWORD` (and the `APPLE_*` notarisation variables) and remove `identity: "-"` from `electron-builder.yml`; the entitlements it needs are already in `build/entitlements.mac.plist`.
