# Installing Agent World (macOS)

**Before you start:** install the Claude Code CLI and sign in once by running `claude` in a terminal. Agent World runs your own `claude`; it never handles your login.

1. Pick the file for your Mac: `Agent World-<version>-arm64.dmg` for Apple silicon (M1 and later), `…-x64.dmg` for Intel. (Apple menu > About This Mac shows which you have.)
2. Open the dmg and drag **Agent World** into **Applications**.
3. The app is not signed with an Apple Developer ID, so macOS blocks the first launch. Either:
   - right-click the app in Applications, choose **Open**, then **Open** again; or
   - run `xattr -dr com.apple.quarantine "/Applications/Agent World.app"` in a terminal, then open it normally.
   This is needed once.
4. Choose a project folder, click **+ Agent**, and the character walks in.

## Building the installers yourself

```
pnpm install
pnpm run dist        # dist/*.dmg for arm64 and x64
```

`pnpm run pack` builds just the app folder for a quick check.

## Signing later

With an Apple Developer ID certificate, set `CSC_LINK` and `CSC_KEY_PASSWORD` (and the `APPLE_*` notarisation variables) and remove `identity: "-"` from `electron-builder.yml`; the entitlements it needs are already in `build/entitlements.mac.plist`.
