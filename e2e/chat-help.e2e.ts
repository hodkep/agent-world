import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('chat: /help is answered in the chat with the commands, sends nothing to the terminal, and a command can be picked into the box', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-help-'))
  const { app, shutdown } = await launchApp(
    { AW_HOME: join(home, 'aw'), AW_USER_HOME: join(home, 'user'), AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1' },
    home
  )
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 900 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = page.getByRole('textbox', { name: 'Message ada' })
    await box.fill('/help')
    await box.press('Enter')
    const card = page.getByRole('region', { name: 'Commands' })
    await expect(card).toBeVisible()
    await expect(card).toContainText('/clear')
    await expect(box).toHaveValue('')
    // Nothing was sent: no message from you appears, now or after a while.
    const log = page.getByRole('log', { name: 'Conversation with ada' })
    await page.waitForTimeout(1500)
    await expect(log.locator('.msg.user').filter({ hasText: '/help' })).toHaveCount(0)
    await card.getByLabel('Filter commands').fill('clear')
    await card.getByRole('button', { name: /\/clear/ }).click()
    await expect(card).toHaveCount(0)
    await expect(box).toHaveValue('/clear ')
  } finally {
    await shutdown()
  }
})
