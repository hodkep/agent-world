import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('the message box keeps its height when the window is short', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-comp-'))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_CHILD: '1' }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    // Chat is not the view it opens on, so its box is first measured while hidden.
    await page.getByRole('tab', { name: 'Terminal' }).click()
    await page.getByRole('tab', { name: 'Chat' }).click()
    await expect(page.getByLabel('Running processes')).toBeVisible({ timeout: 10_000 })
    expect((await page.getByRole('textbox', { name: 'Message ada' }).boundingBox())!.height).toBeGreaterThanOrEqual(40)
    for (const height of [900, 420, 300]) {
      await app.evaluate(({ BrowserWindow }, h) => BrowserWindow.getAllWindows()[0]!.setSize(1200, h), height)
      await page.waitForTimeout(300)
      const box = await page.getByRole('textbox', { name: 'Message ada' }).boundingBox()
      expect(box!.height, `at window height ${height}`).toBeGreaterThanOrEqual(40)
    }
  } finally {
    await shutdown()
  }
})
