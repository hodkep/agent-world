# Releasing

A release is a tag. Pushing a tag that starts with `v` builds the Mac installers and uploads them to a GitHub release (`.github/workflows/release.yml`). The installed app looks for updates in those releases.

## Make a release

1. Change `version` in `package.json` (for example to `0.2.0`) and write the version's section in [CHANGELOG.md](CHANGELOG.md), in the same release pull request. Pull requests do not edit the changelog (see CONTRIBUTING.md): take the "For the release notes" sentence of each merged pull request (`git log <last tag>..main` lists them), one short line per change under Added, Changed or Fixed, and date the section. The section is also what the app's What's new and the GitHub release show. Commit both.
2. Tag and push: `git tag v0.2.0 && git push origin main v0.2.0`. The tag must be the version with a `v` in front (`v0.1.0` for 0.1.0).
3. The workflow waits for the owner to approve the run (the `release` environment, which is where the signing secrets live), then runs the type check and the unit tests, builds, and uploads:
   - macOS: `Agent-World-<version>-arm64.dmg` and `-x64.dmg` to install from, the matching `.zip` files and `latest-mac.yml` for the updater.
4. The release is created as a **draft**. When the upload has finished, open it on GitHub and press **Publish release**. The updater only sees published releases, so nobody is offered a half-uploaded one.

## Pictures in the release notes

Each new feature in a release's notes carries a picture and its icon. The pictures live in the repository, under `docs/images/releases/<version>/`, and the notes point at them by a URL that never moves.

1. **Take the pictures in the release pull request**, one for each new feature. Set `VERSION` and the scenes in `e2e/shots-release.e2e.ts` to the release's own, then `pnpm build` and `AW_SHOTS=1 pnpm exec playwright test e2e/shots-release.e2e.ts`. Each picture shows the feature and little else, at twice the window's pixels. A feature's icon is a file in `docs/images/icons/`: to make one, add a 12 by 12 bitmap to `ICONS` in `scripts/readme-art.mjs` and run `pnpm readme:art`.
2. **Point at them by the tag.** In the GitHub release's notes, write each picture's address as `https://raw.githubusercontent.com/hodkep/agent-world/v<version>/docs/images/releases/<version>/<feature>.png` (and the icon as `.../v<version>/docs/images/icons/<name>.svg`). A tag is never moved, so the picture stays as it was whatever happens to `main`. The pictures must be in the tagged commit, which is why they go in the release pull request (or earlier), never after the tag. For a release that was tagged without them, use the full commit hash of the commit that added them in place of `v<version>`.
3. **Write one block for each feature** in the release's notes, and the same picture lines under the version's section in CHANGELOG.md (the app's **What's new** reads the bundled changelog, and the update popover reads the release page: both show a picture from the repository on GitHub full width with its words under it, and drop a picture from anywhere else; the icon in a heading is drawn small). Write the changelog lines in the release pull request, with the pictures:

```
### <img src="https://raw.githubusercontent.com/hodkep/agent-world/v0.6.0/docs/images/icons/notes.svg" width="20" height="20" alt=""> Notes

One sentence, the one under Added in the changelog.

![The Notes window with a checklist whose lines became tasks](https://raw.githubusercontent.com/hodkep/agent-world/v0.6.0/docs/images/releases/0.6.0/notes.png)
```

## Check a build before you tag it

`pnpm run pack` builds the app folder for this computer (it downloads the git that is bundled with the app first, see below). Start it the way Finder does, with a bare path and a home folder of its own, and the bundled git forced on:

```
PACKED_APP="dist/mac-arm64/Agent World.app/Contents/MacOS/Agent World" pnpm exec playwright test e2e/packed.e2e.ts
```

It checks that the app finds its own git inside its resources and uses it to make an agent's worktree. For the real test, install the dmg on a Mac that has never had the command line tools, Claude Code or Homebrew, and walk the setup screens.

## The git inside the app

A new Mac has no `git` until Apple's command line tools are installed, and running the stub at `/usr/bin/git` opens Apple's installer instead of working. So the app carries its own: `scripts/fetch-git.mjs` downloads the git of the [dugite-native](https://github.com/desktop/dugite-native) release pinned in `scripts/git-archives.json` (with its sha256) for each kind of processor, and electron-builder copies the one for the processor being built into the app's resources (`extraResources` in `electron-builder.yml`). The app uses the computer's own git when it has a working one, and its own otherwise. To move to a newer git, change the five lines in `scripts/git-archives.json` (copy them from `script/embedded-git.json` of a newer `dugite` package).

## Signing the Mac build

An app signed only ad hoc installs (the first launch needs Open Anyway in System Settings, see [INSTALL.md](INSTALL.md)) but **cannot update itself**: macOS refuses to replace it with an update that is not signed by the same identity. Such a build still checks: it asks GitHub for the latest release, and when that is newer it says so and points to the release page. The workflow marks a signed build (`awSigned` in the `package.json` inside the app) so the app knows it can install updates by itself. To update, the build must be signed with a Developer ID certificate and notarised, which needs an Apple Developer Program membership (paid, yearly).

The workflow signs and notarises when these five repository secrets exist (Settings, Secrets and variables, Actions), and builds ad hoc without them:

| Secret | What it is and where it comes from |
| --- | --- |
| `CSC_LINK` | The Developer ID Application certificate with its private key, as a `.p12`, base64 encoded. Create the certificate at developer.apple.com under Certificates, install it in Keychain Access, export it (certificate and key) as a `.p12`, then run `base64 -i certificate.p12 \| pbcopy` and paste. |
| `CSC_KEY_PASSWORD` | The password you gave when you exported the `.p12`. |
| `APPLE_ID` | The email of the Apple ID that owns the membership. |
| `APPLE_APP_SPECIFIC_PASSWORD` | An app-specific password for that Apple ID, made at appleid.apple.com under Sign-In and Security, App-Specific Passwords. (The Apple ID's own password does not work.) |
| `APPLE_TEAM_ID` | The 10-character team id, shown at developer.apple.com under Membership details. |

## The Homebrew tap

`hodkep/homebrew-tap` holds the cask that people install with `brew tap hodkep/tap`, `brew trust --cask hodkep/tap/agent-world` and `brew install --cask hodkep/tap/agent-world` (Homebrew 6 and later refuses a tap that is not trusted, so the old one-line install no longer works). Nothing to do per release: when you press **Publish release**, `.github/workflows/notify-tap.yml` wakes the tap's `update-cask` workflow, which reads the release, updates the cask's version and sha256 values, audits it with Homebrew and commits. If the wake-up is missed, the tap checks every 6 hours anyway.

The wake-up needs the repository secret `TAP_DISPATCH_TOKEN`: a fine-grained personal access token limited to `hodkep/homebrew-tap` with **Contents: read and write**. These tokens expire (at most a year): renew it and run `gh secret set TAP_DISPATCH_TOKEN -R hodkep/agent-world`. Without it the job passes and says so, and only the 6-hourly check runs.

## Take a release back

- **Not published yet (a draft):** delete the release on GitHub, and delete the tag with `git push origin :refs/tags/v0.2.0`. Nothing was offered to anyone.
- **Already published:** delete the release (and its tag) on GitHub. People who have not updated yet stop being offered it. People who already have it keep it, because the updater never goes back to an older version: publish a new release with a higher version (`0.2.1`) that has the fix, or the previous code.
- Then fix the problem and tag again with a new version. Do not reuse a tag that was published.
