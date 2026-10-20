import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('a message typed in the chat right after an agent is hired waits for the agent to be ready, and is answered', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-first-'))
  // The agent takes 3 seconds to show its screen: a message pasted before that would be lost.
  const { app, shutdown } = await launchApp(
    { AW_HOME: join(home, 'aw'), AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_START_MS: '3000' },
    home
  )
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = page.getByRole('textbox', { name: 'Message ada' })
    const log = page.getByRole('log', { name: 'Conversation with ada' })
    await box.fill('hello too early')
    await box.press('Enter')
    await box.fill('and a second one')
    await box.press('Enter')
    await expect(log.locator('.msg.assistant').filter({ hasText: 'hello too early' })).toBeVisible({ timeout: 30_000 })
    await expect(log.locator('.msg.assistant').filter({ hasText: 'and a second one' })).toBeVisible({ timeout: 30_000 })
    // In the order they were sent.
    const said = await log.locator('.msg.user').allInnerTexts()
    expect(said.findIndex((t) => t.includes('hello too early'))).toBeLessThan(said.findIndex((t) => t.includes('and a second one')))
  } finally {
    await shutdown()
  }
})
