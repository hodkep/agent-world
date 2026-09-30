import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('chat with an agent: send a prompt, watch tools and the reply appear, slash commands complete', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-chat-'))
  const { app, shutdown } = await launchApp(
    { AW_HOME: join(home, 'aw'), AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1' },
    home
  )
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()

    const box = page.getByRole('textbox', { name: 'Message ada' })
    await box.fill('/comp')
    await expect(page.getByRole('option', { name: /\/compact/ })).toBeVisible()
    await box.fill('')

    await box.fill('add a health check')
    await box.press('Enter')
    const log = page.getByRole('log', { name: 'Conversation with ada' })
    await expect(log.locator('.msg.user')).toContainText('add a health check')
    await expect(log.locator('.tc', { hasText: 'List the source folder' })).toContainText('$ ls src', { timeout: 10_000 })
    await expect(log.locator('.tc', { hasText: 'List the source folder' })).toContainText('health.ts')
    await expect(log.locator('.tc', { hasText: 'Edited' })).toContainText('export const ok = true')
    await expect(log.locator('.msg.assistant strong')).toHaveText('health.ts')
    await expect(log.locator('.msg.assistant li')).toHaveCount(2)
    // The optimistic bubble was replaced by the real one, not duplicated.
    await expect(log.locator('.msg.user')).toHaveCount(1)
    await page.screenshot({ path: join(__dirname, '..', 'test-results', 'chat.png') })

    // The same conversation is still there after switching views.
    await page.getByRole('tab', { name: 'Terminal' }).click()
    await expect(page.locator('.term-host:visible')).toContainText('fake claude')
    await page.getByRole('tab', { name: 'Chat' }).click()
    await expect(log.locator('.msg.assistant')).toBeVisible()
  } finally {
    await shutdown()
  }
})
