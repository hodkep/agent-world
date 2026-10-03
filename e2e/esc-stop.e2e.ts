import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('Esc interrupts a working agent from anywhere in the conversation, but not while a menu is open', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-esc-'))
  const { app, shutdown } = await launchApp(
    { AW_HOME: join(home, 'aw'), AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_HANG: '1' },
    home
  )
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = page.getByRole('textbox', { name: 'Message ada' })
    await box.fill('do something long')
    await box.press('Enter')
    const working = page.getByRole('status').filter({ hasText: 'ada is' })
    await expect(working).toBeVisible({ timeout: 10_000 })

    // With the mode menu open, Esc closes the menu and leaves the agent working.
    await page.locator('.mode-chip').click()
    await expect(page.getByRole('menu', { name: 'Permission mode' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu', { name: 'Permission mode' })).toHaveCount(0)
    await expect(page.getByRole('status').filter({ hasText: 'Stopping ada' })).toHaveCount(0)

    // With the list of completions open, the first Esc closes the list and the second stops the agent.
    await box.click()
    await box.pressSequentially('/he')
    await expect(page.getByRole('listbox', { name: 'Suggestions' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('listbox', { name: 'Suggestions' })).toHaveCount(0)
    await expect(page.getByRole('status').filter({ hasText: 'Stopping ada' })).toHaveCount(0)
    await box.fill('')

    // Clicking in the conversation (not the box) and pressing Esc stops it.
    await page.getByRole('log').getByText('do something long').click()
    await expect(box).not.toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('status').filter({ hasText: 'Stopping ada' })).toBeVisible()
  } finally {
    await shutdown()
  }
})
