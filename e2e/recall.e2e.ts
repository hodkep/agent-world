import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('Ctrl+R searches earlier messages and cycles through older matches', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-recall-'))
  const { app, shutdown } = await launchApp(
    { AW_HOME: join(home, 'aw'), AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1' },
    home
  )
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = page.getByRole('textbox', { name: 'Message ada' })
    for (const m of ['fix login one', 'add tests', 'fix login two']) {
      await box.fill(m)
      await box.press('Enter')
      await expect(box).toHaveValue('')
    }
    await box.fill('login')
    await box.press('Control+r')
    await expect(box).toHaveValue('fix login two')
    await box.press('Control+r')
    await expect(box).toHaveValue('fix login one')
  } finally {
    await shutdown()
  }
})
