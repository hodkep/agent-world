import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('the chat shows the agent working as soon as a message is sent, not when Claude gets round to reporting the turn', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-eager-'))
  const { app, shutdown } = await launchApp(
    { AW_HOME: join(home, 'aw'), AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_SUBMIT_LAG_MS: '4000' },
    home
  )
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = page.getByRole('textbox', { name: 'Message ada' })
    const working = page.getByRole('status').filter({ hasText: 'ada is' })
    await expect(working).toHaveCount(0)

    // The turn is not reported for 4 s; the chat shows it at once.
    await box.fill('please look at this')
    await box.press('Enter')
    await expect(working).toBeVisible({ timeout: 1500 })
    await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible()

    // A slash command may start no turn, so it does not say "working" by itself.
    await expect(working).toHaveCount(0, { timeout: 30_000 })
    await box.fill('/help')
    await box.press('Enter')
    await page.waitForTimeout(600)
    await expect(working).toHaveCount(0)
  } finally {
    await shutdown()
  }
})
