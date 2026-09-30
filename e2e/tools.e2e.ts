import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('the Tools tab lists MCP servers with their health and installed plugins', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-tools-'))
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Tools' }).click()
    await expect(page.locator('.tools li.health-ok', { hasText: 'fake-docs' })).toContainText('Connected')
    await expect(page.locator('.tools li.health-failed', { hasText: 'fake-db' })).toContainText('Failed to connect')
    await expect(page.locator('.tools li', { hasText: 'fake-plugin@market' })).toContainText('enabled · user')
  } finally {
    await shutdown()
  }
})
