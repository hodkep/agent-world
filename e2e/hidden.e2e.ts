import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp } from './launch'

test('test runs keep their window hidden so they never take focus from other work', async () => {
  test.skip(!!process.env.AW_SHOW, 'watching a run on purpose')
  const home = mkdtempSync(join(tmpdir(), 'aw-hid-'))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs') }, home)
  try {
    await app.firstWindow()
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().every((w) => !w.isVisible()))).toBe(true)
  } finally {
    await shutdown()
  }
})
