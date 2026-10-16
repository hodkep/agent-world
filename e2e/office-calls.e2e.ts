import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('chat: the office\'s library calls are one folded line, and one click on it shows each call as a line, and a click on a line shows its card', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-office-calls-'))
  const { app, shutdown } = await launchApp(
    { AW_HOME: join(home, 'aw'), AW_USER_HOME: join(home, 'user'), AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_LIBRARY: '1' },
    home
  )
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 1000 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = page.getByRole('textbox', { name: 'Message ada' })
    await box.fill('look at the rules')
    await box.press('Enter')
    const log = page.getByRole('log', { name: 'Conversation with ada' })

    // Level one: the line says what was done, in a few words.
    const fold = log.locator('.of-head')
    await expect(fold).toContainText('Library skipped tdd · read house-research')
    await expect(fold).toContainText('Notes recalled')
    expect((await fold.boundingBox())!.height).toBeLessThan(30)
    await expect(log.locator('.of-row')).toHaveCount(0)

    // After one click: a line for each call, with the reason and what was read.
    await fold.click()
    const rows = log.locator('.of-row')
    await expect(rows).toHaveCount(3)
    await expect(rows.nth(0)).toContainText('no code is written here')
    await expect(rows.nth(1)).toContainText('3 lines')

    // A click on a line shows the call's own card under it, and another folds it again.
    await rows.nth(1).click()
    await expect(log.locator('.of-card .tc')).toHaveCount(1)
    await expect(log.locator('.of-card')).toContainText('house-research')
    await rows.nth(1).click()
    await expect(log.locator('.of-card')).toHaveCount(0)
  } finally {
    await shutdown()
  }
})
