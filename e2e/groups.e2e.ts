import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { headMenu, hire, launchApp } from './launch'

test('an agent can be put in a named group that heads it in the list', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-group-'))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await headMenu(page, 'Group…')
    await page.getByLabel('Group', { exact: true }).fill('backend')
    await page.getByLabel('Group', { exact: true }).press('Enter')
    await expect(page.locator('.group-head')).toHaveText('backend')
    await page.reload()
    await expect(page.locator('.group-head')).toHaveText('backend')
  } finally {
    await shutdown()
  }
})
