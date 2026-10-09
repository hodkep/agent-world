import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const script = join(__dirname, 'run-tests.mjs')
const run = (cmd: string, deadline: number) => spawnSync('node', [script], { env: { ...process.env, AW_TEST_CMD: cmd, AW_TEST_DEADLINE_MS: String(deadline) }, encoding: 'utf8', timeout: 20_000 })
const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

describe('the test runner script', () => {
  it('passes on the exit code of a run that finishes', () => {
    expect(run('node -e process.exit(0)', 5000).status).toBe(0)
    expect(run('node -e process.exit(3)', 5000).status).toBe(3)
  })

  it('ends a run that never finishes, with a code for "timed out", saying why', () => {
    const r = run('node -e for(;;){}', 1000)
    expect(r.status).toBe(124)
    expect(r.stderr).toContain('did not finish')
  })

  it('leaves nothing running behind: a child the run started is gone too', () => {
    // The command starts a grandchild that prints its pid and spins; the script must end both.
    const file = join(mkdtempSync(join(tmpdir(), 'aw-rt-')), 'parent.js')
    writeFileSync(file, `const { spawn } = require('child_process'); const c = spawn('node', ['-e', 'for(;;){}'], { stdio: 'ignore' }); console.log(c.pid); setInterval(() => {}, 1000)`)
    const r = run(`node ${file}`, 1500)
    const pid = Number(r.stdout.trim().split('\n')[0])
    expect(pid).toBeGreaterThan(0)
    expect(r.status).toBe(124)
    expect(alive(pid)).toBe(false)
  })
})
