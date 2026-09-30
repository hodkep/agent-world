import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('in a narrow window the panel is a drawer over the office, closed until needed', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-narrow-'))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, home)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1000, height: 700 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    const aside = page.locator('aside')
    // Hiring selects the agent, which opens the drawer over the office instead of squeezing it.
    await expect(aside).toBeVisible()
    expect(await aside.evaluate((el) => getComputedStyle(el).position)).toBe('absolute')
    const stage = (await page.locator('.stage').boundingBox())!
    expect(stage.width).toBeGreaterThan(950)
    await page.getByRole('button', { name: 'Hide panel' }).click()
    await expect(aside).toBeHidden()
  } finally {
    await shutdown()
  }
})
