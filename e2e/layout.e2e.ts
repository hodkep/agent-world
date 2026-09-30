import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('drag the panel edge to resize it, and fold the agent list away for more room to chat', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-lay-'))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', AW_CLAUDE_PROJECTS: join(home, 'projects') }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()

    const aside = page.locator('aside')
    const width = async () => (await aside.boundingBox())!.width
    const before = await width()
    const grip = page.getByRole('separator', { name: 'Resize the panel' })
    const g = (await grip.boundingBox())!
    await page.mouse.move(g.x + g.width / 2, g.y + 300)
    await page.mouse.down()
    await page.mouse.move(g.x - 200, g.y + 300, { steps: 6 })
    await page.mouse.up()
    expect(await width()).toBeGreaterThan(before + 150)

    // The width is remembered, and a double-click on the edge puts it back.
    await page.reload()
    expect(await width()).toBeGreaterThan(before + 150)
    await grip.dblclick()
    await expect.poll(width).toBeCloseTo(before, -1)
    await page.locator('.roster button', { hasText: 'ada' }).click()

    // Folding the agent list gives the conversation more height.
    const logHeight = async () => (await page.getByRole('log').boundingBox())!.height
    const tall = await logHeight()
    await page.getByRole('button', { name: 'Hide agents' }).click()
    await expect(page.locator('.roster')).toBeHidden()
    await expect(page.locator('.head-compact')).toContainText('ada')
    await expect.poll(logHeight).toBeGreaterThan(tall + 80)
    await page.getByRole('button', { name: 'Show agents' }).click()
    await expect(page.locator('.roster')).toBeVisible()
  } finally {
    await shutdown()
  }
})

test('in the chat, an ask is answered right there and no pop-up opens', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-inline-'))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await page.locator('header').getByRole('button', { name: '+ Agent' }).click()
    await page.getByRole('form', { name: 'Hire an agent' }).getByRole('button', { name: 'Hire' }).click()
    // Chat is the default view: the permission shows inside it, with its options.
    const ask = page.getByRole('region', { name: 'ada is waiting for you' })
    await expect(ask).toContainText('Bash', { timeout: 15_000 })
    await expect(ask).toContainText('pnpm test')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await ask.getByRole('button', { name: 'Allow' }).click()
    await expect(ask).toHaveCount(0)
    await expect(page.getByRole('dialog')).toHaveCount(0)
  } finally {
    await shutdown()
  }
})
