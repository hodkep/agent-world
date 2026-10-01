import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('the grid shows every agent with its terminal and opens the one you click', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-grid-'))
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), tmp)
    await page.reload()
    await hire(page, { name: 'ada' })
    await hire(page, { name: 'linus' })
    await page.getByRole('button', { name: 'Grid', exact: true }).click()
    const list = page.getByRole('list', { name: 'All agents' })
    await expect(list.getByRole('listitem')).toHaveCount(2)
    await expect(list.getByRole('listitem').first()).toContainText('fake claude', { timeout: 10_000 })
    await list.getByRole('listitem', { name: /^ada/ }).click()
    await expect(page.locator('.hc-name')).toHaveText('ada')
    // In a narrow window the panel opens as a drawer over everything; a click outside closes it.
    if (await page.locator('.scrim').count()) await page.locator('.scrim').click({ position: { x: 5, y: 5 } })
    await page.getByRole('button', { name: 'Grid', exact: true }).click()
    await expect(list).toHaveCount(0)
  } finally {
    await shutdown()
  }
})
