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
    // Out is stepped from where the view is: the office cannot be shown smaller than its fitted size, which on a 1x screen is the start, so it is zoomed in first.
    const once = (await view()).scale
    await page.getByRole('button', { name: 'Zoom in' }).click()
    await expect.poll(async () => (await view()).scale).toBeGreaterThan(once)
    const twice = (await view()).scale
    await page.getByRole('button', { name: 'Zoom out' }).click()
    await expect.poll(async () => (await view()).scale).toBeLessThan(twice)
    await page.getByRole('button', { name: 'Zoom out' }).click()
    await page.getByRole('button', { name: 'Zoom out' }).click()
    await expect.poll(async () => (await view()).scale).toBeLessThanOrEqual(start.scale)

    // A swipe on a trackpad sends dozens of small wheel events: it is a step or two, not a rush to the closest view.
    await page.getByRole('button', { name: 'Reset' }).click()
    await expect.poll(async () => (await view()).scale).toBeCloseTo(start.scale, 1)
    const sb = (await stage.boundingBox())!
    await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2)
    // The events of a swipe, a few milliseconds apart, sent from inside the page: sent one by one from here, each waits for the window to answer, which a slow machine with a hidden window does too slowly for them to count as one swipe.
    await page.evaluate(
      async ({ x, y }) => {
        const target = document.elementFromPoint(x, y)!
        for (let i = 0; i < 40; i++) {
          target.dispatchEvent(new WheelEvent('wheel', { deltaY: -4, deltaMode: 0, clientX: x, clientY: y, bubbles: true, cancelable: true }))
          await new Promise((r) => setTimeout(r, 5))
        }
      },
      { x: sb.x + sb.width / 2, y: sb.y + sb.height / 2 }
    )
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
    // A step is at least the next whole scale, so from a whole one (a 1x screen) it is a doubling.
    expect(notch).toBeLessThanOrEqual(Math.max(start.scale * 1.55, Math.floor(start.scale + 1e-6) + 1))

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
