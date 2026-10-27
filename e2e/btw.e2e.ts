import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('a /btw side question is answered in a card in the chat and can be dismissed', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-btw-'))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1' }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = page.getByRole('textbox', { name: 'Message ada' })
    // The command is offered when the slash is typed, with what it does, and picking it leaves the cursor for the question.
    await box.fill('/bt')
    const offer = page.getByRole('option', { name: /btw/ })
    await expect(offer).toContainText('side question')
    await box.press('Tab')
    await expect(box).toContainText('/btw')
    await expect(offer).toHaveCount(0)
    await box.pressSequentially('what is 2+2?')
    await box.press('Enter')
    const card = page.getByRole('region', { name: 'Side question' })
    await expect(card).toContainText('what is 2+2?', { timeout: 25_000 })
    await expect(card).toContainText('It is 4.', { timeout: 25_000 })
    await card.getByRole('button', { name: 'Dismiss' }).click()
    await expect(card).toHaveCount(0, { timeout: 8_000 })
  } finally {
    await shutdown()
  }
})
