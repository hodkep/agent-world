import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('the usage tip of the tanks goes when the grid or a dialog comes over the office, even with the pointer still', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-tip-'))
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_COST: '0.3' }, home)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 900 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    const stage = page.locator('.stage')
    const box = (await stage.boundingBox())!
    const at = JSON.parse((await stage.getAttribute('data-power'))!) as { x: number; y: number }
    const tip = page.getByRole('tooltip').filter({ hasText: 'Your usage limits' })
    const hover = async () => {
      await page.mouse.move(box.x + at.x + 3, box.y + at.y + 3)
      await page.mouse.move(box.x + at.x, box.y + at.y)
      await expect(tip).toBeVisible({ timeout: 15_000 })
    }

    // A dialog opened from the keyboard covers the office: the tip does not stay on top of it.
    await hover()
    await page.keyboard.press('Meta+/')
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible()
    await expect(tip).toHaveCount(0)
    await page.keyboard.press('Escape')

    // The grid takes the office's place: the tip does not hang over it.
    await hover()
    await page.getByRole('button', { name: 'Grid', exact: true }).evaluate((b) => (b as HTMLButtonElement).click())
    await expect(page.locator('.stage-ctl')).toHaveCount(0)
    await expect(tip).toHaveCount(0)
    // And moving over the spot where the tanks were, under the grid, brings nothing up.
    await page.mouse.move(box.x + at.x + 5, box.y + at.y + 5)
    await page.mouse.move(box.x + at.x, box.y + at.y)
    await page.waitForTimeout(500)
    await expect(tip).toHaveCount(0)
  } finally {
    await shutdown()
  }
})
