import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'
import { SLOW } from './waits'

test('the agent\'s calls that change the look are a group of their own, Appearance, in their own colour and in plain words, not "Other"', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-look-group-'))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_USER_HOME: join(home, 'user'), AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_LOOK: '1' }, home)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 1000 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = page.getByRole('textbox', { name: 'Message ada' })
    await box.fill('swap the sides')
    await box.press('Enter')
    const log = page.getByRole('log', { name: 'Conversation with ada' })

    const areas = log.locator('.of-head')
    await expect(areas).toHaveCount(2, { timeout: SLOW })
    await expect(log.locator('.of-head', { hasText: 'Other' })).toHaveCount(0)
    const look = log.locator('.of-area.of-appearance')
    await expect(look.locator('.of-head')).toHaveAttribute('aria-label', /Appearance: checked the look · looked at the layout · changed the look · asked to see the window/)
    // Its own colour, not the muted grey of "Other" or the green of the todos.
    const hue = (sel: string) => log.locator(sel).first().evaluate((el) => getComputedStyle(el.querySelector('.of-nm')!).color)
    const appearance = await hue('.of-area.of-appearance')
    expect(appearance).not.toBe(await hue('.of-area.of-todos'))
    // Opened: a line for each call, in plain words, with the reason the agent gave.
    await look.locator('.of-head').click()
    const rows = look.locator('.of-row')
    await expect(rows).toHaveCount(4)
    await expect(rows.nth(0)).toContainText('Checked what look is in force')
    await expect(rows.nth(1)).toContainText("Looked at the layout of .composer")
    await expect(rows.nth(2)).toContainText('Changed the look (a draft, waiting for you)')
    await expect(rows.nth(2)).toContainText('swap the sides')
    await expect(rows.nth(3)).toContainText('Asked to see the window')
    await page.screenshot({ path: join(__dirname, '..', 'test-results', 'look-group.png'), clip: { x: 760, y: 180, width: 640, height: 420 } })
  } finally {
    await shutdown()
  }
})
