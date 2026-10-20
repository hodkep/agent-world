# Contributing

Thanks for helping. Agent World is an Electron app (React and Pixi in the renderer, a Node main process) that runs and steers coding agents. [README.md](README.md) says what it is, [PRODUCT.md](PRODUCT.md) and [DESIGN.md](DESIGN.md) say what it is for and how it looks, and [docs/providers-design.md](docs/providers-design.md) explains how an agent program is added behind one seam.

## Set up

You need Node.js 22 or newer and pnpm 10 (the exact version is pinned in `package.json`).

```
pnpm install
pnpm dev
```

The Claude Code CLI, signed in, is only needed to run real agents by hand. The tests use fake agents and need no sign-in.

## Tests

- **Unit tests:** `pnpm test`, or `node scripts/run-tests.mjs <vitest args>` for a few files. Do not run a bare `vitest`: the script runs the tests in a process group of their own with a time limit (10 minutes, `AW_TEST_DEADLINE_MS`) and ends the whole group when they finish, time out or are interrupted.
- A test that loops without ever yielding (for example a fake `sleep` that resolves at once, inside a `for (;;)` that awaits it) cannot be stopped by a test timeout. A fake `sleep` must yield a real turn of the event loop (`setTimeout`), and a fake clock must advance in it.
- Never kill just the runner (`pkill -f vitest`). Kill the process group, or run through the script. After a hang, check `ps -axo pid,etime,%cpu,command | grep node` for leftovers.
- **Types:** `pnpm typecheck`.
- **End to end:** `pnpm test:e2e` builds the app and drives it with Playwright against fake agents (`e2e/fake-claude.mjs`, `e2e/fake-agy.mjs`). The tests run the **built** app, so rebuild (`pnpm build`) after changing the main process or the renderer and before running a single spec with `pnpm exec playwright test e2e/<file>`.
- **Write the test first** for behaviour and bug fixes, at the public seam of the code (what a user or a caller sees), and watch it fail for the right reason before you write the code.

### Suites that spend real tokens

The files under `pilot/` (and any suite named `real`) start real Claude Code or Antigravity sessions to measure how real agents behave. They cost real usage, need the CLI installed and signed in, and are never part of `pnpm test` or CI. Run one on purpose, with a cap on spend, for example:

```
PILOT=1 PILOT_RUNS=3 PILOT_MAX_USD=2 pnpm exec vitest run -c vitest.pilot.config.ts pilot/rulebook.pilot.ts
```

Each file says at the top what it measures and what it costs.

## Pictures for the README and the guide

Every picture in `docs/images/` is taken from the real app, driven by fake agents, so it costs no tokens and needs no sign-in. One command takes them all again, including the hero GIF:

```
pnpm shots
```

It builds the app, runs `e2e/shots.e2e.ts` (skipped in a normal test run, switched on by `AW_SHOTS=1`) and then redraws the banner and the pixel icons. The hero GIF needs [ffmpeg](https://ffmpeg.org) (`brew install ffmpeg`). Each picture is one test in that file; `e2e/shotsKit.ts` makes the app and the project, and `e2e/shots-claude.mjs` is the scripted stand-in for `claude` that gives each named agent its activity (idle, thinking, running, permission, asleep and so on). To retake one picture: `AW_SHOTS=1 pnpm exec playwright test e2e/shots.e2e.ts -g "permission"` after `pnpm build`.

Keep every picture under 1 MB and the GIF under 5 MB (the test fails above that for the GIF). The banner and the small icons beside the README's headings are drawn as SVG by `scripts/readme-art.mjs` from the app's own pixel lettering, figure and palette (`pnpm readme:art`); nothing is downloaded and no font is used.

## Changes

- **Commits** follow [Conventional Commits](https://www.conventionalcommits.org): `type(scope): subject`, with a subject that says what the change does for someone using the app (`fix(chat): …`, `feat(library): …`). Types are feat, fix, docs, style, refactor, perf, test, build, ci, chore and revert. Keep a change in one commit when it is one idea, and say why in the body only when the subject cannot. A commit message does not credit an AI tool (no `Co-Authored-By:` or "Generated with" line for one): a `commit-msg` hook turned on by `pnpm install` and a CI check both refuse it.
- **Branches:** work on a branch of your own and open a pull request to `main`. Branches named `aw/<name>` are the worktrees Agent World itself creates for its agents (`~/.agent-world/worktrees/…`); you do not need to use them.
- **Screens:** for a change to how the app looks or behaves on screen, show a mock or a screenshot in the pull request first. The look is described in [DESIGN.md](DESIGN.md).
- **Before you open a pull request:** `pnpm typecheck`, `pnpm test`, and the end-to-end specs of the area you touched.
- **What CI runs** (`.github/workflows/ci.yml`): `commit-messages`; `checks` (typecheck and unit tests, on Linux, about a minute, first); then the end-to-end specs split over four Macs (`playwright test --shard=i/4`). The required check `test (macos-latest)` is a last job that waits for all of them. It passes when the end-to-end work was left out on purpose: a draft pull request (mark it ready for review to run it), a change of only docs, the changelog or pictures (`scripts/ci-changes.mjs`), or a push to `main`, which runs the typecheck and unit tests alone. Each run's summary lists the specs that passed only on a retry (one retry in CI) and the ten slowest.

## Reporting problems

Use the issue templates. For a security problem, do not open a public issue: see [SECURITY.md](.github/SECURITY.md).

By contributing you agree that your contributions are licensed under the [Apache License 2.0](LICENSE) (section 5 of the license says that is the default for anything you submit). You keep your copyright and your name stays in the history. The project is open core: the maintainer may also offer separate commercial editions with extra features, and Apache 2.0 lets the maintainer include contributions in those, with the notices kept. You also agree to follow the [code of conduct](.github/CODE_OF_CONDUCT.md).

## Who can do what

- **Everyone** can read the code, open issues and send pull requests from a fork. Nobody else has write access to this repository.
- **The owner** reviews and merges. `main` accepts changes only through a pull request that has a code owner's review, a passing `test` and `commit-messages` check, a linear history (squash or rebase, no merge commits) and no unresolved conversations. It cannot be force-pushed or deleted.
- **Releases** are tags that start with `v`. Only the owner can create, move or delete one, and the release job waits for the owner's approval before it starts and before it can use the signing secrets.
- **Workflows** from a first-time or outside contributor do not run until the owner approves them, they get a read-only token, and only GitHub's own actions and `pnpm/action-setup` are allowed to run.
- **A security problem** goes to private vulnerability reporting, not to an issue: see [SECURITY.md](.github/SECURITY.md).
- To give someone a role, add them as a collaborator: *triage* for managing issues, *write* only for a maintainer you trust, *admin* for the owner alone.
