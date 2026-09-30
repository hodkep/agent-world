import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { approve, hire, launchApp } from './launch'

test('one agent asks another for help and the message lands in its terminal', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-mail-'))
  const { app, shutdown } = await launchApp(
    { AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '300', FAKE_SEND: 'ada:linus:please review auth.ts' },
    home
  )
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.waitForTimeout(500)
    await hire(page)
    // Both fake agents hit a permission request in their script; approve them from the panel.
    for (let i = 0; i < 2; i++) {
      await approve(page)
    }
    const log = page.locator('.messages .message').first()
    await expect(log).toContainText('ada')
    await expect(log).toContainText('linus')
    await expect(log).toContainText('please review auth.ts')
    await expect(log).toContainText(/delivered/i, { timeout: 15_000 })

    await page.locator('.roster button', { hasText: 'linus' }).click()
    await expect(page.locator('.term-host:visible')).toContainText('[Agent World] Message from ada: please review auth.ts', { timeout: 10_000 })
    await page.locator('.roster button', { hasText: 'ada' }).click()
    await expect(page.locator('.term-host:visible')).toContainText(/send_message → (Delivered|Queued)/)
    // Clicking the agent that is already selected still hands the keyboard to its terminal.
    await page.locator('.roster button', { hasText: 'ada' }).click()
    await expect.poll(() => page.evaluate(() => document.activeElement?.className)).toContain('xterm-helper-textarea')
  } finally {
    await shutdown()
  }
})
