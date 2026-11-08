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
    // Scrolling up to the top asks for the earlier rows by itself (the button is for whoever has not scrolled), so the load can start before any look at the page. The
    // reader is therefore measured while still short of the top (more than 160 px, where the load starts), by the wheel the way a reader goes: a script moving the view
    // is not the reader leaving the end, and the conversation keeps following its end through that.
    const box = (await log.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    const topOf = (word: string) => log.evaluate((l, w) => {
      const m = [...l.querySelectorAll<HTMLElement>('.msg')].find((x) => x.textContent?.includes(w))
      return m ? Math.round(m.getBoundingClientRect().top - l.getBoundingClientRect().top) : null
    }, word)
    const scrollTop = () => log.evaluate((l) => l.scrollTop)
    // Up to a place short of the top (180 to 600 px), where nothing has been asked for yet.
    await expect.poll(async () => {
      const at = await scrollTop()
      if (at > 600) await page.mouse.wheel(0, -Math.min(at - 400, 3_000))
      return (await scrollTop()) <= 600 && (await scrollTop()) >= 180
    }).toBe(true)
    const reading = 'old message 250'
    const before = await topOf(reading)
    const from = await scrollTop()
    expect(before).not.toBeNull()
    expect(await log.locator('.msg').count()).toBe(rendered)
    // The rest of the way up, and the load that starts there: by the wheel's scroll or, if that has not started yet, by the button. The message being read stays where
    // it stood at the top: where it was, and as far down as the view had still to go.
    // The wheel that loads the rows is the last one: another would take the reader up to the new top, which is the reader moving, not the view failing to hold its place.
    const rowsNow = () => log.locator('.msg').count()
    await expect.poll(async () => {
      if ((await rowsNow()) <= rendered) await page.mouse.wheel(0, -100_000)
      if ((await rowsNow()) > rendered) return true
      const button = page.getByRole('button', { name: /Show earlier/ })
      if ((await scrollTop()) === 0 && (await button.count()) > 0) await button.click({ timeout: 2_000 }).catch(() => undefined)
      return (await rowsNow()) > rendered
    }, { timeout: 30_000 }).toBe(true)
    await page.waitForTimeout(500)
    expect(Math.abs((await topOf(reading))! - (before! + from))).toBeLessThan(3)
  } finally {
    await shutdown()
  }
})
