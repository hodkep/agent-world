import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { type Page, expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

/** A dialog that is open as a modal but not drawn blocks the whole page and shows nothing, so it must have a box. */
const drawn = (page: Page) =>
  page.evaluate(() => {
    const d = document.querySelector('dialog[open]')
    if (!d) return 'none open'
    const r = d.getBoundingClientRect()
    return d.getClientRects().length > 0 && r.width > 200 && r.height > 100 ? 'drawn' : `not drawn (${Math.round(r.width)}x${Math.round(r.height)})`
  })

test('the Subagents, Hire and History dialogs are drawn while the side panel is hidden', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-hidden-'))
  const dir = join(tmp, 'proj')
  mkdirSync(dir)
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 900 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
    await page.reload()
    await hire(page)
    await page.locator('header').getByRole('button', { name: 'Hide panel' }).click()
    await expect(page.locator('aside')).toBeHidden()
    for (const name of [/^Subagents/, /\+ Agent/, /^History/]) {
      await page.locator('header').getByRole('button', { name }).first().click()
      await expect.poll(() => drawn(page), { message: `the ${name} dialog`, timeout: 5000 }).toBe('drawn')
      await page.keyboard.press('Escape')
      await expect.poll(() => drawn(page)).toBe('none open')
    }
  } finally {
    await shutdown()
  }
})
