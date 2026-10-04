import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('while an agent works the status counts the seconds', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-turn-'))
  const { app, shutdown } = await launchApp(
    { AW_HOME: join(home, 'aw'), AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '6000', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1' },
    home
  )
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = page.getByRole('textbox', { name: 'Message ada' })
    await box.fill('take your time')
    await box.press('Enter')
    const time = page.locator('.live .live-time')
    await expect(time).toHaveText(/^\d+s$/, { timeout: 15_000 })
    const first = Number((await time.textContent())!.replace('s', ''))
    await expect.poll(async () => Number(((await time.textContent()) ?? '0s').replace('s', '')), { timeout: 10_000 }).toBeGreaterThan(first)
  } finally {
    await shutdown()
  }
})
