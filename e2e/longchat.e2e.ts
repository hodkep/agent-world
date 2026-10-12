import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('a long conversation shows its latest messages and loads earlier ones on request', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-long-'))
  const { app, shutdown } = await launchApp(
    { AW_HOME: join(home, 'aw'), AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_LONG: '400' },
    home
  )
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const log = page.getByRole('log', { name: 'Conversation with ada' })
    await expect(log.getByText('old message 399')).toBeVisible({ timeout: 10_000 })
    await expect(log.getByText('old message 0', { exact: true })).toHaveCount(0)
    const rendered = await log.locator('.msg').count()
    expect(rendered).toBeLessThan(300)
    // Scrolled to the top, where the button is, the message being read stays exactly where it is when older ones load above it.
    await log.evaluate((l) => (l.scrollTop = 0))
    const topOf = (word: string) => log.evaluate((l, w) => {
      const m = [...l.querySelectorAll<HTMLElement>('.msg')].find((x) => x.textContent?.includes(w))
      return m ? Math.round(m.getBoundingClientRect().top - l.getBoundingClientRect().top) : null
    }, word)
    const reading = 'old message 250'
    const before = await topOf(reading)
    expect(before).not.toBeNull()
    await page.getByRole('button', { name: /Show earlier/ }).click()
    expect(await log.locator('.msg').count()).toBeGreaterThan(rendered)
    await page.waitForTimeout(500)
    expect(Math.abs((await topOf(reading))! - before!)).toBeLessThan(3)
  } finally {
    await shutdown()
  }
})
