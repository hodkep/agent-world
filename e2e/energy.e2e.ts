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
    // Focused, as when someone is using the window (the test window itself is never in front).
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true })
    const cap = async () => Number(await page.locator('.stage').getAttribute('data-fpscap'))
    await expect.poll(cap).toBe(20)

    // A newly hired agent walks in from the door to its desk: smooth frames while it walks (at the calm rate the gait looks uneven),
    // and back to the calm rate, well below a 120 Hz screen, once it sits down.
    await hire(page)
    await expect.poll(cap, { timeout: 10_000 }).toBe(60)
    await expect.poll(cap, { timeout: 30_000 }).toBe(20)

    // Hidden or covered: no drawing at all. Shown again: drawing resumes.
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
