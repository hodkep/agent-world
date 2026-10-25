import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { chatTab, hire, launchApp } from './launch'

test('Restart agent in the more menu asks first, then starts the agent again on the same conversation', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-restart-'))
  const launches = join(home, 'launches.log')
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_ENV: launches }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page, { name: 'nova' })
    await chatTab(page)
    const count = () => readFileSync(launches, 'utf8').split('\n').filter(Boolean).length
    await expect.poll(count).toBe(1)

    await page.getByRole('button', { name: 'More actions' }).click()
    await page.getByRole('menuitem', { name: /Restart agent/ }).click()
    const ask = page.getByRole('dialog', { name: 'Restart nova?' })
    await expect(ask).toContainText('same conversation')
    // Cancel changes nothing.
    await ask.getByRole('button', { name: 'Cancel' }).click()
    await page.waitForTimeout(800)
    expect(count()).toBe(1)

    await page.getByRole('button', { name: 'More actions' }).click()
    await page.getByRole('menuitem', { name: /Restart agent/ }).click()
    await page.getByRole('dialog', { name: 'Restart nova?' }).getByRole('button', { name: 'Restart' }).click()
    await expect.poll(count, { timeout: 15_000 }).toBe(2)
    // It never left the office: the row is not asleep once it is back.
    const row = page.locator('.roster button', { hasText: 'nova' })
    await expect(row).toBeVisible()
    await page.waitForTimeout(1500)
    await expect(row).not.toContainText('asleep')
  } finally {
    await shutdown()
  }
})
