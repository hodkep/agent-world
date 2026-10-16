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

## Changes

- **Commits** follow [Conventional Commits](https://www.conventionalcommits.org): `type(scope): subject`, with a subject that says what the change does for someone using the app (`fix(chat): …`, `feat(library): …`). Types are feat, fix, docs, style, refactor, perf, test, build, ci, chore and revert. Keep a change in one commit when it is one idea, and say why in the body only when the subject cannot.
- **Branches:** work on a branch of your own and open a pull request to `main`. Branches named `aw/<name>` are the worktrees Agent World itself creates for its agents (`~/.agent-world/worktrees/…`); you do not need to use them.
- **Screens:** for a change to how the app looks or behaves on screen, show a mock or a screenshot in the pull request first. The look is described in [DESIGN.md](DESIGN.md).
- **Before you open a pull request:** `pnpm typecheck`, `pnpm test`, and the end-to-end specs of the area you touched.

## Reporting problems

Use the issue templates. For a security problem, do not open a public issue: see [SECURITY.md](.github/SECURITY.md).

By contributing you agree that your contributions are licensed under the [MIT licence](LICENSE), and to follow the [code of conduct](.github/CODE_OF_CONDUCT.md).
