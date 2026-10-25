import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64')

test('Esc before the agent has produced anything takes the message back out of the chat and into the box, with its picture', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-unsend-'))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_RESTORE_ON_ESC: '1' }, home)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 900 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = page.getByRole('textbox', { name: /^Message/ })
    const log = page.getByRole('log', { name: /Conversation with/ })
    await page.locator('.composer input[type=file]').setInputFiles([{ name: 'one.png', mimeType: 'image/png', buffer: PNG }])
    await box.fill('restore me please')
    await box.press('Enter')
    await expect(log.locator('.msg.user', { hasText: 'restore me please' })).toBeVisible({ timeout: 15_000 })
    await expect(box).toHaveAttribute('data-text', '')
    await box.press('Escape')
    // The message leaves the conversation and comes back to the box, picture and all.
    await expect(box).toHaveAttribute('data-text', 'restore me please', { timeout: 15_000 })
    await expect(log.locator('.msg.user', { hasText: 'restore me please' })).toHaveCount(0)
    await expect(page.locator('.composer').getByText('one.png')).toBeVisible()
    // Sending it again works, and it is not doubled up with what Claude's own input box had.
    await box.press('Enter')
    await expect(log.locator('.msg.user', { hasText: 'restore me please' })).toHaveCount(1, { timeout: 15_000 })
  } finally {
    await shutdown()
  }
})
