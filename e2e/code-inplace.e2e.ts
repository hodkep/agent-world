import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('code: an agent in a folder that is not a git repository says so, with no Commit or Merge to fail', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-inplace-'))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100', FAKE_CHAT: '1' }, home)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 900 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Code' }).click()
    const note = page.getByRole('note', { name: 'No git worktree' })
    await expect(note).toContainText('works directly in this folder')
    await expect(note).toContainText(home.split('/').pop()!)
    await expect(page.getByRole('button', { name: /Merge into base/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Commit all' })).toHaveCount(0)
  } finally {
    await shutdown()
  }
})
