import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('the question card in the chat reads at the chat\'s own text size, closes with its × or Esc, and comes back from the strip', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-need-'))
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_ASKQ: '1' }, home)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 900 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const card = page.locator('.inline-need')
    await expect(card).toBeVisible({ timeout: 15_000 })
    // The question, the options and their notes are all the size of the conversation's text.
    const chat = await page.locator('.chat-log').evaluate((l) => getComputedStyle(l).fontSize)
    for (const sel of ['.qd-q', '.choice .label b', '.choice .desc']) expect(await card.locator(sel).first().evaluate((e) => getComputedStyle(e).fontSize), sel).toBe(chat)

    // The × closes the card and leaves a strip that brings it back.
    await card.getByRole('button', { name: /^Close/ }).click()
    await expect(card).toHaveCount(0)
    const strip = page.getByRole('status').filter({ hasText: 'waiting for you' })
    await expect(strip).toBeVisible()
    await strip.getByRole('button', { name: 'Show' }).click()
    await expect(card).toBeVisible()

    // Esc closes it too, and does not stop the agent: the question is still waiting.
    await page.locator('.chat').press('Escape')
    await expect(card).toHaveCount(0)
    await expect(page.getByRole('status').filter({ hasText: 'Stopping' })).toHaveCount(0)
    await expect(strip).toBeVisible()
  } finally {
    await shutdown()
  }
})
