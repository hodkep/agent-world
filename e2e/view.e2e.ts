import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp } from './launch'

test('zoom buttons step the view and Fit office fills the window with the office', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-view-'))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs') }, home)
  try {
    const page = await app.firstWindow()
    const stage = page.locator('.stage')
    const view = async () => JSON.parse((await stage.getAttribute('data-view'))!) as { scale: number; x: number; y: number }
    await expect.poll(async () => (await stage.getAttribute('data-view')) !== null).toBe(true)
    const start = await view()

    await page.getByRole('button', { name: 'Zoom in' }).click()
    await expect.poll(async () => (await view()).scale).toBeGreaterThan(start.scale)
    await page.getByRole('button', { name: 'Zoom out' }).click()
    await page.getByRole('button', { name: 'Zoom out' }).click()
    await expect.poll(async () => (await view()).scale).toBeLessThan(start.scale)

    // A swipe on a trackpad sends dozens of small wheel events: it is a step or two, not a rush to the closest view.
    await page.getByRole('button', { name: 'Reset' }).click()
    await expect.poll(async () => (await view()).scale).toBeCloseTo(start.scale, 1)
    const sb = (await stage.boundingBox())!
    await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2)
    for (let i = 0; i < 40; i++) await page.mouse.wheel(0, -4)
    await page.waitForTimeout(400)
    const swiped = (await view()).scale
    expect(swiped).toBeGreaterThan(start.scale)
    expect(swiped).toBeLessThanOrEqual(start.scale * 2.01)
    // One notch of a mouse wheel is one step.
    await page.getByRole('button', { name: 'Reset' }).click()
    await page.waitForTimeout(300)
    await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2)
    await page.mouse.wheel(0, -120)
    await page.waitForTimeout(400)
    const notch = (await view()).scale
    expect(notch).toBeGreaterThan(start.scale)
    expect(notch).toBeLessThanOrEqual(start.scale * 1.55)

    // Fit: the 480x272 office spans the window on its tighter axis and is centred.
    await page.getByRole('button', { name: 'Fit office' }).click()
    const box = (await stage.boundingBox())!
    await expect
      .poll(async () => {
        const v = await view()
        const w = 480 * v.scale
        const h = 272 * v.scale
        const fillsW = w / box.width
        const fillsH = h / box.height
        const centred = Math.abs(v.x + w / 2 - box.width / 2) < 2 && Math.abs(v.y + h / 2 - box.height / 2) < 2
        return centred && Math.max(fillsW, fillsH) > 0.95 && Math.max(fillsW, fillsH) <= 1
      })
      .toBe(true)

    await page.getByRole('button', { name: 'Reset' }).click()
    await expect.poll(async () => (await view()).scale).toBeCloseTo(start.scale, 1)
  } finally {
    await shutdown()
  }
})
