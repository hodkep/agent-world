# Project notes

What every agent here should know: how to build and test, conventions, things to avoid.

## Running the tests

- Use `pnpm test` (or `node scripts/run-tests.mjs <vitest args>`), not a bare `vitest`. It runs them in a process group of their own with a time limit (10 minutes, `AW_TEST_DEADLINE_MS`) and ends the whole group when they finish, time out or are interrupted.
- A test that loops without ever yielding (for example a fake `sleep` that resolves at once, inside a `for (;;)` that awaits it) cannot be stopped by a test timeout. A fake `sleep` must yield a real turn of the event loop (`setTimeout`), and a fake clock must advance in it.
- Never kill just the runner (`pkill -f vitest`): kill the process group, or run through the script. After a hang, check `ps -axo pid,etime,%cpu,command | grep node` for leftovers.
