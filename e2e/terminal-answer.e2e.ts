import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('answering a permission in the terminal clears its card and the agent carries on', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-term-'))
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_TERMINAL_PROMPT: '1' }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    const card = page.locator('.need-row')
    await expect(card).toBeVisible({ timeout: 15_000 })
    const term = page.locator('.term-host:visible')
    await expect(term).toContainText('Do you want to proceed?')

    await term.click()
    await page.keyboard.press('Enter')
    await expect(term).toContainText('approved in terminal')
    // Gone before the tool even finishes (the fake takes 3 s): the closed menu is enough.
    await expect(card).toHaveCount(0, { timeout: 2_000 })
    await expect(page.locator('.roster button').first()).toContainText('running')
    await expect(page.locator('.roster button').first()).toContainText(/idle|waiting/, { timeout: 10_000 })
  } finally {
    await shutdown()
  }
})
