import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('the bottom strip shows the subscription limits once an agent reports them', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-use-'))
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_COST: '0.3' }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await expect(page.locator('.limits')).toContainText('first reply')
    await hire(page)
    const five = page.getByRole('meter', { name: '5-hour' })
    await expect(five).toHaveAttribute('aria-valuenow', '38', { timeout: 15_000 })
    await expect(five).toContainText('resets in 2h')
    const week = page.getByRole('meter', { name: 'Weekly' })
    await expect(week).toHaveAttribute('aria-valuenow', '21')
    await expect(week).toContainText('resets in 3d')
    await page.screenshot({ path: join(__dirname, '..', 'test-results', 'usage.png') })
  } finally {
    await shutdown()
  }
})
