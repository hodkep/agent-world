import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('rename an agent from its header; duplicate names are refused', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-ren-'))
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page, { name: 'ada' })
    await hire(page, { name: 'linus' })

    await page.locator('.agent-head b').dblclick()
    await page.getByLabel('New name').fill('ADA')
    await page.keyboard.press('Enter')
    await expect(page.getByText(/already an agent named ada/i)).toBeVisible()

    await page.getByLabel('New name').fill('Torvalds!')
    await page.keyboard.press('Enter')
    await expect(page.locator('.agent-head b')).toHaveText('torvalds')
    await expect(page.locator('.roster')).toContainText('torvalds')
    expect((await page.evaluate(() => window.aw.listAgents())).map((a) => a.name)).toContain('torvalds')
  } finally {
    await shutdown()
  }
})
