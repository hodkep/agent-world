import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import electronPath from 'electron'
import { launchApp } from './launch'

test('opening the app again (a notification click, the dock, a second launch) brings the running one forward instead of starting another', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-single-'))
  const env = { AW_HOME: join(tmp, 'home'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs') }
  const { app, shutdown } = await launchApp(env, tmp)
  try {
    const first = await app.firstWindow()
    await expect(first.locator('header')).toBeVisible()
    // Same data folder, so the same app: the second process must hand over and exit by itself.
    const second = spawn(electronPath as unknown as string, [resolve(__dirname, '..')], { env: { ...process.env, AW_ZOOM: '1', AW_HIDDEN: '1', ...env }, stdio: 'ignore' })
    const exited = new Promise<number | null>((r) => second.once('exit', (code) => r(code)))
    try {
      expect(await Promise.race([exited, new Promise((r) => setTimeout(() => r('still running'), 15_000))])).toBe(0)
      expect(app.windows()).toHaveLength(1)
    } finally {
      second.kill()
    }
    await expect(first.locator('header')).toBeVisible()
  } finally {
    await shutdown()
  }
})
