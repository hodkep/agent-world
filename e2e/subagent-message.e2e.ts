import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('a message to a subagent reads as a card in the chat, and a subagent that had left and is woken by it comes back to the office', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-submsg-'))
  const dir = join(tmp, 'proj')
  mkdirSync(dir)
  const { app, shutdown } = await launchApp(
    { AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_DELEGATE: '1', FAKE_DELEGATE_MS: '500', FAKE_DELEGATE_RESUME: '9000' },
    tmp
  )
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1500, height: 1000 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const stage = page.locator('.stage')
    const seated = async () => (JSON.parse((await stage.getAttribute('data-crew')) ?? '[]') as unknown[]).length

    // It comes, does its work and leaves...
    await expect.poll(seated, { timeout: 20_000 }).toBe(1)
    await expect.poll(seated, { timeout: 20_000 }).toBe(0)
    // ...and the message that wakes it (Claude says nothing about it) puts it back at its seat.
    await expect.poll(seated, { timeout: 30_000 }).toBe(1)

    // In the chat the call is a card with the subagent named by its task, not the raw JSON.
    const card = page.getByRole('article', { name: /^Message to subagent/ })
    await expect(card).toBeVisible()
    await expect(card).toContainText('Look into part 1')
    await expect(card).toContainText('Fix the dialog')
    await expect(card).toContainText('Woke it up')
    await expect(page.getByRole('log').getByText('"resumedAgentId"')).toHaveCount(0)
    // The whole message is in the card (folded to two lines when it is long).
    await expect(card).toContainText('Fix the whole dialog and check it.')
  } finally {
    await shutdown()
  }
})
