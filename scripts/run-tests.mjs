#!/usr/bin/env node
// Runs the unit tests under a time limit, in a process group of their own, and ends the whole group when they are done, time out or
// are interrupted. A test that never yields (a loop of resolved promises) cannot be stopped from inside Node, so a runner killed on its
// own used to leave its worker spinning at full CPU for hours. Usage: node scripts/run-tests.mjs [vitest arguments]
// AW_TEST_DEADLINE_MS sets the limit (default 10 minutes); AW_TEST_CMD replaces the command (for testing this script).
import { spawn } from 'node:child_process'

const deadline = Number(process.env.AW_TEST_DEADLINE_MS ?? 600_000)
const [cmd, ...args] = process.env.AW_TEST_CMD ? process.env.AW_TEST_CMD.split(' ') : ['npx', 'vitest', 'run', ...process.argv.slice(2)]
const child = spawn(cmd, args, { stdio: 'inherit', detached: true })

const endGroup = (signal) => {
  try {
    process.kill(-child.pid, signal)
  } catch {
    /* the group is already gone */
  }
}
let timedOut = false
const timer = setTimeout(() => {
  timedOut = true
  console.error(`\nTests did not finish in ${Math.round(deadline / 1000)}s: ending them (a test is probably stuck in a loop).`)
  endGroup('SIGTERM')
  setTimeout(() => endGroup('SIGKILL'), 3000)
}, deadline)
for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, () => (endGroup('SIGTERM'), setTimeout(() => (endGroup('SIGKILL'), process.exit(130)), 2000)))
child.on('exit', (code, signal) => {
  clearTimeout(timer)
  // Anything the runner left behind goes with it.
  endGroup('SIGKILL')
  process.exit(timedOut ? 124 : (code ?? (signal ? 1 : 0)))
})
