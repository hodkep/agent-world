import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('the tanks on the lawn show the subscription limits once an agent reports them', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-use-'))
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_COST: '0.3' }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await expect(page.getByRole('group', { name: 'Claude usage limits' })).toHaveCount(0)
    await hire(page)
    // Hovering the tanks on the back lawn says what is left (the fake reports 38% and 21% used).
    const stage = page.locator('.stage')
    const box = (await stage.boundingBox())!
    const at = JSON.parse((await stage.getAttribute('data-power'))!) as { x: number; y: number }
    await page.mouse.move(box.x + at.x, box.y + at.y)
    await expect(page.getByRole('tooltip').getByRole('img', { name: /62% left, resets in 2h/ })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('tooltip').getByRole('img', { name: /79% left, resets in 3d/ })).toBeVisible()
    await page.screenshot({ path: join(__dirname, '..', 'test-results', 'usage.png') })
  } finally {
    await shutdown()
  }
})
