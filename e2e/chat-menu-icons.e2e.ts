import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('the chat menu rows each carry an icon', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-menu-'))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1' }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    await page.getByRole('button', { name: 'Conversation tools' }).click()
    const menu = page.getByRole('menu', { name: 'Conversation tools' })
    for (const name of ['Search', 'Save notes', 'Copy as Markdown', 'Restore system look', 'Previous look']) await expect(menu.getByRole('menuitem', { name }).locator('svg')).toHaveCount(1)
    await page.screenshot({ path: join(__dirname, '..', 'test-results', 'menu-icons.png'), clip: { x: 1100, y: 100, width: 380, height: 420 } })
  } finally {
    await shutdown()
  }
})
