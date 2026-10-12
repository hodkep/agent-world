import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp } from './launch'

test('settings: a Features page lists each feature switch with what it adds in tokens, and the switches are saved', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-features-'))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs') }, home)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 1000 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
    const s = page.getByRole('dialog', { name: 'Settings' })
    await s.getByRole('tab', { name: /Features/ }).click()
    await expect(s.getByRole('checkbox', { name: /Check before acting/ })).toHaveCount(0)
    const track = s.getByRole('checkbox', { name: /Track every request as a todo/ })
    await expect(track).not.toBeChecked()
    await expect(s.getByRole('table', { name: 'What fully tracked todos add, on these assumptions' })).toContainText('tokens')
    // Both are saved: they are still as set when Settings is opened again.
    await track.click()
    await expect(track).toBeChecked()
    await s.getByRole('button', { name: 'Close settings' }).click()
    await page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
    await s.getByRole('tab', { name: /Features/ }).click()
    await expect(track).toBeChecked()
  } finally {
    await shutdown()
  }
})
