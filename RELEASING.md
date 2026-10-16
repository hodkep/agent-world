# Releasing

A release is a tag. Pushing a tag that starts with `v` builds the installers on macOS, Windows and Linux and uploads them to a GitHub release (`.github/workflows/release.yml`). The installed app looks for updates in those releases.

## Make a release

1. Change `version` in `package.json` (for example to `0.2.0`) and add the entry to [CHANGELOG.md](CHANGELOG.md). Commit both.
2. Tag and push: `git tag v0.2.0 && git push origin main v0.2.0`. The tag must be the version with a `v` in front (`v0.1.0` for 0.1.0).
3. The workflow runs the type check and the unit tests, builds, and uploads on each system:
   - macOS: `Agent World-<version>-arm64.dmg` and `-x64.dmg` to install from, the matching `.zip` files and `latest-mac.yml` for the updater.
   - Windows: the installer (`.exe`) and `latest.yml`.
   - Linux: the AppImage, the `.deb` and `latest-linux.yml`.
4. The release is created as a **draft**. When all three systems have finished uploading, open it on GitHub and press **Publish release**. The updater only sees published releases, so nobody is offered a half-uploaded one.

## Check a build before you tag it

`pnpm run pack` builds the app folder for this computer (it downloads the git that is bundled with the app first, see below). Start it the way Finder does, with a bare path and a home folder of its own, and the bundled git forced on:

```
PACKED_APP="dist/mac-arm64/Agent World.app/Contents/MacOS/Agent World" pnpm exec playwright test e2e/packed.e2e.ts
```

It checks that the app finds its own git inside its resources and uses it to make an agent's worktree. For the real test, install the dmg on a Mac that has never had the command line tools, Claude Code or Homebrew, and walk the setup screens.

## The git inside the app

A new Mac has no `git` until Apple's command line tools are installed, and running the stub at `/usr/bin/git` opens Apple's installer instead of working. So the app carries its own: `scripts/fetch-git.mjs` downloads the git of the [dugite-native](https://github.com/desktop/dugite-native) release pinned in `scripts/git-archives.json` (with its sha256) for each kind of processor, and electron-builder copies the one for the processor being built into the app's resources (`extraResources` in `electron-builder.yml`). The app uses the computer's own git when it has a working one, and its own otherwise. To move to a newer git, change the five lines in `scripts/git-archives.json` (copy them from `script/embedded-git.json` of a newer `dugite` package).

## Signing the Mac build

An app signed only ad hoc installs (the first launch needs a right-click and Open, see [INSTALL.md](INSTALL.md)) but **cannot update itself**: macOS refuses to replace it with an update that is not signed by the same identity. To update, the build must be signed with a Developer ID certificate and notarised, which needs an Apple Developer Program membership (paid, yearly).

The workflow signs and notarises when these five repository secrets exist (Settings, Secrets and variables, Actions), and builds ad hoc without them:

| Secret | What it is and where it comes from |
| --- | --- |
| `CSC_LINK` | The Developer ID Application certificate with its private key, as a `.p12`, base64 encoded. Create the certificate at developer.apple.com under Certificates, install it in Keychain Access, export it (certificate and key) as a `.p12`, then run `base64 -i certificate.p12 \| pbcopy` and paste. |
| `CSC_KEY_PASSWORD` | The password you gave when you exported the `.p12`. |
| `APPLE_ID` | The email of the Apple ID that owns the membership. |
| `APPLE_APP_SPECIFIC_PASSWORD` | An app-specific password for that Apple ID, made at appleid.apple.com under Sign-In and Security, App-Specific Passwords. (The Apple ID's own password does not work.) |
| `APPLE_TEAM_ID` | The 10-character team id, shown at developer.apple.com under Membership details. |

Windows is not signed, so Windows shows its SmartScreen warning on first run. Linux builds are not signed.

## Take a release back

- **Not published yet (a draft):** delete the release on GitHub, and delete the tag with `git push origin :refs/tags/v0.2.0`. Nothing was offered to anyone.
- **Already published:** delete the release (and its tag) on GitHub. People who have not updated yet stop being offered it. People who already have it keep it, because the updater never goes back to an older version: publish a new release with a higher version (`0.2.1`) that has the fix, or the previous code.
- Then fix the problem and tag again with a new version. Do not reuse a tag that was published.
