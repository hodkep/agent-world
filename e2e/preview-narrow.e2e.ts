import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('the Preview stays whole when its panel is dragged narrow: every control in view, nothing past the edge', async () => {
  const dev = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html' }).end('<title>Shop home</title><h1>Shop</h1>'))
  await new Promise<void>((r) => dev.listen(0, '127.0.0.1', r))
  const port = (dev.address() as AddressInfo).port
  const home = mkdtempSync(join(tmpdir(), 'aw-narrow-'))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_DEV_PORT: String(port) }, home)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 900 })
    await page.evaluate((f) => (localStorage.setItem('aw.folder', f), localStorage.setItem('aw.panelw', '340')), home)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: /Preview/ }).click()
    const nav = page.locator('.preview-nav')
    await expect(nav.getByRole('button', { name: 'Open in browser' })).toBeVisible({ timeout: 15_000 })
    const aside = page.locator('aside').first()
    // Everything in the panel's own rectangle, at the narrowest and a wider width, and with a phone shown.
    const inside = async (label: string) => {
      const box = (await aside.boundingBox())!
      for (const sel of ['.preview-nav button', '.pa-input', '.preview-cap select', '.preview-cap button']) {
        for (const el of await page.locator(sel).all()) {
          const b = await el.boundingBox()
          if (!b) continue
          expect(b.x, `${label}: ${sel} left`).toBeGreaterThanOrEqual(box.x - 1)
          expect(b.x + b.width, `${label}: ${sel} right`).toBeLessThanOrEqual(box.x + box.width + 1)
        }
      }
      expect(await page.locator('.preview').evaluate((el) => el.scrollWidth <= el.clientWidth), `${label}: no sideways scroll`).toBe(true)
    }
    expect((await aside.boundingBox())!.width).toBeLessThanOrEqual(345)
    await inside('narrow')
    // The address has a row to itself, so it can still be read and typed in.
    const bar = page.getByRole('combobox', { name: 'Local address to preview' })
    expect((await bar.boundingBox())!.width).toBeGreaterThan(200)
    if (process.env.AW_SHOTS) await page.screenshot({ path: `${process.env.AW_SHOTS}/preview-narrow.png` })
    await page.getByRole('button', { name: /^Screen size:/ }).click()
    const menu = page.getByRole('menu')
    const m = (await menu.boundingBox())!
    const a = (await aside.boundingBox())!
    expect(m.x).toBeGreaterThanOrEqual(a.x - 1)
    expect(m.x + m.width).toBeLessThanOrEqual(a.x + a.width + 1)
    await page.getByRole('menuitemradio', { name: /Mobile/ }).click()
    await expect(page.locator('.preview-cap select')).toBeVisible()
    await inside('narrow, phone')
    const frame = (await page.locator('.device-frame').boundingBox())!
    expect(frame.x + frame.width).toBeLessThanOrEqual(a.x + a.width + 1)
    if (process.env.AW_SHOTS) await page.screenshot({ path: `${process.env.AW_SHOTS}/preview-narrow-phone.png` })
    // The address list fits too.
    await bar.click()
    const list = (await page.getByRole('listbox', { name: 'Addresses' }).boundingBox())!
    expect(list.x).toBeGreaterThanOrEqual(a.x - 1)
    expect(list.x + list.width).toBeLessThanOrEqual(a.x + a.width + 1)
    await bar.press('Escape')
    // Wider again (as the keyboard resize does it): the controls spread back out, the screen size button names itself.
    await page.evaluate(() => localStorage.setItem('aw.panelw', '700'))
    await page.reload()
    await page.getByRole('tab', { name: /Preview/ }).click()
    await expect(page.locator('.preview-dev .dev-label')).toBeVisible({ timeout: 15_000 })
    await inside('wide')
  } finally {
    await shutdown()
    dev.close()
  }
})
