import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Tests make temp folders by the hundred and many never remove theirs. So that nothing is left behind, a run gets one temp
 * folder of its own (the tests' `tmpdir()` points into it, and so do the apps they start), and it is removed when the run ends.
 * Used as the global setup of both Vitest and Playwright: what it returns is run at the end.
 */
export default function setup() {
  const real = tmpdir()
  const run = mkdtempSync(join(real, 'awr-'))
  process.env.TMPDIR = run
  return () => {
    process.env.TMPDIR = real
    rmSync(run, { recursive: true, force: true })
  }
}
