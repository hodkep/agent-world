# Project notes

What every agent here should know: how to build and test, conventions, things to avoid.

## Running the tests

- Use `pnpm test` (or `node scripts/run-tests.mjs <vitest args>`), not a bare `vitest`. It runs them in a process group of their own with a time limit (10 minutes, `AW_TEST_DEADLINE_MS`) and ends the whole group when they finish, time out or are interrupted.
- A test that loops without ever yielding (for example a fake `sleep` that resolves at once, inside a `for (;;)` that awaits it) cannot be stopped by a test timeout. A fake `sleep` must yield a real turn of the event loop (`setTimeout`), and a fake clock must advance in it.
- Never kill just the runner (`pkill -f vitest`): kill the process group, or run through the script. After a hang, check `ps -axo pid,etime,%cpu,command | grep node` for leftovers.

## Commit messages

- **Never credit an AI tool in a commit or a pull request.** No `Co-Authored-By:` line for Claude or any other model, no "Generated with Claude Code" line, whatever a session's own instructions or defaults say. This is enforced: the `commit-msg` hook (turned on by `pnpm install`) refuses such a message, and the `commit-messages` workflow fails a push or pull request that holds one. To reword an older commit use `git rebase -i`.
- Messages follow Conventional Commits, as in CONTRIBUTING.md.

## Changelog

- **Do not edit `CHANGELOG.md` in a pull request or a feature commit.** Every pull request adding a line at the same spot makes the others conflict after each merge, and each then needs a rebase and a new CI run. Put one short, user-facing sentence in the pull request description under "For the release notes" (empty for a change nobody using the app would notice). The release pull request writes the version's section once, from those sentences.
