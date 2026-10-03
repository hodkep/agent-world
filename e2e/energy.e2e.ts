import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('the office is not redrawn at the screen\'s full refresh rate, and stops when the window cannot be seen', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-energy-'))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    const cap = async () => Number(await page.locator('.stage').getAttribute('data-fpscap'))
    // Never more than a calm rate by itself (60 is only for the moment after a pan or zoom).
    await expect.poll(cap).toBeGreaterThan(0)
    expect(await cap()).toBeLessThanOrEqual(20)

    // Hidden or covered: no drawing at all. Shown again: drawing resumes.
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true })
    await expect.poll(cap).toBe(20)
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await expect.poll(cap).toBe(0)
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await expect.poll(cap).toBe(20)

    // Zooming asks for smooth drawing for a moment, then it settles back.
    const box = (await page.locator('.stage').boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, -120)
    await expect.poll(cap).toBe(60)
    await expect.poll(cap, { timeout: 5000 }).toBe(20)
  } finally {
    await shutdown()
  }
})
