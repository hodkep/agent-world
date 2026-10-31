import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('project memory: notes you add are listed, and can be forgotten', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-mem-'))
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Agent Memory' }).click()
    await page.getByLabel('Add a note').fill('Tests run with pnpm test')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    const item = page.locator('.memory li', { hasText: 'Tests run with pnpm test' })
    await expect(item).toContainText('you')
    await item.getByRole('button', { name: /^Forget/ }).click()
    await expect(item).toHaveCount(0)
  } finally {
    await shutdown()
  }
})
