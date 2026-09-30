import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('a command running under the agent is listed in chat and can be stopped', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-procs-'))
  const { app, shutdown } = await launchApp(
    { AW_HOME: join(home, 'aw'), AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_CHILD: '1' },
    home
  )
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const bar = page.getByLabel('Running processes')
    await expect(bar).toContainText('sleep 300', { timeout: 10_000 })
    await bar.getByRole('button', { name: /^Stop sleep/ }).click()
    await expect(bar).toHaveCount(0, { timeout: 8_000 })
  } finally {
    await shutdown()
  }
})
