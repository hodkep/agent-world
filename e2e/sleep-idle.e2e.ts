import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { chatTab, hire, launchApp } from './launch'

test('an agent idle past the limit is put to sleep, and its Wake button starts it again', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-sleep-'))
  const launches = join(home, 'launches.log')
  const { app, shutdown } = await launchApp(
    { AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_ENV: launches, AW_SLEEP_AFTER_MS: '3000', AW_SLEEP_TICK_MS: '500' },
    home
  )
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page, { name: 'nova' })
    await chatTab(page)
    const count = () => readFileSync(launches, 'utf8').split('\n').filter(Boolean).length
    await expect.poll(count).toBe(1)

    const row = page.locator('.roster button', { hasText: 'nova' })
    await expect(row).not.toContainText('asleep')
    // Nothing is typed or run, so after the limit its program is stopped and the row says so.
    await expect(row).toContainText('asleep', { timeout: 20_000 })

    await page.getByRole('button', { name: 'Wake nova' }).click()
    await expect.poll(count, { timeout: 15_000 }).toBe(2)
    await expect(row).not.toContainText('asleep')
  } finally {
    await shutdown()
  }
})
