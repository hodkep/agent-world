import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { approve, hire, launchApp } from './launch'

test('a planning agent\'s plan is reviewed from the panel, and its tasks are listed', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-plan-'))
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_PLAN: '1' }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await approve(page)

    await page.locator('.need-row', { hasText: 'plan' }).click({ timeout: 15_000 })
    const card = page.getByRole('dialog')
    await expect(card).toContainText('1. Create hello.txt with hi.', { timeout: 10_000 })
    await expect(page.locator('.tasks')).toContainText('Write hello.txt')
    await expect(page.locator('.task.is-in_progress')).toContainText('Write hello.txt')

    await card.getByRole('button', { name: 'Approve · review each edit' }).click()
    await expect(page.locator('.term-host:visible')).toContainText('chose option 2', { timeout: 10_000 })
    await expect(card).toHaveCount(0)
  } finally {
    await shutdown()
  }
})
